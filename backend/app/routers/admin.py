import json
from datetime import date
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
)
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
                "event_date": r.event_date,
                "result_count": len(r.results),
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
    event_date: date | None = None


class RallyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    event_date: date | None = None
    order_index: int | None = Field(default=None, ge=1, le=100)


@router.post("/championships/{championship_id}/rallies", dependencies=protected, status_code=201)
def create_rally(championship_id: int, body: RallyCreate, db: Session = Depends(get_db)):
    c = get_championship(db, championship_id)
    order = max((r.order_index for r in c.rallies), default=0) + 1
    db.add(Rally(championship_id=c.id, name=body.name.strip(), event_date=body.event_date, order_index=order))
    db.commit()
    db.refresh(c)
    return _championship_payload(c)


@router.patch("/rallies/{rally_id}", dependencies=protected)
def update_rally(rally_id: int, body: RallyUpdate, db: Session = Depends(get_db)):
    r = get_rally(db, rally_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        r.name = data["name"].strip()
    if "event_date" in data:
        r.event_date = data["event_date"]
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
