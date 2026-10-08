"""Commandes d'administration, à lancer dans le conteneur :

    docker exec -it erally4-api python -m app.cli create-admin
    docker exec -it erally4-api python -m app.cli reset-password
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Admin
from app.security import hash_password

MIN_PASSWORD_LENGTH = 12


def _ask_password() -> str:
    if not sys.stdin.isatty():
        password = sys.stdin.readline().rstrip("\r\n")
    else:
        password = getpass.getpass("Mot de passe : ")
        if getpass.getpass("Confirmation : ") != password:
            sys.exit("Les mots de passe ne correspondent pas.")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Mot de passe trop court ({MIN_PASSWORD_LENGTH} caractères minimum).")
    return password


def _ask_username(value: str | None) -> str:
    username = (value or input("Identifiant : ")).strip()
    if not username or len(username) > 64:
        sys.exit("Identifiant invalide (1 à 64 caractères).")
    return username


def create_admin(username: str | None) -> None:
    username = _ask_username(username)
    with SessionLocal() as db:
        if db.scalar(select(Admin).where(Admin.username == username)):
            sys.exit(f"L'admin « {username} » existe déjà.")
        db.add(Admin(username=username, password_hash=hash_password(_ask_password())))
        db.commit()
    print(f"Admin « {username} » créé.")


def reset_password(username: str | None) -> None:
    username = _ask_username(username)
    with SessionLocal() as db:
        admin = db.scalar(select(Admin).where(Admin.username == username))
        if admin is None:
            sys.exit(f"Admin « {username} » introuvable.")
        admin.password_hash = hash_password(_ask_password())
        admin.failed_attempts = 0
        admin.locked_until = None
        db.commit()
    print(f"Mot de passe de « {username} » modifié.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("create-admin", "reset-password"):
        cmd = sub.add_parser(name)
        cmd.add_argument("username", nargs="?")
    args = parser.parse_args()
    {"create-admin": create_admin, "reset-password": reset_password}[args.command](args.username)


if __name__ == "__main__":
    main()
