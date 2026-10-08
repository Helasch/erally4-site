from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Championship, Driver, Rally
from app.services import (
    championship_standings,
    display_name,
    driver_profile,
    drivers_overview,
    get_championship,
    get_rally,
    home_payload,
    rally_dates,
    rally_statuses,
    not_found,
    rally_results_payload,
    read_settings,
    scoring_table,
)

router = APIRouter(prefix="/api")


def _current(db: Session) -> Championship | None:
    # Aucun championnat en cours n'est un état normal (début de saison) : les routes répondent null, pas 404
    return db.scalar(select(Championship).where(Championship.is_current.is_(True)))


def _rally_summary(rally: Rally, index: int, status: str) -> dict:
    winner = rally.results[0] if rally.results else None
    return {
        "id": rally.id,
        "round": index + 1,
        "name": rally.name,
        "order_index": rally.order_index,
        **rally_dates(rally),
        "status": status,
        "has_results": winner is not None,
        "result_count": len(rally.results),
        "winner": (
            {"name": display_name(winner.driver, winner.raw_name), "platform": winner.platform}
            if winner
            else None
        ),
    }


def _championship_payload(c: Championship) -> dict:
    statuses = rally_statuses(c)
    return {
        "id": c.id,
        "name": c.name,
        "is_current": c.is_current,
        "mode": c.scoring_mode,
        "rallies": [_rally_summary(r, i, statuses[r.id]) for i, r in enumerate(c.rallies)],
    }


@router.get("/championships")
def list_championships(db: Session = Depends(get_db)):
    rows = db.scalars(select(Championship).order_by(Championship.is_current.desc(), Championship.id.desc()))
    return [{"id": c.id, "name": c.name, "is_current": c.is_current} for c in rows]


@router.get("/championships/{championship_id}")
def championship(championship_id: int, db: Session = Depends(get_db)):
    return _championship_payload(get_championship(db, championship_id))


@router.get("/championships/{championship_id}/standings")
def standings(championship_id: int, apres: int | None = None, db: Session = Depends(get_db)):
    """Classement général ; `apres` = identifiant du rallye après lequel on veut le classement."""
    c = get_championship(db, championship_id)
    return {"championship": {"id": c.id, "name": c.name}, **championship_standings(db, c, apres)}


@router.get("/home")
def home(db: Session = Depends(get_db)):
    c = _current(db)
    if c is None:
        return None
    return {**home_payload(db, c), "calendar": _championship_payload(c)["rallies"]}


@router.get("/settings")
def public_settings(db: Session = Depends(get_db)):
    return read_settings(db, public_only=True)


@router.get("/championship/current")
def current_championship(db: Session = Depends(get_db)):
    c = _current(db)
    return _championship_payload(c) if c is not None else None


@router.get("/championship/current/standings")
def current_standings(db: Session = Depends(get_db)):
    c = _current(db)
    if c is None:
        return None
    return {"championship": {"id": c.id, "name": c.name}, **championship_standings(db, c)}


@router.get("/rallies/{rally_id}")
def rally(rally_id: int, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    c = r.championship
    scoring = scoring_table(c) if c.scoring_mode == "custom" else None
    statuses = rally_statuses(c)
    siblings = [_rally_summary(x, i, statuses[x.id]) for i, x in enumerate(c.rallies)]
    index = next(i for i, x in enumerate(c.rallies) if x.id == r.id)
    return {
        "id": r.id,
        "round": index + 1,
        "name": r.name,
        **rally_dates(r),
        "status": statuses[r.id],
        "championship": {"id": c.id, "name": c.name, "mode": c.scoring_mode},
        "rallies": siblings,
        "results": rally_results_payload(r, scoring),
    }


def _season(db: Session, saison: int | None) -> Championship | None:
    if saison is not None:
        return get_championship(db, saison)
    return db.scalar(select(Championship).where(Championship.is_current.is_(True)))


@router.get("/drivers")
def drivers(saison: int | None = None, db: Session = Depends(get_db)):
    """Pilotes du championnat (en cours par défaut) avec leurs chiffres principaux."""
    c = _season(db, saison)
    if c is None:
        return {"championship": None, "drivers": []}
    return {"championship": {"id": c.id, "name": c.name}, "drivers": drivers_overview(db, c)}


@router.get("/drivers/{driver_id}")
def driver(driver_id: int, saison: int | None = None, db: Session = Depends(get_db)):
    d = db.get(Driver, driver_id)
    if d is None:
        raise not_found("Pilote")
    return driver_profile(db, d, _season(db, saison))
