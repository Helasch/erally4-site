from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Championship, Rally
from app.services import (
    championship_standings,
    get_championship,
    get_rally,
    not_found,
    rally_results_payload,
    scoring_table,
)

router = APIRouter(prefix="/api")


def _current(db: Session) -> Championship:
    championship = db.scalar(select(Championship).where(Championship.is_current.is_(True)))
    if championship is None:
        raise not_found("Championnat en cours")
    return championship


def _rally_summary(rally: Rally, index: int) -> dict:
    winner = rally.results[0] if rally.results else None
    return {
        "id": rally.id,
        "round": index + 1,
        "name": rally.name,
        "order_index": rally.order_index,
        "event_date": rally.event_date,
        "has_results": winner is not None,
        "result_count": len(rally.results),
        "winner": (
            {"name": winner.driver.name if winner.driver else winner.raw_name, "platform": winner.platform}
            if winner
            else None
        ),
    }


def _championship_payload(c: Championship) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "is_current": c.is_current,
        "mode": c.scoring_mode,
        "rallies": [_rally_summary(r, i) for i, r in enumerate(c.rallies)],
    }


@router.get("/championships")
def list_championships(db: Session = Depends(get_db)):
    rows = db.scalars(select(Championship).order_by(Championship.is_current.desc(), Championship.id.desc()))
    return [{"id": c.id, "name": c.name, "is_current": c.is_current} for c in rows]


@router.get("/championships/{championship_id}")
def championship(championship_id: int, db: Session = Depends(get_db)):
    return _championship_payload(get_championship(db, championship_id))


@router.get("/championships/{championship_id}/standings")
def standings(championship_id: int, db: Session = Depends(get_db)):
    c = get_championship(db, championship_id)
    return {"championship": {"id": c.id, "name": c.name}, **championship_standings(db, c)}


@router.get("/championship/current")
def current_championship(db: Session = Depends(get_db)):
    return _championship_payload(_current(db))


@router.get("/championship/current/standings")
def current_standings(db: Session = Depends(get_db)):
    c = _current(db)
    return {"championship": {"id": c.id, "name": c.name}, **championship_standings(db, c)}


@router.get("/rallies/{rally_id}")
def rally(rally_id: int, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    c = r.championship
    scoring = scoring_table(c) if c.scoring_mode == "custom" else None
    siblings = [_rally_summary(x, i) for i, x in enumerate(c.rallies)]
    index = next(i for i, x in enumerate(c.rallies) if x.id == r.id)
    return {
        "id": r.id,
        "round": index + 1,
        "name": r.name,
        "event_date": r.event_date,
        "championship": {"id": c.id, "name": c.name, "mode": c.scoring_mode},
        "rallies": siblings,
        "results": rally_results_payload(r, scoring),
    }
