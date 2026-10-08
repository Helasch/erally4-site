"""Connexion Discord des pilotes, compte « Mon compte », photos de profil."""

import hmac
import os
import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.accounts import safe_next
from app.avatars import (
    FILENAME_RE,
    MAX_UPLOAD_BYTES,
    AvatarError,
    avatars_dir,
    delete_avatar,
    process_avatar,
    store_avatar,
)
from app.config import settings
from app.db import get_db
from app.discord_oauth import DiscordError, authorize_url, exchange_code, fetch_identity, is_guild_member
from app.models import PilotSession
from app.pilot_auth import (
    STATE_COOKIE,
    close_pilot_session,
    open_pilot_session,
    optional_pilot,
    require_pilot,
)
from app.services import (
    account_payload,
    delete_account,
    discord_redirect_uri,
    get_or_create_account,
    setting,
    update_account,
    vehicle_choices,
)

router = APIRouter(prefix="/api")


def _to_login(error: str) -> RedirectResponse:
    return RedirectResponse(f"/connexion?erreur={quote(error)}", status_code=status.HTTP_303_SEE_OTHER)


# --- Connexion avec Discord ---------------------------------------------------------------


@router.get("/auth/discord/login")
def discord_login(request: Request, next: str | None = None, db: Session = Depends(get_db)):
    client_id = setting(db, "discord_client_id")
    if not client_id or not setting(db, "discord_client_secret"):
        return _to_login("indisponible")
    state = secrets.token_urlsafe(24)
    url = authorize_url(client_id, discord_redirect_uri(db, request), state, bool(setting(db, "discord_guild_id")))
    response = RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)
    # Jeton anti-falsification de la connexion, et page où revenir ensuite
    response.set_cookie(
        STATE_COOKIE,
        f"{state}|{safe_next(next)}",
        max_age=600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/auth",
    )
    return response


@router.get("/auth/discord/callback")
def discord_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    stored = request.cookies.get(STATE_COOKIE, "")
    expected_state, _, next_path = stored.partition("|")
    if error:
        return _to_login("annulee")
    if not code or not state or not expected_state or not hmac.compare_digest(state, expected_state):
        return _to_login("session")

    try:
        token = exchange_code(
            setting(db, "discord_client_id"),
            setting(db, "discord_client_secret"),
            code,
            discord_redirect_uri(db, request),
        )
        discord_id, username = fetch_identity(token)
        guild_id = setting(db, "discord_guild_id")
        if guild_id and not is_guild_member(token, guild_id):
            return _to_login("serveur")
    except DiscordError:
        return _to_login("discord")

    account = get_or_create_account(db, discord_id, username)
    response = RedirectResponse(safe_next(next_path), status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(STATE_COOKIE, path="/api/auth")
    open_pilot_session(db, account, response)
    return response


@router.post("/auth/logout")
def pilot_logout(
    request: Request, response: Response, db: Session = Depends(get_db), _: PilotSession = Depends(require_pilot)
):
    close_pilot_session(db, request, response)
    return {"ok": True}


# --- Mon compte ---------------------------------------------------------------------------


@router.get("/me")
def me(session: PilotSession | None = Depends(optional_pilot)):
    """Pilote connecté (null si personne n'est connecté : ce n'est pas une erreur)."""
    if session is None:
        return None
    return {"account": account_payload(session.account), "csrf": session.csrf_token}


class AccountUpdate(BaseModel):
    site_name: str | None = Field(default=None, max_length=64)
    racenet_name: str | None = Field(default=None, max_length=100)
    vehicle: str | None = Field(default=None, max_length=64)


@router.patch("/me")
def update_me(body: AccountUpdate, session: PilotSession = Depends(require_pilot), db: Session = Depends(get_db)):
    account = update_account(db, session.account, body.model_dump(exclude_unset=True))
    return account_payload(account)


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...), session: PilotSession = Depends(require_pilot), db: Session = Depends(get_db)
):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        webp = process_avatar(data)
    except AvatarError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    account = session.account
    old = account.avatar_file
    account.avatar_file = store_avatar(account.id, webp)
    db.commit()
    delete_avatar(old)
    return account_payload(account)


@router.delete("/me/avatar")
def remove_avatar(session: PilotSession = Depends(require_pilot), db: Session = Depends(get_db)):
    account = session.account
    delete_avatar(account.avatar_file)
    account.avatar_file = None
    db.commit()
    return account_payload(account)


@router.delete("/me")
def delete_me(
    request: Request,
    response: Response,
    session: PilotSession = Depends(require_pilot),
    db: Session = Depends(get_db),
):
    account = session.account
    close_pilot_session(db, request, response)
    delete_account(db, account)
    return {"ok": True}


@router.get("/vehicles")
def vehicles(db: Session = Depends(get_db)):
    return vehicle_choices(db)


# --- Photos ------------------------------------------------------------------------------


@router.get("/media/avatars/{filename}")
def avatar_file(filename: str):
    if not FILENAME_RE.match(filename):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image introuvable.")
    path = os.path.join(avatars_dir(), filename)
    if not os.path.isfile(path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image introuvable.")
    # Le nom de fichier change à chaque nouvelle photo : on peut le garder longtemps en cache
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable"})
