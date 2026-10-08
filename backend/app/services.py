"""Logique métier qui s'appuie sur la base : classements, aperçu et enregistrement des imports."""

import difflib
import os
import re
import secrets
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.accounts import DEFAULT_VEHICLES, AccountError, clean_racenet_name, clean_site_name, decide_link
from app.avatars import avatar_url, delete_avatar
from app.config import settings
from app.csv_import import ANONYMOUS_NAME, ChampionshipRow, ParsedCsv, RallyRow, format_time_ms
from app.models import (
    Championship,
    Driver,
    Import,
    PilotAccount,
    RacenetStanding,
    Rally,
    RallyResult,
    SiteSetting,
    StandingAdjustment,
)
from app.rally_status import compute_statuses, now_paris
from app.scoring import (
    ChampionshipCandidate,
    Classified,
    Finish,
    PastRallyResult,
    RallyFinish,
    TimedResult,
    apply_adjustments,
    classify,
    compare_standings,
    compute_custom_standings,
    driver_stats,
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
    """Pseudo public : celui du compte pilote relié s'il en a choisi un, sinon le pseudo RaceNet."""
    if driver is None:
        return raw_name
    if driver.account is not None and driver.account.site_name:
        return driver.account.site_name
    return driver.name


# --- Classements ----------------------------------------------------------------


def classified_results(rally: Rally) -> list[tuple[RallyResult, Classified]]:
    """Résultats du rallye reclassés après pénalités (classés au temps, puis non classés)."""
    results = list(rally.results)
    by_id = {r.id: r for r in results}
    ranking = classify(
        [TimedResult(r.id, r.time_ms, r.penalty_ms or 0, bool(r.disqualified)) for r in results]
    )
    return [(by_id[c.key], c) for c in ranking]


def rally_winner(rally: Rally) -> RallyResult | None:
    for result, c in classified_results(rally):
        if c.position == 1:
            return result
    return None


def _penalty_info(r: RallyResult) -> dict:
    return {
        "penalty_s": round((r.penalty_ms or 0) / 1000, 3),
        "disqualified": bool(r.disqualified),
        "penalty_reason": r.penalty_reason,
    }


def rally_results_payload(rally: Rally, scoring: dict[int, int] | None) -> list[dict]:
    payload = []
    for r, c in classified_results(rally):
        payload.append(
            {
                "id": r.id,
                "position": c.position,
                "name": display_name(r.driver, r.raw_name),
                "driver_id": r.driver_id,
                "identified": r.driver_id is not None,
                "vehicle": r.vehicle,
                "platform": r.platform,
                "time": format_time_ms(c.time_ms),
                "diff": format_time_ms(c.diff_ms) if c.diff_ms is not None else None,
                # Écart avec le pilote classé juste devant
                "diff_prev": format_time_ms(c.diff_prev_ms) if c.diff_prev_ms is not None else None,
                "points": (scoring.get(c.position, 0) if c.position else 0) if scoring is not None else None,
                **_penalty_info(r),
            }
        )
    return payload


@dataclass
class Snapshot:
    """Classement général après un rallye (rally None : ancien import sans rallye associé)."""

    rally: Rally | None
    entries: list[dict]
    unidentified: int


def _rally_ref(rally: Rally | None, rallies: list[Rally]) -> dict | None:
    if rally is None:
        return None
    return {"id": rally.id, "name": rally.name, "round": rallies.index(rally) + 1}


def _raw_snapshots(db: Session, championship: Championship) -> list[Snapshot]:
    """Un classement général par rallye disputé, dans l'ordre du calendrier."""
    rallies = list(championship.rallies)

    if championship.scoring_mode == "custom":
        scoring = scoring_table(championship)
        finishes = [
            [
                RallyFinish(r.driver_id, display_name(r.driver, r.raw_name), c.position)
                for r, c in classified_results(rally)
                if r.driver_id is not None and c.position is not None
            ]
            for rally in rallies
        ]
        snapshots = []
        for index, rally in enumerate(rallies):
            if not rally.results:
                continue
            entries = compute_custom_standings(finishes[: index + 1], scoring)
            snapshots.append(
                Snapshot(
                    rally,
                    [
                        {
                            "position": e.position,
                            "name": e.name,
                            "driver_id": e.driver_id,
                            "identified": True,
                            "points": e.points,
                            "per_rally": e.per_rally + [None] * (len(rallies) - len(e.per_rally)),
                        }
                        for e in entries
                    ],
                    sum(1 for r in rallies[: index + 1] for x in r.results if x.driver_id is None),
                )
            )
        return snapshots

    rows = db.scalars(
        select(RacenetStanding)
        .where(RacenetStanding.championship_id == championship.id)
        .order_by(RacenetStanding.position)
    ).all()
    by_rally: dict[int | None, list[RacenetStanding]] = defaultdict(list)
    for row in rows:
        by_rally[row.rally_id].append(row)

    def entries(group: list[RacenetStanding]) -> list[dict]:
        return [
            {
                "id": r.id,
                "position": r.position,
                "name": display_name(r.driver, r.raw_name),
                "driver_id": r.driver_id,
                "identified": r.driver_id is not None,
                "points": r.points,
            }
            for r in group
        ]

    snapshots = [
        Snapshot(rally, entries(by_rally[rally.id]), sum(1 for r in by_rally[rally.id] if r.driver_id is None))
        for rally in rallies
        if rally.id in by_rally
    ]
    if not snapshots and None in by_rally:
        legacy = by_rally[None]
        snapshots = [Snapshot(None, entries(legacy), sum(1 for r in legacy if r.driver_id is None))]
    return snapshots


def standings_snapshots(db: Session, championship: Championship) -> list[Snapshot]:
    """Classements généraux par rallye, ajustements de points des organisateurs compris."""
    snapshots = _raw_snapshots(db, championship)
    adjustments = db.scalars(
        select(StandingAdjustment).where(StandingAdjustment.championship_id == championship.id)
    ).all()
    if not adjustments:
        return snapshots

    for snapshot in snapshots:
        # Un ajustement compte à partir du rallye concerné (ou partout s'il n'en vise aucun)
        applicable = [
            a
            for a in adjustments
            if a.rally is None or snapshot.rally is None or a.rally.order_index <= snapshot.rally.order_index
        ]
        totals: dict[int, int] = defaultdict(int)
        reasons: dict[int, list[str]] = defaultdict(list)
        for a in applicable:
            totals[a.driver_id] += a.points
            reasons[a.driver_id].append(f"{a.points:+d} pts : {a.reason}")
        reordered = apply_adjustments(
            [(e["driver_id"], e["position"], e["points"]) for e in snapshot.entries], dict(totals)
        )
        snapshot.entries = [
            {
                **snapshot.entries[i],
                "position": position,
                "points": points,
                "adjustment": totals.get(snapshot.entries[i]["driver_id"], 0),
                "adjustment_reasons": reasons.get(snapshot.entries[i]["driver_id"], []),
            }
            for i, position, points in reordered
        ]
    return snapshots


def championship_standings(db: Session, championship: Championship, after_rally_id: int | None = None) -> dict:
    """Classement général après un rallye (par défaut le dernier), avec évolution par rapport au précédent."""
    rallies = list(championship.rallies)
    snapshots = standings_snapshots(db, championship)
    base = {
        "mode": championship.scoring_mode,
        "rallies": [{"id": r.id, "name": r.name, "round": i + 1} for i, r in enumerate(rallies)],
        "snapshots": [_rally_ref(s.rally, rallies) for s in snapshots if s.rally is not None],
    }
    if not snapshots:
        return {**base, "after": None, "previous": None, "unidentified": 0, "standings": []}

    index = len(snapshots) - 1
    if after_rally_id is not None:
        index = next((i for i, s in enumerate(snapshots) if s.rally and s.rally.id == after_rally_id), None)
        if index is None:
            raise not_found("Classement après ce rallye")
    current = snapshots[index]
    previous = snapshots[index - 1] if index > 0 else None

    moves = compare_standings(
        [(e["driver_id"], e["position"], e["points"]) for e in current.entries],
        [(e["driver_id"], e["position"], e["points"]) for e in previous.entries] if previous else None,
    )
    standings = [
        {**entry, "evol": move.evol, "gained": move.gained, "is_new": move.is_new}
        for entry, move in zip(current.entries, moves)
    ]
    return {
        **base,
        "after": _rally_ref(current.rally, rallies),
        "previous": _rally_ref(previous.rally, rallies) if previous else None,
        "unidentified": current.unidentified,
        "standings": standings,
    }


def _podium_entry(result: RallyResult, c: Classified) -> dict:
    return {
        "position": c.position,
        "name": display_name(result.driver, result.raw_name),
        "driver_id": result.driver_id,
        "vehicle": result.vehicle,
        "platform": result.platform,
        "time": format_time_ms(c.time_ms),
        "diff": format_time_ms(c.diff_ms or 0),
    }


def home_payload(db: Session, championship: Championship) -> dict:
    """Données de la page d'accueil : dernier rallye, podium, chiffres clés, top 5, calendrier."""
    rallies = list(championship.rallies)
    done = [r for r in rallies if r.results]
    last = done[-1] if done else None
    standings = championship_standings(db, championship)
    table = standings["standings"]

    leader = table[0] if table else None
    second = next((e for e in table if e["position"] > (leader["position"] if leader else 0)), None)
    leader_wins = (
        sum(1 for r in done if (w := rally_winner(r)) is not None and w.driver_id == leader["driver_id"])
        if leader and leader["driver_id"] is not None
        else 0
    )
    leader_was = None
    if standings["previous"] is not None:
        before = championship_standings(db, championship, standings["previous"]["id"])["standings"]
        leader_was = before[0]["driver_id"] if before else None

    return {
        "championship": {"id": championship.id, "name": championship.name, "mode": championship.scoring_mode},
        "total_rounds": len(rallies),
        "completed_rounds": len(done),
        "last_rally": (
            {
                **_rally_ref(last, rallies),
                **rally_dates(last),
                "podium": [_podium_entry(r, c) for r, c in classified_results(last) if c.position][:3],
                "top5": [_podium_entry(r, c) for r, c in classified_results(last) if c.position][:5],
                "result_count": len(last.results),
            }
            if last
            else None
        ),
        "standings": {
            "after": standings["after"],
            "count": len(table),
            "top5": table[:5],
            "leader": (
                {
                    "name": leader["name"],
                    "driver_id": leader["driver_id"],
                    "points": leader["points"],
                    "wins": leader_wins,
                    "gap": leader["points"] - second["points"] if second else None,
                    "was_leader": leader_was is not None and leader_was == leader["driver_id"],
                }
                if leader
                else None
            ),
        },
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


def _championship_candidates(
    db: Session, championship: Championship, rally: Rally | None
) -> list[ChampionshipCandidate]:
    # Classement de référence : le dernier importé avant ce rallye (ou le dernier tout court)
    snapshots = [s for s in standings_snapshots(db, championship) if championship.scoring_mode == "racenet"]
    if rally is not None:
        snapshots = [s for s in snapshots if s.rally is not None and s.rally.order_index < rally.order_index]
    reference = snapshots[-1].entries if snapshots else []
    previous = {e["driver_id"]: e["points"] for e in reference if e["driver_id"] is not None}
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
        candidates = _championship_candidates(db, championship, rally)
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
        penalties = sum(1 for r in rally.results if r.driver_id is not None and (r.penalty_ms or r.disqualified))
        if penalties:
            warnings.append(f"{penalties} pénalité(s) déjà décidée(s) seront conservées pour les mêmes pilotes.")
    if parsed.kind == "championship":
        if rally is None:
            warnings.append("Choisissez après quel rallye ce classement a été exporté.")
        elif db.scalar(
            select(RacenetStanding.id).where(RacenetStanding.rally_id == rally.id).limit(1)
        ) is not None:
            warnings.append(f"Le classement déjà importé après « {rally.name} » sera remplacé.")

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
    if rally is None:
        message = (
            "Choisissez le rallye correspondant au fichier."
            if parsed.kind == "rally"
            else "Choisissez après quel rallye ce classement a été exporté."
        )
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, message)
    if rally.championship_id != championship.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ce rallye n'appartient pas au championnat.")

    if parsed.kind == "rally":
        # Les pénalités déjà décidées sont conservées pour le même pilote lors d'une réimport
        kept = {
            r.driver_id: (r.penalty_ms, r.disqualified, r.penalty_reason)
            for r in rally.results
            if r.driver_id is not None and (r.penalty_ms or r.disqualified)
        }
        db.execute(delete(RallyResult).where(RallyResult.rally_id == rally.id))
        for r in parsed.rows:
            driver = _resolve_driver(db, r.name, r.line, resolutions)
            penalty_ms, disqualified, reason = kept.get(driver.id if driver else None, (0, False, None))
            db.add(
                RallyResult(
                    penalty_ms=penalty_ms,
                    disqualified=disqualified,
                    penalty_reason=reason,
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
        # Remplace le classement de ce rallye, et les anciens imports sans rallye associé
        db.execute(
            delete(RacenetStanding).where(
                RacenetStanding.championship_id == championship.id,
                (RacenetStanding.rally_id == rally.id) | RacenetStanding.rally_id.is_(None),
            )
        )
        for r in parsed.rows:
            driver = _resolve_driver(db, r.name, r.line, resolutions)
            db.add(
                RacenetStanding(
                    championship_id=championship.id,
                    rally_id=rally.id,
                    position=r.position,
                    driver_id=driver.id if driver else None,
                    raw_name=r.name,
                    points=r.points,
                )
            )

    record = Import(
        kind=parsed.kind,
        championship_id=championship.id,
        rally_id=rally.id,
        original_filename=original_filename[:255],
        stored_filename=_store_raw_file(data, original_filename),
        row_count=len(parsed.rows),
        admin_id=admin_id,
    )
    db.add(record)
    db.commit()
    # Les comptes en attente dont le pseudo RaceNet vient d'apparaître sont reliés automatiquement
    link_pending_accounts(db)
    db.expire_all()
    return record


# --- Paramètres du site ------------------------------------------------------------

_DISCORD_INVITE = re.compile(r"^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,64}/?$")
_SNOWFLAKE = re.compile(r"^\d{15,25}$")  # identifiants Discord (application, serveur)
_SECRET = re.compile(r"^[A-Za-z0-9_\-]{16,128}$")
_SITE_URL = re.compile(r"^https?://[A-Za-z0-9.\-]+(:\d{1,5})?$")


@dataclass(frozen=True)
class SettingDef:
    valid: object  # fonction str -> bool (la chaîne vide est toujours acceptée)
    message: str
    public: bool = False  # lisible par tous (GET /api/settings)
    secret: bool = False  # jamais renvoyé, même à l'admin


SETTINGS = {
    "discord_url": SettingDef(
        lambda v: bool(_DISCORD_INVITE.match(v)),
        "Lien d'invitation Discord invalide (attendu : https://discord.gg/… ou https://discord.com/invite/…).",
        public=True,
    ),
    "discord_client_id": SettingDef(lambda v: bool(_SNOWFLAKE.match(v)), "Client ID Discord invalide (chiffres)."),
    "discord_client_secret": SettingDef(
        lambda v: bool(_SECRET.match(v)), "Client Secret Discord invalide.", secret=True
    ),
    "discord_guild_id": SettingDef(
        lambda v: bool(_SNOWFLAKE.match(v)), "Identifiant de serveur Discord invalide (chiffres)."
    ),
    "site_url": SettingDef(
        lambda v: bool(_SITE_URL.match(v)), "Adresse du site invalide (ex. https://erally4.devnest.fr, sans / final)."
    ),
}


def _stored_settings(db: Session) -> dict[str, str]:
    return {s.key: s.value for s in db.scalars(select(SiteSetting).where(SiteSetting.key.in_(SETTINGS)))}


def setting(db: Session, key: str) -> str:
    return _stored_settings(db).get(key, "")


def read_settings(db: Session, public_only: bool = False) -> dict:
    stored = _stored_settings(db)
    values = {}
    for key, definition in SETTINGS.items():
        if public_only and not definition.public:
            continue
        if definition.secret:
            values[f"{key}_set"] = bool(stored.get(key))
        else:
            values[key] = stored.get(key, "")
    return values


def write_settings(db: Session, values: dict) -> dict:
    for key, value in values.items():
        definition = SETTINGS.get(key)
        if definition is None or value is None:
            continue  # None = ne pas modifier (utile pour le secret, jamais réaffiché)
        value = value.strip()
        if value and not definition.valid(value):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, definition.message)
        row = db.get(SiteSetting, key)
        if row is None:
            db.add(SiteSetting(key=key, value=value))
        else:
            row.value = value
    db.commit()
    return read_settings(db)


# --- Pilotes : liste et profil ------------------------------------------------------


def _most_common(values: list[str]) -> str | None:
    return Counter(values).most_common(1)[0][0] if values else None


DriverResult = tuple[int, Rally, RallyResult, Classified]


def _driver_results(championship: Championship) -> dict[int, list[DriverResult]]:
    """Résultats identifiés du championnat, par pilote : (manche, rallye, résultat, classement après pénalités)."""
    by_driver: dict[int, list[DriverResult]] = defaultdict(list)
    for index, rally in enumerate(championship.rallies):
        for result, c in classified_results(rally):
            if result.driver_id is not None:
                by_driver[result.driver_id].append((index + 1, rally, result, c))
    return by_driver


def _finishes(rows: list[DriverResult]) -> list[Finish]:
    """Arrivées comptées dans les statistiques (les non classés en sont exclus)."""
    return [
        Finish(c.position, sum(1 for _, x in classified_results(rally) if x.position), c.diff_ms or 0)
        for _, rally, _, c in rows
        if c.position is not None
    ]


def drivers_overview(db: Session, championship: Championship) -> list[dict]:
    """Tous les pilotes du championnat (résultats ou classement), avec leurs chiffres principaux."""
    standings = {e["driver_id"]: e for e in championship_standings(db, championship)["standings"] if e["driver_id"]}
    results = _driver_results(championship)
    ids = set(standings) | set(results)
    drivers = {d.id: d for d in db.scalars(select(Driver).where(Driver.id.in_(ids)))} if ids else {}

    rows = []
    for driver_id, driver in drivers.items():
        mine = results.get(driver_id, [])
        stats = driver_stats(_finishes(mine))
        standing = standings.get(driver_id)
        rows.append(
            {
                "id": driver_id,
                "name": display_name(driver, driver.name),
                "avatar_url": avatar_url(driver.account.avatar_file) if driver.account else None,
                "position": standing["position"] if standing else None,
                "points": standing["points"] if standing else None,
                "rallies": stats.rallies,
                "wins": stats.wins,
                "podiums": stats.podiums,
                "best": stats.best,
                "platform": _most_common([r.platform for _, _, r, _ in mine]),
                "vehicle": (driver.account.vehicle if driver.account and driver.account.vehicle else None)
                or _most_common([r.vehicle for _, _, r, _ in mine]),
            }
        )
    rows.sort(key=lambda r: (r["position"] is None, r["position"] or 0, r["name"].lower()))
    return rows


def driver_profile(db: Session, driver: Driver, championship: Championship | None) -> dict:
    """Profil public d'un pilote : statistiques du championnat, historique, évolution, carrière."""
    career_rallies = db.scalars(
        select(Rally).join(RallyResult, RallyResult.rally_id == Rally.id).where(RallyResult.driver_id == driver.id)
    ).unique().all()
    career_rows: list[DriverResult] = [
        (0, rally, r, c) for rally in career_rallies for r, c in classified_results(rally) if r.driver_id == driver.id
    ]
    career = driver_stats(_finishes(career_rows))

    season = None
    if championship is not None:
        rallies = list(championship.rallies)
        mine = _driver_results(championship).get(driver.id, [])
        scoring = scoring_table(championship) if championship.scoring_mode == "custom" else None
        stats = driver_stats(_finishes(mine))

        # Position au général après chaque manche (courbe de progression)
        progression = []
        for snapshot in standings_snapshots(db, championship):
            entry = next((e for e in snapshot.entries if e["driver_id"] == driver.id), None)
            if snapshot.rally is not None and entry is not None:
                progression.append(
                    {
                        "round": rallies.index(snapshot.rally) + 1,
                        "rally": snapshot.rally.name,
                        "position": entry["position"],
                        "points": entry["points"],
                        "classified": len(snapshot.entries),
                    }
                )
        current = championship_standings(db, championship)["standings"]
        standing = next((e for e in current if e["driver_id"] == driver.id), None)

        season = {
            "championship": {"id": championship.id, "name": championship.name, "mode": championship.scoring_mode},
            "position": standing["position"] if standing else None,
            "points": standing["points"] if standing else None,
            "adjustment_reasons": standing.get("adjustment_reasons", []) if standing else [],
            "classified": len(current),
            "stats": stats.__dict__,
            "progression": progression,
            "history": [
                {
                    "rally_id": rally.id,
                    "round": round_,
                    "rally": rally.name,
                    **rally_dates(rally),
                    "position": c.position,
                    "finishers": sum(1 for _, x in classified_results(rally) if x.position),
                    "time": format_time_ms(c.time_ms),
                    "diff": format_time_ms(c.diff_ms) if c.diff_ms is not None else None,
                    "vehicle": r.vehicle,
                    "platform": r.platform,
                    "points": (scoring.get(c.position, 0) if c.position else 0) if scoring is not None else None,
                    **_penalty_info(r),
                }
                for round_, rally, r, c in mine
            ],
        }

    all_results = [r for _, _, r, _ in career_rows]
    account = driver.account
    return {
        "id": driver.id,
        "name": display_name(driver, driver.name),
        # Pseudo RaceNet affiché en complément quand le pilote a choisi un autre pseudo pour le site
        "racenet_name": driver.name if account and account.site_name and account.site_name != driver.name else None,
        "avatar_url": avatar_url(account.avatar_file) if account else None,
        "has_account": account is not None,
        "platform": _most_common([r.platform for r in all_results]),
        "vehicle": (account.vehicle if account and account.vehicle else None)
        or _most_common([r.vehicle for r in all_results]),
        "career": career.__dict__,
        "season": season,
    }


# --- Comptes pilotes -------------------------------------------------------------------


def site_base_url(db: Session, request) -> str:
    """Adresse publique du site (réglage « site_url », sinon déduite des en-têtes du proxy)."""
    configured = setting(db, "site_url")
    if configured:
        return configured.rstrip("/")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    return f"{proto}://{host}"


def discord_redirect_uri(db: Session, request) -> str:
    return f"{site_base_url(db, request)}/api/auth/discord/callback"


def get_or_create_account(db: Session, discord_id: str, discord_username: str) -> PilotAccount:
    account = db.scalar(select(PilotAccount).where(PilotAccount.discord_id == discord_id))
    if account is None:
        account = PilotAccount(discord_id=discord_id, discord_username=discord_username)
        db.add(account)
    else:
        account.discord_username = discord_username
    db.commit()
    return account


def apply_link(db: Session, account: PilotAccount) -> None:
    """Relie le compte au pilote dont le nom RaceNet correspond, s'il est libre ; sinon demande à l'admin."""
    driver = (
        db.scalar(select(Driver).where(Driver.name == account.racenet_name)) if account.racenet_name else None
    )
    taken = (
        driver is not None
        and db.scalar(
            select(PilotAccount.id).where(PilotAccount.driver_id == driver.id, PilotAccount.id != account.id)
        )
        is not None
    )
    decision = decide_link(account.racenet_name, driver.id if driver else None, taken)
    account.link_status = decision.status
    account.driver_id = decision.driver_id


def link_pending_accounts(db: Session) -> int:
    """Après un import : relie les comptes en attente dont le pseudo RaceNet vient d'apparaître."""
    linked = 0
    for account in db.scalars(select(PilotAccount).where(PilotAccount.link_status == "pending")):
        apply_link(db, account)
        linked += account.link_status == "linked"
    db.commit()
    return linked


def update_account(db: Session, account: PilotAccount, values: dict) -> PilotAccount:
    try:
        if "site_name" in values:
            name = clean_site_name(values["site_name"] or "")
            taken = db.scalar(
                select(PilotAccount.id).where(PilotAccount.site_name == name, PilotAccount.id != account.id)
            )
            if taken is not None:
                raise AccountError("Ce pseudo est déjà utilisé par un autre pilote.")
            account.site_name = name
        if "racenet_name" in values:
            racenet = clean_racenet_name(values["racenet_name"] or "")
            if racenet != account.racenet_name or account.link_status == "none":
                account.racenet_name = racenet
                apply_link(db, account)
        if "vehicle" in values:
            vehicle = (values["vehicle"] or "").strip() or None
            if vehicle is not None and vehicle not in vehicle_choices(db):
                raise AccountError("Choisissez une voiture dans la liste.")
            account.vehicle = vehicle
    except AccountError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    db.commit()
    return account


def vehicle_choices(db: Session) -> list[str]:
    seen = {v for v in db.scalars(select(RallyResult.vehicle).distinct()) if v}
    return sorted(seen | set(DEFAULT_VEHICLES))


def account_payload(account: PilotAccount) -> dict:
    return {
        "id": account.id,
        "discord_username": account.discord_username,
        "site_name": account.site_name,
        "racenet_name": account.racenet_name,
        "link_status": account.link_status,
        "driver_id": account.driver_id,
        "vehicle": account.vehicle,
        "avatar_url": avatar_url(account.avatar_file),
    }


def delete_account(db: Session, account: PilotAccount) -> None:
    delete_avatar(account.avatar_file)
    db.delete(account)
    db.commit()


def admin_accounts(db: Session) -> list[dict]:
    """Comptes pour l'admin, avec des suggestions de liaison pour ceux en attente."""
    accounts = db.scalars(select(PilotAccount).order_by(PilotAccount.link_status.desc(), PilotAccount.id)).all()
    linked_ids = {a.driver_id for a in accounts if a.driver_id}
    free_drivers = [d for d in db.scalars(select(Driver)) if d.id not in linked_ids]
    names = {d.name.lower(): d for d in free_drivers}
    rows = []
    for a in accounts:
        suggestions = []
        if a.link_status == "pending" and a.racenet_name:
            close = difflib.get_close_matches(a.racenet_name.lower(), list(names), n=3, cutoff=0.5)
            suggestions = [{"id": names[n].id, "name": names[n].name} for n in close]
        rows.append(
            {
                **account_payload(a),
                "driver_name": a.driver.name if a.driver else None,
                "created_at": a.created_at,
                "suggestions": suggestions,
            }
        )
    return rows


def admin_link(db: Session, account: PilotAccount, driver_id: int) -> None:
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise not_found("Pilote")
    other = db.scalar(select(PilotAccount).where(PilotAccount.driver_id == driver.id, PilotAccount.id != account.id))
    if other is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"« {driver.name} » est déjà relié au compte de {other.site_name or other.discord_username}.",
        )
    account.driver_id = driver.id
    account.link_status = "linked"
    db.commit()


# --- Dates et statut des rallyes ------------------------------------------------------


def rally_statuses(championship: Championship) -> dict[int, str]:
    """Statut de chaque rallye du championnat (terminé, en cours, prochain…) à l'heure de Paris."""
    rallies = list(championship.rallies)
    statuses = compute_statuses([(r.starts_at, r.ends_at, bool(r.results)) for r in rallies], now_paris())
    return {r.id: s for r, s in zip(rallies, statuses)}


def rally_dates(rally: Rally) -> dict:
    return {"starts_at": rally.starts_at, "ends_at": rally.ends_at}
