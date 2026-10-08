"""Authentification admin : mots de passe argon2id, sessions serveur, CSRF, limitation des tentatives."""

import hashlib
import hmac
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Admin, AdminSession

SESSION_COOKIE = "erally4_session"
CSRF_HEADER = "X-CSRF-Token"

# Paramètres argon2id par défaut de argon2-cffi (RFC 9106, profil « low memory »)
_hasher = PasswordHasher()
_DUMMY_HASH = _hasher.hash(secrets.token_hex(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def burn_verify_time(password: str) -> None:
    """Même coût qu'une vraie vérification, pour ne pas révéler si un identifiant existe."""
    verify_password(_DUMMY_HASH, password)


def _token_hash(token: str) -> str:
    return hmac.new(settings.session_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def _now() -> datetime:
    return datetime.utcnow()


# --- Limitation par IP (mémoire du processus) ---------------------------------

_attempts: dict[str, deque] = {}
_attempts_lock = threading.Lock()


def client_ip(request: Request) -> str:
    # Uvicorn applique X-Forwarded-For (--proxy-headers) ; repli sur l'IP de connexion
    return request.client.host if request.client else "unknown"


def check_ip_rate_limit(ip: str) -> None:
    now = time.monotonic()
    with _attempts_lock:
        window = _attempts.setdefault(ip, deque())
        while window and now - window[0] > settings.login_ip_window_seconds:
            window.popleft()
        if len(window) >= settings.login_ip_max_attempts:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Trop de tentatives, réessayez plus tard.")
        window.append(now)


# --- Connexion / sessions ------------------------------------------------------


def authenticate(db: Session, username: str, password: str) -> Admin:
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants invalides.")
    admin = db.scalar(select(Admin).where(Admin.username == username))
    if admin is None:
        burn_verify_time(password)
        raise invalid

    if admin.locked_until and admin.locked_until > _now():
        burn_verify_time(password)
        raise HTTPException(status.HTTP_423_LOCKED, "Compte temporairement verrouillé, réessayez plus tard.")

    if not verify_password(admin.password_hash, password):
        admin.failed_attempts += 1
        if admin.failed_attempts >= settings.login_max_failures:
            admin.locked_until = _now() + timedelta(minutes=settings.login_lock_minutes)
            admin.failed_attempts = 0
        db.commit()
        raise invalid

    admin.failed_attempts = 0
    admin.locked_until = None
    if _hasher.check_needs_rehash(admin.password_hash):
        admin.password_hash = hash_password(password)
    db.commit()
    return admin


def open_session(db: Session, admin: Admin, response: Response) -> AdminSession:
    db.execute(delete(AdminSession).where(AdminSession.expires_at < _now()))
    token = secrets.token_urlsafe(32)
    session = AdminSession(
        token_hash=_token_hash(token),
        csrf_token=secrets.token_urlsafe(32),
        admin_id=admin.id,
        expires_at=_now() + timedelta(hours=settings.session_hours),
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return session


def close_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.execute(delete(AdminSession).where(AdminSession.token_hash == _token_hash(token)))
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/", secure=settings.cookie_secure, samesite="strict")


def current_session(request: Request, db: Session = Depends(get_db)) -> AdminSession:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == _token_hash(token)))
    if session is None or session.expires_at < _now():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée.")

    # CSRF : toute requête qui modifie quelque chose doit renvoyer le jeton de la session
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        sent = request.headers.get(CSRF_HEADER, "")
        if not hmac.compare_digest(sent, session.csrf_token):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Jeton CSRF invalide.")
    return session
