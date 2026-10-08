"""Connexion « Se connecter avec Discord » (OAuth2, code d'autorisation)."""

from urllib.parse import urlencode

import httpx

AUTHORIZE_URL = "https://discord.com/oauth2/authorize"
API = "https://discord.com/api/v10"
TIMEOUT = httpx.Timeout(10.0)


class DiscordError(Exception):
    pass


def authorize_url(client_id: str, redirect_uri: str, state: str, check_guild: bool) -> str:
    # « identify » : pseudo et avatar ; « guilds » : liste des serveurs, pour vérifier l'appartenance
    scope = "identify guilds" if check_guild else "identify"
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "scope": scope,
            "state": state,
            "redirect_uri": redirect_uri,
            "prompt": "none",
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> str:
    try:
        response = httpx.post(
            f"{API}/oauth2/token",
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
            auth=(client_id, client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise DiscordError("Discord est injoignable.") from exc
    if response.status_code != 200:
        raise DiscordError("Connexion Discord refusée.")
    return response.json()["access_token"]


def _get(token: str, path: str):
    try:
        response = httpx.get(f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        raise DiscordError("Discord est injoignable.") from exc
    if response.status_code != 200:
        raise DiscordError("Impossible de lire le profil Discord.")
    return response.json()


def fetch_identity(token: str) -> tuple[str, str]:
    """Identifiant Discord et nom affiché."""
    user = _get(token, "/users/@me")
    return str(user["id"]), (user.get("global_name") or user.get("username") or "Pilote")[:64]


def is_guild_member(token: str, guild_id: str) -> bool:
    return any(str(g.get("id")) == guild_id for g in _get(token, "/users/@me/guilds"))
