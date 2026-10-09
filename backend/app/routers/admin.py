import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.avatars import delete_avatar
from app.config import settings
from app.csv_import import CsvError, parse_csv
from app.db import get_db
from app.models import (
    AdminSession,
    Championship,
    Driver,
    Import,
    PilotAccount,
    RacenetStanding,
    Rally,
    RallyResult,
    ScoringPoint,
    StageResult,
    StandingAdjustment,
)
from app.racenet_import import build_racenet_preview, commit_racenet_import
from app.security import authenticate, check_ip_rate_limit, client_ip, close_session, current_session, open_session
from app.services import (
    admin_accounts,
    admin_link,
    build_preview,
    championship_standings,
    commit_import,
    delete_account,
    discord_redirect_uri,
    get_championship,
    get_or_create_driver,
    get_rally,
    not_found,
    rally_results_payload,
    rally_statuses,
    read_settings,
    scoring_table,
    validate_driver_name,
    write_settings,
)

router = APIRouter(prefix="/api/admin")
auth = APIRouter(prefix="/api/admin")
protected = [Depends(current_session)]


# --- Authentification -------------------------------------------------------------


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


@auth.post("/login")
def login(body: LoginBody, request: Request, response: Response, db: Session = Depends(get_db)):
    check_ip_rate_limit(client_ip(request))
    admin = authenticate(db, body.username, body.password)
    session = open_session(db, admin, response)
    return {"username": admin.username, "csrf": session.csrf_token}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), _=Depends(current_session)):
    close_session(db, request, response)
    return {"ok": True}


@router.get("/me")
def me(session: AdminSession = Depends(current_session)):
    return {"username": session.admin.username, "csrf": session.csrf_token}


# --- Championnats ------------------------------------------------------------------


def _championship_payload(c: Championship) -> dict:
    statuses = rally_statuses(c)
    return {
        "id": c.id,
        "name": c.name,
        "is_current": c.is_current,
        "mode": c.scoring_mode,
        "scoring": [p.points for p in c.scoring],
        "rallies": [
            {
                "id": r.id,
                "name": r.name,
                "order_index": r.order_index,
                "starts_at": r.starts_at,
                "ends_at": r.ends_at,
                "status": statuses[r.id],
                "result_count": len(r.results),
                "stage_count": len(r.stages),
                "racenet_event_id": r.racenet_event_id,
                "unidentified": sum(1 for x in r.results if x.driver_id is None),
            }
            for r in c.rallies
        ],
    }


class ChampionshipCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mode: Literal["racenet", "custom"] = "racenet"


class ChampionshipUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    mode: Literal["racenet", "custom"] | None = None
    is_current: Literal[True] | None = None


class ScoringBody(BaseModel):
    # points[0] = points du 1er, points[1] = du 2e, etc.
    points: list[int] = Field(max_length=200)


def _set_current(db: Session, championship: Championship) -> None:
    db.execute(update(Championship).values(is_current=False))
    championship.is_current = True


@router.get("/championships", dependencies=protected)
def list_championships(db: Session = Depends(get_db)):
    return [_championship_payload(c) for c in db.scalars(select(Championship).order_by(Championship.id.desc()))]


@router.post("/championships", dependencies=protected, status_code=201)
def create_championship(body: ChampionshipCreate, db: Session = Depends(get_db)):
    c = Championship(name=body.name.strip(), scoring_mode=body.mode)
    db.add(c)
    db.flush()
    if not db.scalar(select(func.count()).select_from(Championship).where(Championship.is_current.is_(True))):
        c.is_current = True
    db.commit()
    db.refresh(c)
    return _championship_payload(c)


@router.patch("/championships/{championship_id}", dependencies=protected)
def update_championship(championship_id: int, body: ChampionshipUpdate, db: Session = Depends(get_db)):
    c = get_championship(db, championship_id)
    if body.name is not None:
        c.name = body.name.strip()
    if body.mode is not None:
        c.scoring_mode = body.mode
    if body.is_current:
        _set_current(db, c)
    db.commit()
    db.refresh(c)
    return _championship_payload(c)


@router.delete("/championships/{championship_id}", dependencies=protected)
def delete_championship(championship_id: int, db: Session = Depends(get_db)):
    db.delete(get_championship(db, championship_id))
    db.commit()
    return {"ok": True}


@router.put("/championships/{championship_id}/scoring", dependencies=protected)
def set_scoring(championship_id: int, body: ScoringBody, db: Session = Depends(get_db)):
    if any(p < 0 or p > 10_000 for p in body.points):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Les points doivent être entre 0 et 10 000.")
    c = get_championship(db, championship_id)
    c.scoring.clear()
    db.flush()
    for position, points in enumerate(body.points, start=1):
        c.scoring.append(ScoringPoint(position=position, points=points))
    db.commit()
    db.refresh(c)
    return _championship_payload(c)


@router.get("/championships/{championship_id}/standings", dependencies=protected)
def admin_standings(championship_id: int, db: Session = Depends(get_db)):
    return championship_standings(db, get_championship(db, championship_id))


# --- Rallyes ------------------------------------------------------------------------


class RallyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # Heure de Paris, sans fuseau (saisie « date et heure » de l'admin)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class RallyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    order_index: int | None = Field(default=None, ge=1, le=100)


def _check_dates(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at and ends_at and ends_at < starts_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La fin du rallye doit être après son début.")


@router.post("/championships/{championship_id}/rallies", dependencies=protected, status_code=201)
def create_rally(championship_id: int, body: RallyCreate, db: Session = Depends(get_db)):
    c = get_championship(db, championship_id)
    order = max((r.order_index for r in c.rallies), default=0) + 1
    _check_dates(body.starts_at, body.ends_at)
    db.add(
        Rally(
            championship_id=c.id,
            name=body.name.strip(),
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            order_index=order,
        )
    )
    db.commit()
    db.refresh(c)
    return _championship_payload(c)


@router.patch("/rallies/{rally_id}", dependencies=protected)
def update_rally(rally_id: int, body: RallyUpdate, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        r.name = data["name"].strip()
    if "starts_at" in data:
        r.starts_at = data["starts_at"]
    if "ends_at" in data:
        r.ends_at = data["ends_at"]
    _check_dates(r.starts_at, r.ends_at)
    if data.get("order_index") is not None:
        r.order_index = data["order_index"]
    db.commit()
    return {"ok": True}


@router.delete("/rallies/{rally_id}", dependencies=protected)
def delete_rally(rally_id: int, db: Session = Depends(get_db)):
    db.delete(get_rally(db, rally_id))
    db.commit()
    return {"ok": True}


@router.delete("/rallies/{rally_id}/results", dependencies=protected)
def delete_rally_results(rally_id: int, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    r.results.clear()
    db.commit()
    return {"ok": True}


@router.get("/rallies/{rally_id}/results", dependencies=protected)
def admin_rally_results(rally_id: int, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    c = r.championship
    return {
        "id": r.id,
        "name": r.name,
        "championship": {"id": c.id, "name": c.name, "mode": c.scoring_mode},
        "results": rally_results_payload(r, scoring_table(c) if c.scoring_mode == "custom" else None),
    }


# --- Import CSV ---------------------------------------------------------------------


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Fichier trop volumineux (max {settings.max_upload_bytes // 1024} Ko).",
        )
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Le fichier doit être un .csv.")
    return data


def _parse(data: bytes):
    try:
        return parse_csv(data)
    except CsvError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"message": str(exc), "line": exc.line, "column": exc.column},
        ) from None


def _rally_for(db: Session, rally_id: int | None) -> Rally | None:
    return get_rally(db, rally_id) if rally_id else None


@router.post("/imports/preview", dependencies=protected)
async def preview_import(
    file: UploadFile = File(...),
    championship_id: int = Form(...),
    rally_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    data = await _read_upload(file)
    parsed = _parse(data)
    c = get_championship(db, championship_id)
    return build_preview(db, c, _rally_for(db, rally_id), parsed)


@router.post("/imports", status_code=201)
async def create_import(
    file: UploadFile = File(...),
    championship_id: int = Form(...),
    rally_id: int | None = Form(None),
    resolutions: str = Form("{}"),
    db: Session = Depends(get_db),
    session: AdminSession = Depends(current_session),
):
    data = await _read_upload(file)
    parsed = _parse(data)
    try:
        raw = json.loads(resolutions)
        mapping = {int(line): str(name) for line, name in raw.items() if name}
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Résolutions invalides.") from None
    c = get_championship(db, championship_id)
    rally = _rally_for(db, rally_id)
    record = commit_import(db, c, rally, parsed, mapping, data, file.filename or "import.csv", session.admin_id)
    return {"id": record.id, "kind": record.kind, "row_count": record.row_count}


@router.get("/imports", dependencies=protected)
def list_imports(championship_id: int, db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Import).where(Import.championship_id == championship_id).order_by(Import.created_at.desc()).limit(100)
    ).all()
    return [
        {
            "id": i.id,
            "kind": i.kind,
            "rally_id": i.rally_id,
            "filename": i.original_filename,
            "row_count": i.row_count,
            "created_at": i.created_at,
        }
        for i in rows
    ]


# --- Import direct depuis RaceNet ------------------------------------------------------


class RacenetImportBody(BaseModel):
    championship_id: int
    rally_id: int | None = None
    # Réponses brutes de l'API RaceNet relayées par le favori (validées par app.racenet)
    payload: dict
    # Identifiant RaceNet d'un « WRC Player » inconnu → pseudo choisi par l'admin
    resolutions: dict[str, str] = Field(default_factory=dict)
    update_dates: bool = False


@router.post("/imports/racenet/preview", dependencies=protected)
def preview_racenet_import(body: RacenetImportBody, db: Session = Depends(get_db)):
    c = get_championship(db, body.championship_id)
    return build_racenet_preview(db, c, _rally_for(db, body.rally_id), body.payload)


@router.post("/imports/racenet", status_code=201)
def create_racenet_import(
    body: RacenetImportBody,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(current_session),
):
    c = get_championship(db, body.championship_id)
    rally = _rally_for(db, body.rally_id)
    if rally is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choisissez le rallye correspondant à l'épreuve.")
    record = commit_racenet_import(
        db, c, rally, body.payload, body.resolutions, body.update_dates, session.admin_id
    )
    return {"id": record.id, "kind": record.kind, "row_count": record.row_count, "rally_id": rally.id}


# --- Pilotes et corrections ------------------------------------------------------------


class DriverRename(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class DriverMerge(BaseModel):
    into_id: int


class AssignDriver(BaseModel):
    # None = remettre en « WRC Player » non identifié
    driver_name: str | None = Field(default=None, max_length=64)


@router.get("/drivers", dependencies=protected)
def list_drivers(db: Session = Depends(get_db)):
    return [{"id": d.id, "name": d.name} for d in db.scalars(select(Driver).order_by(Driver.name))]


@router.patch("/drivers/{driver_id}", dependencies=protected)
def rename_driver(driver_id: int, body: DriverRename, db: Session = Depends(get_db)):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise not_found("Pilote")
    name = validate_driver_name(body.name)
    other = db.scalar(select(Driver).where(Driver.name == name, Driver.id != driver_id))
    if other is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": f"Le pilote « {other.name} » existe déjà.", "existing_id": other.id},
        )
    driver.name = name
    db.commit()
    return {"id": driver.id, "name": driver.name}


@router.post("/drivers/{driver_id}/merge", dependencies=protected)
def merge_driver(driver_id: int, body: DriverMerge, db: Session = Depends(get_db)):
    """Fusionne un pilote dans un autre (tous ses résultats passent sur `into_id`)."""
    source, target = db.get(Driver, driver_id), db.get(Driver, body.into_id)
    if source is None or target is None:
        raise not_found("Pilote")
    if source.id == target.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Impossible de fusionner un pilote avec lui-même.")
    db.execute(update(RallyResult).where(RallyResult.driver_id == source.id).values(driver_id=target.id))
    db.execute(update(RacenetStanding).where(RacenetStanding.driver_id == source.id).values(driver_id=target.id))
    db.execute(update(StageResult).where(StageResult.driver_id == source.id).values(driver_id=target.id))
    db.execute(
        update(StandingAdjustment).where(StandingAdjustment.driver_id == source.id).values(driver_id=target.id)
    )
    # L'identifiant RaceNet suit la fusion, pour que les prochains imports retrouvent la cible
    if source.racenet_id and not target.racenet_id:
        racenet_id, source.racenet_id = source.racenet_id, None
        db.flush()
        target.racenet_id = racenet_id
    # Un compte pilote relié au doublon suit la fusion si la cible n'a pas déjà de compte
    if source.account is not None and target.account is None:
        source.account.driver_id = target.id
        db.flush()
    db.delete(source)
    db.commit()
    return {"id": target.id, "name": target.name}


def _assign(db: Session, row, body: AssignDriver) -> dict:
    name = (body.driver_name or "").strip()
    row.driver_id = get_or_create_driver(db, name).id if name else None
    db.commit()
    db.refresh(row)
    return {"id": row.id, "driver_id": row.driver_id, "name": row.driver.name if row.driver else row.raw_name}


@router.patch("/rally-results/{result_id}", dependencies=protected)
def assign_rally_result(result_id: int, body: AssignDriver, db: Session = Depends(get_db)):
    row = db.get(RallyResult, result_id)
    if row is None:
        raise not_found("Résultat")
    return _assign(db, row, body)


@router.patch("/racenet-standings/{standing_id}", dependencies=protected)
def assign_standing(standing_id: int, body: AssignDriver, db: Session = Depends(get_db)):
    row = db.get(RacenetStanding, standing_id)
    if row is None:
        raise not_found("Ligne de classement")
    return _assign(db, row, body)


# --- Paramètres du site -----------------------------------------------------------------


class SettingsBody(BaseModel):
    # None = ne pas modifier (le Client Secret n'est jamais réaffiché)
    discord_url: str | None = Field(default=None, max_length=200)
    discord_client_id: str | None = Field(default=None, max_length=32)
    discord_client_secret: str | None = Field(default=None, max_length=200)
    discord_guild_id: str | None = Field(default=None, max_length=32)
    site_url: str | None = Field(default=None, max_length=200)
    racenet_club_id: str | None = Field(default=None, max_length=12)


def _settings_payload(db: Session, request: Request) -> dict:
    # Adresse de retour à déclarer dans l'application Discord (onglet OAuth2 → Redirects)
    return {**read_settings(db), "discord_redirect_uri": discord_redirect_uri(db, request)}


@router.get("/settings", dependencies=protected)
def get_settings(request: Request, db: Session = Depends(get_db)):
    return _settings_payload(db, request)


@router.put("/settings", dependencies=protected)
def put_settings(body: SettingsBody, request: Request, db: Session = Depends(get_db)):
    write_settings(db, body.model_dump())
    return _settings_payload(db, request)


# --- Comptes pilotes ------------------------------------------------------------------


class LinkBody(BaseModel):
    driver_id: int


def _account(db: Session, account_id: int) -> PilotAccount:
    account = db.get(PilotAccount, account_id)
    if account is None:
        raise not_found("Compte")
    return account


@router.get("/accounts", dependencies=protected)
def list_accounts(db: Session = Depends(get_db)):
    return admin_accounts(db)


@router.post("/accounts/{account_id}/link", dependencies=protected)
def link_account(account_id: int, body: LinkBody, db: Session = Depends(get_db)):
    admin_link(db, _account(db, account_id), body.driver_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/unlink", dependencies=protected)
def unlink_account(account_id: int, db: Session = Depends(get_db)):
    account = _account(db, account_id)
    account.driver_id = None
    account.link_status = "pending" if account.racenet_name else "none"
    db.commit()
    return {"ok": True}


@router.post("/accounts/{account_id}/reset-name", dependencies=protected)
def reset_account_name(account_id: int, db: Session = Depends(get_db)):
    """Retire un pseudo inapproprié : le pilote devra en choisir un autre."""
    _account(db, account_id).site_name = None
    db.commit()
    return {"ok": True}


@router.delete("/accounts/{account_id}/avatar", dependencies=protected)
def remove_account_avatar(account_id: int, db: Session = Depends(get_db)):
    account = _account(db, account_id)
    delete_avatar(account.avatar_file)
    account.avatar_file = None
    db.commit()
    return {"ok": True}


@router.delete("/accounts/{account_id}", dependencies=protected)
def remove_account(account_id: int, db: Session = Depends(get_db)):
    delete_account(db, _account(db, account_id))
    return {"ok": True}


# --- Pénalités (article 8 du règlement) --------------------------------------------------


class PenaltyBody(BaseModel):
    penalty_s: float = Field(default=0, ge=0, le=3600)
    disqualified: bool = False
    reason: str | None = Field(default=None, max_length=255)


@router.patch("/rally-results/{result_id}/penalty", dependencies=protected)
def set_penalty(result_id: int, body: PenaltyBody, db: Session = Depends(get_db)):
    """Pénalité de temps ou « non classé » sur un résultat ; tout à zéro = retirer la pénalité."""
    row = db.get(RallyResult, result_id)
    if row is None:
        raise not_found("Résultat")
    reason = (body.reason or "").strip() or None
    if (body.penalty_s or body.disqualified) and not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Indiquez le motif de la pénalité.")
    row.penalty_ms = round(body.penalty_s * 1000)
    row.disqualified = body.disqualified
    row.penalty_reason = reason if (body.penalty_s or body.disqualified) else None
    db.commit()
    return {"ok": True}


class AdjustmentBody(BaseModel):
    driver_name: str = Field(min_length=1, max_length=64)
    points: int = Field(ge=-1000, le=1000)
    rally_id: int | None = None
    reason: str = Field(min_length=1, max_length=255)


def _adjustment_payload(a: StandingAdjustment) -> dict:
    return {
        "id": a.id,
        "driver_id": a.driver_id,
        "driver_name": a.driver.name,
        "points": a.points,
        "rally_id": a.rally_id,
        "rally_name": a.rally.name if a.rally else None,
        "reason": a.reason,
        "created_at": a.created_at,
    }


@router.get("/championships/{championship_id}/adjustments", dependencies=protected)
def list_adjustments(championship_id: int, db: Session = Depends(get_db)):
    get_championship(db, championship_id)
    rows = db.scalars(
        select(StandingAdjustment)
        .where(StandingAdjustment.championship_id == championship_id)
        .order_by(StandingAdjustment.created_at.desc())
    )
    return [_adjustment_payload(a) for a in rows]


@router.post("/championships/{championship_id}/adjustments", dependencies=protected, status_code=201)
def add_adjustment(championship_id: int, body: AdjustmentBody, db: Session = Depends(get_db)):
    c = get_championship(db, championship_id)
    if body.points == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "L'ajustement ne peut pas être de 0 point.")
    driver = db.scalar(select(Driver).where(Driver.name == body.driver_name.strip()))
    if driver is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Aucun pilote « {body.driver_name} ».")
    if body.rally_id is not None and get_rally(db, body.rally_id).championship_id != c.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ce rallye n'appartient pas au championnat.")
    a = StandingAdjustment(
        championship_id=c.id, driver_id=driver.id, rally_id=body.rally_id, points=body.points, reason=body.reason.strip()
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _adjustment_payload(a)


@router.delete("/adjustments/{adjustment_id}", dependencies=protected)
def delete_adjustment(adjustment_id: int, db: Session = Depends(get_db)):
    a = db.get(StandingAdjustment, adjustment_id)
    if a is None:
        raise not_found("Ajustement")
    db.delete(a)
    db.commit()
    return {"ok": True}
