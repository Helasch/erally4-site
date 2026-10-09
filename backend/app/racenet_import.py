"""Import direct depuis RaceNet : aperçu puis enregistrement d'une épreuve complète
(général du rallye, spéciales, classement du championnat)."""

import json
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.csv_import import ANONYMOUS_NAME, format_time_ms
from app.models import Championship, Driver, Import, Rally, Stage, StageResult
from app.racenet import Entry, ParsedEvent, RacenetError, parse_event, strip_identities
from app.scoring import suggest_for_rally
from app.services import (
    _rally_history,
    _store_raw_file,
    get_or_create_driver,
    link_pending_accounts,
    replace_rally_results,
    replace_standings,
    validate_driver_name,
)


def parse_or_422(payload: dict) -> ParsedEvent:
    try:
        return parse_event(payload)
    except RacenetError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Données RaceNet inattendues : {exc}."
        ) from None


# --- Pilotes ----------------------------------------------------------------------------


@dataclass
class DriverPlan:
    entry: Entry
    driver: Driver | None
    # known : déjà reconnu · renamed : a changé de pseudo · attach : pilote existant, reconnu par son pseudo
    # new : nouveau pilote · anonymous : « WRC Player » inconnu, à identifier · conflict : pseudo déjà pris
    action: str


def plan_drivers(db: Session, event: ParsedEvent) -> dict[str, DriverPlan]:
    entries = event.drivers()
    by_key = {
        d.racenet_id: d for d in db.scalars(select(Driver).where(Driver.racenet_id.in_(list(entries)))) if d.racenet_id
    }
    names = [e.name.lower() for e in entries.values() if not e.is_anonymous]
    by_name = {d.name.lower(): d for d in db.scalars(select(Driver).where(func.lower(Driver.name).in_(names)))}

    plans: dict[str, DriverPlan] = {}
    for key, entry in entries.items():
        known = by_key.get(key)
        if known is not None:
            if entry.is_anonymous or known.name == entry.name:
                plans[key] = DriverPlan(entry, known, "known")
            else:
                taken = by_name.get(entry.name.lower())
                action = "renamed" if taken is None or taken.id == known.id else "conflict"
                plans[key] = DriverPlan(entry, known, action)
        elif entry.is_anonymous:
            plans[key] = DriverPlan(entry, None, "anonymous")
        else:
            existing = by_name.get(entry.name.lower())
            if existing is None:
                plans[key] = DriverPlan(entry, None, "new")
            elif existing.racenet_id is None:
                plans[key] = DriverPlan(entry, existing, "attach")
            else:
                # Pseudo repris par un autre joueur RaceNet : à identifier à la main
                plans[key] = DriverPlan(entry, None, "anonymous")
    return plans


def _apply_plans(db: Session, plans: dict[str, DriverPlan], resolutions: dict[str, str]) -> dict[str, Driver | None]:
    drivers: dict[str, Driver | None] = {}
    for key, plan in plans.items():
        driver = plan.driver
        if plan.action == "renamed":
            driver.name = plan.entry.name
        elif plan.action == "attach":
            driver.racenet_id = key
        elif plan.action == "new":
            driver = get_or_create_driver(db, plan.entry.name)
            driver.racenet_id = key
        elif plan.action == "anonymous":
            name = (resolutions.get(key) or "").strip()
            driver = get_or_create_driver(db, name) if name else None
            if driver is not None and driver.racenet_id is None:
                driver.racenet_id = key
        drivers[key] = driver
        db.flush()
    return drivers


def _parse_resolutions(raw: dict[str, str]) -> dict[str, str]:
    resolved = {}
    for key, name in raw.items():
        if name and str(name).strip():
            resolved[str(key)] = validate_driver_name(str(name))
    return resolved


# --- Rallye correspondant ------------------------------------------------------------------


def suggested_rally(championship: Championship, event: ParsedEvent, events: list[dict]) -> Rally | None:
    """Le rallye déjà associé à l'épreuve, sinon celui de même rang dans le championnat."""
    for rally in championship.rallies:
        if rally.racenet_event_id == event.event_id:
            return rally
    index = next((i for i, e in enumerate(events) if isinstance(e, dict) and e.get("id") == event.event_id), None)
    rallies = sorted(championship.rallies, key=lambda r: r.order_index)
    if index is not None and index < len(rallies) and rallies[index].racenet_event_id is None:
        return rallies[index]
    return None


def standings_apply(event: ParsedEvent, events: list[dict]) -> bool:
    """Le classement du championnat récupéré est celui du moment : il ne correspond à « après cette
    épreuve » que si c'est la dernière épreuve terminée."""
    finished = [e.get("id") for e in events if isinstance(e, dict) and e.get("status") == 2]
    return bool(event.standings) and event.status == 2 and bool(finished) and finished[-1] == event.event_id


# --- Aperçu -------------------------------------------------------------------------------


def _entry_ref(entry: Entry, plan: DriverPlan) -> dict:
    return {
        "racenet_id": entry.racenet_id,
        "name": plan.driver.name if plan.action == "known" and plan.driver else entry.name,
        "status": plan.action,
    }


def build_racenet_preview(
    db: Session, championship: Championship, rally: Rally | None, payload: dict
) -> dict:
    event = parse_or_422(payload)
    events = payload["championship"]["events"]
    rally = rally or suggested_rally(championship, event, events)
    plans = plan_drivers(db, event)

    warnings = []
    if event.status != 2:
        warnings.append("Cette épreuve n'est pas terminée sur RaceNet : les résultats sont provisoires.")
    if rally is not None and rally.results:
        warnings.append(f"Les résultats déjà importés pour « {rally.name} » seront remplacés.")
        penalties = sum(1 for r in rally.results if r.driver_id is not None and (r.penalty_ms or r.disqualified))
        if penalties:
            warnings.append(f"{penalties} pénalité(s) déjà décidée(s) seront conservées pour les mêmes pilotes.")
    include_standings = standings_apply(event, events)
    if event.standings and not include_standings:
        warnings.append(
            "Le classement du championnat ne sera pas importé : RaceNet donne le classement actuel, "
            "qui ne correspond pas à l'après-rallye de cette épreuve."
        )
    if include_standings and championship.scoring_mode == "custom":
        warnings.append(
            "Barème personnalisé : le classement général est calculé à partir des rallyes, "
            "le classement RaceNet du championnat est enregistré mais pas affiché."
        )
    for plan in plans.values():
        if plan.action == "conflict":
            warnings.append(
                f"« {plan.driver.name} » s'appelle maintenant « {plan.entry.name} » sur RaceNet, mais ce pseudo est "
                "déjà utilisé par un autre pilote du site : fusionnez-les depuis la page Pilotes."
            )

    history = _rally_history(db, championship, rally.id if rally else None)
    names_in_event = {e.name for e in event.drivers().values() if not e.is_anonymous}

    def anonymous(plan: DriverPlan) -> dict:
        e = plan.entry
        return {
            "racenet_id": e.racenet_id,
            "vehicle": e.vehicle,
            "platform": e.platform,
            "suggestions": [s.__dict__ for s in suggest_for_rally(e.vehicle, e.platform, history, names_in_event)],
        }

    stages = []
    for stage in event.stages:
        winner = stage.entries[0] if stage.entries else None
        stages.append(
            {
                "number": stage.number,
                "name": stage.name,
                "distance_km": stage.distance_km,
                "conditions": stage.conditions,
                "time_of_day": stage.time_of_day,
                "entrants": len(stage.entries),
                "winner": (
                    {**_entry_ref(winner[0], plans[winner[0].racenet_id]), "time": format_time_ms(winner[0].time_ms)}
                    if winner
                    else None
                ),
            }
        )

    return {
        "event": {
            "id": event.event_id,
            "location": event.location,
            "status": event.status,
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
        },
        "rally_id": rally.id if rally else None,
        "stages": stages,
        "overall": [
            {
                **_entry_ref(e, plans[e.racenet_id]),
                "position": position,
                "vehicle": e.vehicle,
                "platform": e.platform,
                "time": format_time_ms(total),
                "diff": format_time_ms(diff),
            }
            for e, position, total, diff in event.overall
        ],
        "standings": (
            [
                {**_entry_ref(e, plans[e.racenet_id]), "position": i, "points": e.points}
                for i, e in enumerate(event.standings, start=1)
            ]
            if include_standings
            else []
        ),
        "drivers": {
            "new": sorted(p.entry.name for p in plans.values() if p.action == "new"),
            "renamed": [{"from": p.driver.name, "to": p.entry.name} for p in plans.values() if p.action == "renamed"],
            "attached": sum(1 for p in plans.values() if p.action == "attach"),
            "anonymous": [anonymous(p) for p in plans.values() if p.action == "anonymous"],
        },
        "warnings": warnings,
    }


# --- Enregistrement -------------------------------------------------------------------------


def commit_racenet_import(
    db: Session,
    championship: Championship,
    rally: Rally,
    payload: dict,
    resolutions: dict[str, str],
    update_dates: bool,
    admin_id: int,
) -> Import:
    if rally.championship_id != championship.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ce rallye n'appartient pas au championnat.")
    event = parse_or_422(payload)
    events = payload["championship"]["events"]
    drivers = _apply_plans(db, plan_drivers(db, event), _parse_resolutions(resolutions))

    def raw_name(entry: Entry) -> str:
        return entry.name if drivers.get(entry.racenet_id) or not entry.is_anonymous else ANONYMOUS_NAME

    replace_rally_results(
        db,
        rally,
        [
            (position, drivers[e.racenet_id], raw_name(e), e.vehicle, total, diff, e.platform)
            for e, position, total, diff in event.overall
        ],
    )

    rally.stages.clear()
    db.flush()
    for parsed in event.stages:
        stage = Stage(
            number=parsed.number,
            name=parsed.name,
            distance_km=parsed.distance_km,
            conditions=parsed.conditions,
            time_of_day=parsed.time_of_day,
        )
        stage.results = [
            StageResult(
                position=position,
                driver_id=drivers[e.racenet_id].id if drivers[e.racenet_id] else None,
                raw_name=raw_name(e),
                vehicle=e.vehicle,
                platform=e.platform,
                time_ms=e.time_ms,
                penalty_ms=e.penalty_ms,
                diff_ms=diff,
            )
            for e, position, diff in parsed.entries
        ]
        rally.stages.append(stage)

    if standings_apply(event, events):
        replace_standings(
            db,
            championship,
            rally,
            [(i, drivers[e.racenet_id], raw_name(e), e.points) for i, e in enumerate(event.standings, start=1)],
        )

    # Une épreuve RaceNet ne correspond qu'à un seul rallye du championnat
    for other in championship.rallies:
        if other.id != rally.id and other.racenet_event_id == event.event_id:
            other.racenet_event_id = None
    rally.racenet_event_id = event.event_id
    championship.racenet_id = event.championship_id
    if update_dates and event.starts_at and event.ends_at:
        rally.starts_at, rally.ends_at = event.starts_at, event.ends_at

    archive = json.dumps(strip_identities(payload), ensure_ascii=False).encode()
    record = Import(
        kind="racenet",
        championship_id=championship.id,
        rally_id=rally.id,
        original_filename=f"RaceNet — {event.location}"[:255],
        stored_filename=_store_raw_file(archive, f"racenet-{event.event_id}.json"),
        row_count=len(event.overall),
        admin_id=admin_id,
    )
    db.add(record)
    db.commit()
    link_pending_accounts(db)
    db.expire_all()
    return record
