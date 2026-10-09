"""Lecture des données récupérées sur RaceNet par le favori « eRally4 » (import direct).

Le favori, lancé sur racenet.com, ne fait que relayer à la page d'import de l'admin les réponses
brutes de l'API RaceNet (non officielle). Tout est validé ici : rien n'est supposé fiable.

Données reçues :
- `championship` : le championnat de club (`currentChampionship`), avec ses épreuves et leurs spéciales ;
- `event_id` : l'épreuve à importer ;
- `stages` : pour chaque spéciale de l'épreuve, dans l'ordre, `leaderboard_id` et `entries` ;
- `overall` : le classement cumulé de la dernière spéciale, c'est-à-dire le général du rallye
  (seuls les pilotes ayant terminé tout le rallye y figurent, comme dans l'export « stage_overall ») ;
- `standings` : le classement du championnat (facultatif, uniquement pour la dernière épreuve).
"""

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.csv_import import ANONYMOUS_NAME, MAX_NAME_LENGTH, parse_time_ms

PARIS = ZoneInfo("Europe/Paris")

MAX_STAGES = 20
MAX_ENTRIES = 1000

# Plateformes RaceNet (champ `platform`). RaceNet ne distingue pas Steam et l'app EA : 128 = PC.
PLATFORMS = {1: "XBOX", 2: "PSN", 3: "STEAM", 128: "PC"}


class RacenetError(Exception):
    """Données RaceNet inattendues (format modifié par EA, épreuve introuvable…)."""


def player_key(ssid: str) -> str:
    """Identifiant RaceNet conservé en base : empreinte de l'identifiant EA du joueur (`ssid`).

    Seule l'égalité nous intéresse (reconnaître le même joueur d'un import à l'autre) :
    l'identifiant EA lui-même n'est jamais stocké.
    """
    return hashlib.sha256(f"racenet:{ssid}".encode()).hexdigest()[:32]


@dataclass
class Entry:
    racenet_id: str
    name: str
    rank: int
    vehicle: str = ""
    platform: str = ""
    time_ms: int = 0
    penalty_ms: int = 0
    accumulated_ms: int = 0
    points: int = 0

    @property
    def is_anonymous(self) -> bool:
        return self.name == ANONYMOUS_NAME


@dataclass
class ParsedStage:
    number: int
    name: str
    distance_km: float | None
    conditions: str | None
    time_of_day: str | None
    # Classement de la spéciale : (pilote, position, écart au premier en ms)
    entries: list[tuple[Entry, int, int]] = field(default_factory=list)


@dataclass
class ParsedEvent:
    event_id: str
    championship_id: str
    location: str
    status: int  # 0 à venir, 1 en cours, 2 terminé
    starts_at: datetime | None  # heure de Paris, sans fuseau
    ends_at: datetime | None
    stages: list[ParsedStage]
    # Général du rallye : (pilote, position, temps total, écart au premier en ms)
    overall: list[tuple[Entry, int, int, int]]
    # Classement du championnat après l'épreuve (vide s'il n'a pas été récupéré)
    standings: list[Entry] = field(default_factory=list)

    def drivers(self) -> dict[str, Entry]:
        """Tous les pilotes vus dans l'épreuve, par identifiant RaceNet."""
        seen: dict[str, Entry] = {}
        for stage in self.stages:
            for entry, _, _ in stage.entries:
                seen[entry.racenet_id] = entry
        for entry, _, _, _ in self.overall:
            seen[entry.racenet_id] = entry
        for entry in self.standings:
            seen.setdefault(entry.racenet_id, entry)
        return seen


def _text(value, what: str, max_length: int, required: bool = True) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise RacenetError(f"{what} manquant")
        return None
    if not isinstance(value, (str, int)):
        raise RacenetError(f"{what} invalide")
    return str(value).strip()[:max_length]


def _time(value, what: str) -> int:
    if value in (None, ""):
        return 0
    try:
        return parse_time_ms(str(value))
    except ValueError:
        raise RacenetError(f"{what} : temps invalide « {value} »") from None


def _int(value, what: str, minimum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise RacenetError(f"{what} invalide")
    return value


def _paris(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(PARIS).replace(tzinfo=None)


def parse_entry(raw: dict) -> Entry:
    if not isinstance(raw, dict):
        raise RacenetError("ligne de classement invalide")
    name = _text(raw.get("displayName"), "pseudo", MAX_NAME_LENGTH)
    ssid = _text(raw.get("ssid"), f"identifiant de « {name} »", 128)
    platform = raw.get("platform")
    points = raw.get("pointsAccumulated", raw.get("points", 0))
    return Entry(
        racenet_id=player_key(ssid),
        name=name,
        rank=_int(raw.get("rank"), f"rang de « {name} »", 1),
        vehicle=_text(raw.get("vehicle"), "voiture", 64, required=False) or "",
        platform=PLATFORMS.get(platform, str(platform)[:16]) if platform is not None else "",
        time_ms=_time(raw.get("time"), name),
        penalty_ms=_time(raw.get("timePenalty"), name),
        accumulated_ms=_time(raw.get("timeAccumulated"), name),
        points=points if isinstance(points, int) and not isinstance(points, bool) and points >= 0 else 0,
    )


def _entries(raw_entries, what: str) -> list[Entry]:
    if not isinstance(raw_entries, list):
        raise RacenetError(f"{what} : classement manquant")
    if len(raw_entries) > MAX_ENTRIES:
        raise RacenetError(f"{what} : trop de lignes")
    # La pagination de RaceNet peut renvoyer deux fois le même pilote
    unique: dict[str, Entry] = {}
    for raw in raw_entries:
        entry = parse_entry(raw)
        unique.setdefault(entry.racenet_id, entry)
    return sorted(unique.values(), key=lambda e: e.rank)


def _ranked(entries: list[Entry], time_of) -> list[tuple[Entry, int, int, int]]:
    """Classe au temps, l'ordre RaceNet départageant les égalités : (pilote, position, temps, écart)."""
    ordered = sorted(entries, key=lambda e: (time_of(e), e.rank))
    if not ordered:
        return []
    best = time_of(ordered[0])
    return [(e, i + 1, time_of(e), time_of(e) - best) for i, e in enumerate(ordered)]


def parse_event(payload: dict) -> ParsedEvent:
    if not isinstance(payload, dict):
        raise RacenetError("données RaceNet invalides")
    championship = payload.get("championship")
    if not isinstance(championship, dict) or not isinstance(championship.get("events"), list):
        raise RacenetError("championnat RaceNet introuvable")
    event_id = payload.get("event_id")
    event = next((e for e in championship["events"] if isinstance(e, dict) and e.get("id") == event_id), None)
    if event is None:
        raise RacenetError("épreuve introuvable dans le championnat RaceNet")

    stage_defs = event.get("stages") or []
    raw_stages = payload.get("stages")
    if not isinstance(raw_stages, list) or not raw_stages:
        raise RacenetError("aucune spéciale reçue")
    if len(raw_stages) != len(stage_defs) or len(raw_stages) > MAX_STAGES:
        raise RacenetError("nombre de spéciales incohérent avec l'épreuve RaceNet")

    stages = []
    for number, (definition, raw) in enumerate(zip(stage_defs, raw_stages), start=1):
        what = f"ES{number}"
        definition = definition if isinstance(definition, dict) else {}
        if not isinstance(raw, dict) or raw.get("leaderboard_id") != definition.get("leaderboardID"):
            raise RacenetError(f"{what} : classement reçu pour une autre spéciale")
        settings = definition.get("stageSettings") or {}
        distance = settings.get("distance")
        stage = ParsedStage(
            number=number,
            name=_text(settings.get("route"), f"{what} : nom", 120, required=False) or what,
            distance_km=float(distance) if isinstance(distance, (int, float)) and distance > 0 else None,
            conditions=_text(settings.get("weatherAndSurface"), f"{what} : conditions", 64, required=False),
            time_of_day=_text(settings.get("timeOfDay"), f"{what} : horaire", 32, required=False),
        )
        ranked = _ranked(_entries(raw.get("entries"), what), lambda e: e.time_ms)
        stage.entries = [(e, position, diff) for e, position, _, diff in ranked]
        stages.append(stage)

    standings = payload.get("standings")
    settings = event.get("eventSettings") or {}
    status = event.get("status")
    return ParsedEvent(
        event_id=_text(event_id, "identifiant de l'épreuve", 32),
        championship_id=_text(championship.get("id"), "identifiant du championnat", 32),
        location=_text(settings.get("location"), "lieu", 120, required=False) or "Épreuve RaceNet",
        status=status if isinstance(status, int) else 0,
        starts_at=_paris(event.get("absoluteOpenDate")),
        ends_at=_paris(event.get("absoluteCloseDate")),
        stages=stages,
        overall=_ranked(_entries(payload.get("overall"), "Général"), lambda e: e.accumulated_ms),
        standings=_entries(standings, "Championnat") if standings else [],
    )


def strip_identities(payload: dict) -> dict:
    """Copie des données reçues sans les identifiants EA, pour l'archive de l'import."""

    def clean(value):
        if isinstance(value, dict):
            return {
                k: (player_key(str(v)) if k == "ssid" and v else clean(v))
                for k, v in value.items()
                if k != "wrcPlayerId"
            }
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    return clean(payload)
