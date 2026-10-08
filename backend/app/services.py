"""Logique métier qui s'appuie sur la base : classements, aperçu et enregistrement des imports."""

import os
import re
import secrets
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.csv_import import ANONYMOUS_NAME, ChampionshipRow, ParsedCsv, RallyRow, format_time_ms
from app.models import Championship, Driver, Import, RacenetStanding, Rally, RallyResult
from app.scoring import (
    ChampionshipCandidate,
    PastRallyResult,
    RallyFinish,
    compute_custom_standings,
    suggest_for_championship,
    suggest_for_rally,
)


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} introuvable.")


def get_championship(db: Session, championship_id: int) -> Championship:
    championship = db.get(Championship, championship_id)
    if championship is None:
        raise not_found("Championnat")
    return championship


def get_rally(db: Session, rally_id: int) -> Rally:
    rally = db.get(Rally, rally_id)
    if rally is None:
        raise not_found("Rallye")
    return rally


def scoring_table(championship: Championship) -> dict[int, int]:
    return {p.position: p.points for p in championship.scoring}


# --- Pilotes --------------------------------------------------------------------


def validate_driver_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Le pseudo ne peut pas être vide.")
    if len(name) > 64:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pseudo trop long (64 caractères max).")
    if name.lower() == ANONYMOUS_NAME.lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"« {ANONYMOUS_NAME} » n'est pas un pseudo valide.")
    return name


def get_or_create_driver(db: Session, name: str) -> Driver:
    name = validate_driver_name(name)
    driver = db.scalar(select(Driver).where(Driver.name == name))
    if driver is None:
        driver = Driver(name=name)
        db.add(driver)
        db.flush()
    return driver


def display_name(driver: Driver | None, raw_name: str) -> str:
    return driver.name if driver else raw_name


# --- Classements ----------------------------------------------------------------


def rally_results_payload(rally: Rally, scoring: dict[int, int] | None) -> list[dict]:
    return [
        {
            "id": r.id,
            "position": r.position,
            "name": display_name(r.driver, r.raw_name),
            "driver_id": r.driver_id,
            "identified": r.driver_id is not None,
            "vehicle": r.vehicle,
            "platform": r.platform,
            "time": format_time_ms(r.time_ms),
            "diff": format_time_ms(r.diff_ms),
            "points": scoring.get(r.position, 0) if scoring is not None else None,
        }
        for r in rally.results
    ]


def championship_standings(db: Session, championship: Championship) -> dict:
    rallies = [r for r in championship.rallies]
    if championship.scoring_mode == "custom":
        scoring = scoring_table(championship)
        per_rally = [
            [
                RallyFinish(r.driver_id, r.driver.name, r.position)
                for r in rally.results
                if r.driver_id is not None
            ]
            for rally in rallies
        ]
        entries = compute_custom_standings(per_rally, scoring)
        unidentified = sum(1 for rally in rallies for r in rally.results if r.driver_id is None)
        return {
            "mode": "custom",
            "rallies": [{"id": r.id, "name": r.name} for r in rallies],
            "unidentified": unidentified,
            "standings": [
                {
                    "position": e.position,
                    "name": e.name,
                    "driver_id": e.driver_id,
                    "identified": True,
                    "points": e.points,
                    "per_rally": e.per_rally,
                }
                for e in entries
            ],
        }

    rows = db.scalars(
        select(RacenetStanding)
        .where(RacenetStanding.championship_id == championship.id)
        .order_by(RacenetStanding.position)
    ).all()
    return {
        "mode": "racenet",
        "rallies": [{"id": r.id, "name": r.name} for r in rallies],
        "unidentified": sum(1 for r in rows if r.driver_id is None),
        "standings": [
            {
                "id": r.id,
                "position": r.position,
                "name": display_name(r.driver, r.raw_name),
                "driver_id": r.driver_id,
                "identified": r.driver_id is not None,
                "points": r.points,
            }
            for r in rows
        ],
    }


# --- Import : aperçu ---------------------------------------------------------------


def _rally_history(db: Session, championship: Championship, exclude_rally_id: int | None) -> list[PastRallyResult]:
    rows = db.execute(
        select(RallyResult, Driver)
        .join(Driver, RallyResult.driver_id == Driver.id)
        .join(Rally, RallyResult.rally_id == Rally.id)
        .where(Rally.championship_id == championship.id)
    ).all()
    return [
        PastRallyResult(driver.id, driver.name, result.vehicle, result.platform)
        for result, driver in rows
        if result.rally_id != exclude_rally_id
    ]


def _championship_candidates(db: Session, championship: Championship) -> list[ChampionshipCandidate]:
    previous = {
        s.driver_id: s.points
        for s in db.scalars(
            select(RacenetStanding).where(
                RacenetStanding.championship_id == championship.id, RacenetStanding.driver_id.is_not(None)
            )
        )
    }
    known: dict[int, str] = {}
    for result, driver in db.execute(
        select(RallyResult, Driver)
        .join(Driver, RallyResult.driver_id == Driver.id)
        .join(Rally, RallyResult.rally_id == Rally.id)
        .where(Rally.championship_id == championship.id)
    ).all():
        known[driver.id] = driver.name
    for driver_id in previous:
        if driver_id not in known:
            driver = db.get(Driver, driver_id)
            if driver:
                known[driver_id] = driver.name
    return [ChampionshipCandidate(driver_id, name, previous.get(driver_id)) for driver_id, name in known.items()]


def build_preview(db: Session, championship: Championship, rally: Rally | None, parsed: ParsedCsv) -> dict:
    names_in_file = {r.name for r in parsed.rows if not r.is_anonymous}
    existing = (
        {d.name.lower(): d.id for d in db.scalars(select(Driver).where(Driver.name.in_(names_in_file)))}
        if names_in_file
        else {}
    )

    rows = []
    if parsed.kind == "rally":
        history = _rally_history(db, championship, rally.id if rally else None)
        for r in parsed.rows:
            assert isinstance(r, RallyRow)
            row = {
                "line": r.line,
                "position": r.position,
                "name": r.name,
                "anonymous": r.is_anonymous,
                "known_driver": r.name.lower() in existing,
                "vehicle": r.vehicle,
                "platform": r.platform,
                "time": format_time_ms(r.time_ms),
                "diff": format_time_ms(r.diff_ms),
                "suggestions": [],
            }
            if r.is_anonymous:
                row["suggestions"] = [
                    s.__dict__ for s in suggest_for_rally(r.vehicle, r.platform, history, names_in_file)
                ]
            rows.append(row)
    else:
        candidates = _championship_candidates(db, championship)
        for r in parsed.rows:
            assert isinstance(r, ChampionshipRow)
            row = {
                "line": r.line,
                "position": r.position,
                "name": r.name,
                "anonymous": r.is_anonymous,
                "known_driver": r.name.lower() in existing,
                "points": r.points,
                "suggestions": [],
            }
            if r.is_anonymous:
                row["suggestions"] = [
                    s.__dict__ for s in suggest_for_championship(r.points, candidates, names_in_file)
                ]
            rows.append(row)

    warnings = []
    if parsed.kind == "championship" and championship.scoring_mode == "custom":
        warnings.append(
            "Ce championnat utilise un barème personnalisé : le classement général est calculé à partir "
            "des rallyes, ce fichier ne sera pas utilisé pour l'affichage."
        )
    if parsed.kind == "rally" and rally is not None and rally.results:
        warnings.append(f"Les {len(rally.results)} résultats déjà importés pour « {rally.name} » seront remplacés.")

    return {
        "kind": parsed.kind,
        "row_count": len(rows),
        "anonymous_count": sum(1 for r in rows if r["anonymous"]),
        "warnings": warnings,
        "rows": rows,
    }


# --- Import : enregistrement ------------------------------------------------------


def _store_raw_file(data: bytes, original_filename: str) -> str:
    os.makedirs(settings.uploads_dir, exist_ok=True)
    base = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(original_filename))[:100] or "import.csv"
    stored = f"{datetime.utcnow():%Y%m%d-%H%M%S}-{secrets.token_hex(4)}-{base}"
    with open(os.path.join(settings.uploads_dir, stored), "wb") as f:
        f.write(data)
    return stored


def _resolve_driver(db: Session, row_name: str, line: int, resolutions: dict[int, str]) -> Driver | None:
    if row_name != ANONYMOUS_NAME:
        return get_or_create_driver(db, row_name)
    resolved = (resolutions.get(line) or "").strip()
    return get_or_create_driver(db, resolved) if resolved else None


def commit_import(
    db: Session,
    championship: Championship,
    rally: Rally | None,
    parsed: ParsedCsv,
    resolutions: dict[int, str],
    data: bytes,
    original_filename: str,
    admin_id: int,
) -> Import:
    """Enregistre l'import. `resolutions` associe le numéro de ligne d'un « WRC Player » au pseudo choisi."""
    if parsed.kind == "rally":
        if rally is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choisissez le rallye correspondant au fichier.")
        if rally.championship_id != championship.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ce rallye n'appartient pas au championnat.")
        db.execute(delete(RallyResult).where(RallyResult.rally_id == rally.id))
        for r in parsed.rows:
            driver = _resolve_driver(db, r.name, r.line, resolutions)
            db.add(
                RallyResult(
                    rally_id=rally.id,
                    position=r.position,
                    driver_id=driver.id if driver else None,
                    raw_name=r.name,
                    vehicle=r.vehicle,
                    time_ms=r.time_ms,
                    diff_ms=r.diff_ms,
                    platform=r.platform,
                )
            )
    else:
        db.execute(delete(RacenetStanding).where(RacenetStanding.championship_id == championship.id))
        for r in parsed.rows:
            driver = _resolve_driver(db, r.name, r.line, resolutions)
            db.add(
                RacenetStanding(
                    championship_id=championship.id,
                    position=r.position,
                    driver_id=driver.id if driver else None,
                    raw_name=r.name,
                    points=r.points,
                )
            )

    record = Import(
        kind=parsed.kind,
        championship_id=championship.id,
        rally_id=rally.id if parsed.kind == "rally" and rally else None,
        original_filename=original_filename[:255],
        stored_filename=_store_raw_file(data, original_filename),
        row_count=len(parsed.rows),
        admin_id=admin_id,
    )
    db.add(record)
    db.commit()
    db.expire_all()
    return record
