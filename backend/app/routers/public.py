from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Championship
from app.services import championship_standings, get_rally, not_found, rally_results_payload, scoring_table

router = APIRouter(prefix="/api")


def _current(db: Session) -> Championship:
    championship = db.scalar(select(Championship).where(Championship.is_current.is_(True)))
    if championship is None:
        raise not_found("Championnat en cours")
    return championship


@router.get("/championship/current")
def current_championship(db: Session = Depends(get_db)):
    c = _current(db)
    return {
        "id": c.id,
        "name": c.name,
        "mode": c.scoring_mode,
        "rallies": [
            {
                "id": r.id,
                "name": r.name,
                "order_index": r.order_index,
                "event_date": r.event_date,
                "has_results": bool(r.results),
            }
            for r in c.rallies
        ],
    }


@router.get("/championship/current/standings")
def current_standings(db: Session = Depends(get_db)):
    c = _current(db)
    return {"championship": {"id": c.id, "name": c.name}, **championship_standings(db, c)}


@router.get("/rallies/{rally_id}")
def rally(rally_id: int, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    c = r.championship
    scoring = scoring_table(c) if c.scoring_mode == "custom" else None
    return {
        "id": r.id,
        "name": r.name,
        "event_date": r.event_date,
        "championship": {"id": c.id, "name": c.name, "mode": c.scoring_mode},
        "results": rally_results_payload(r, scoring),
    }
