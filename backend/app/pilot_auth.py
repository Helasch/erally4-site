"""Sessions des pilotes connectés (séparées des sessions admin)."""

import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import PilotAccount, PilotSession
from app.security import CSRF_HEADER, _token_hash

PILOT_COOKIE = "erally4_pilot"
STATE_COOKIE = "erally4_oauth_state"
SESSION_DAYS = 30


def _now() -> datetime:
    return datetime.utcnow()


def open_pilot_session(db: Session, account: PilotAccount, response: Response) -> PilotSession:
    db.execute(delete(PilotSession).where(PilotSession.expires_at < _now()))
    token = secrets.token_urlsafe(32)
    session = PilotSession(
        token_hash=_token_hash(token),
        csrf_token=secrets.token_urlsafe(32),
        account_id=account.id,
        expires_at=_now() + timedelta(days=SESSION_DAYS),
    )
    db.add(session)
    db.commit()
    # SameSite=Lax : la session reste reconnue en arrivant sur le site depuis un lien Discord.
    # Les requêtes qui modifient quelque chose exigent en plus le jeton CSRF.
    response.set_cookie(
        PILOT_COOKIE,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return session


def close_pilot_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(PILOT_COOKIE)
    if token:
        db.execute(delete(PilotSession).where(PilotSession.token_hash == _token_hash(token)))
        db.commit()
    response.delete_cookie(PILOT_COOKIE, path="/", secure=settings.cookie_secure, samesite="lax")


def _find(request: Request, db: Session) -> PilotSession | None:
    token = request.cookies.get(PILOT_COOKIE)
    if not token:
        return None
    session = db.scalar(select(PilotSession).where(PilotSession.token_hash == _token_hash(token)))
    if session is None or session.expires_at < _now():
        return None
    return session


def optional_pilot(request: Request, db: Session = Depends(get_db)) -> PilotSession | None:
    return _find(request, db)


def require_pilot(request: Request, db: Session = Depends(get_db)) -> PilotSession:
    session = _find(request, db)
    if session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        sent = request.headers.get(CSRF_HEADER, "")
        if not hmac.compare_digest(sent, session.csrf_token):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Jeton CSRF invalide.")
    return session
