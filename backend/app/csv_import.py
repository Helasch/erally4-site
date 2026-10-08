"""Lecture et validation des exports CSV de RaceNet (EA SPORTS WRC).

Deux formats sont reconnus à partir de l'en-tête :
- rallye : Rank,DisplayName,Vehicle,Time,DifferenceToFirst,Platform
- championnat : Rank,DisplayName,PointsAccumulated

Les exports RaceNet se terminent par une virgule (colonne vide), tolérée ici.
"""

import csv
import io
import re
from dataclasses import dataclass, field

# Pseudo affiché par RaceNet pour les joueurs dont le profil est masqué
ANONYMOUS_NAME = "WRC Player"

RALLY_COLUMNS = ["Rank", "DisplayName", "Vehicle", "Time", "DifferenceToFirst", "Platform"]
CHAMPIONSHIP_COLUMNS = ["Rank", "DisplayName", "PointsAccumulated"]

MAX_ROWS = 1000
MAX_NAME_LENGTH = 64

# HH:MM:SS(.fraction) — RaceNet donne 7 décimales
_TIME_RE = re.compile(r"^(\d{1,3}):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?$")


class CsvError(Exception):
    """Erreur de validation, avec la ligne (numéro dans le fichier) et la colonne en cause."""

    def __init__(self, message: str, line: int | None = None, column: str | None = None):
        self.message = message
        self.line = line
        self.column = column
        where = []
        if line is not None:
            where.append(f"ligne {line}")
        if column is not None:
            where.append(f"colonne « {column} »")
        super().__init__(f"{', '.join(where)} : {message}" if where else message)


@dataclass
class RallyRow:
    line: int
    position: int
    name: str
    vehicle: str
    time_ms: int
    diff_ms: int
    platform: str

    @property
    def is_anonymous(self) -> bool:
        return self.name == ANONYMOUS_NAME


@dataclass
class ChampionshipRow:
    line: int
    position: int
    name: str
    points: int

    @property
    def is_anonymous(self) -> bool:
        return self.name == ANONYMOUS_NAME


@dataclass
class ParsedCsv:
    kind: str  # "rally" | "championship"
    rows: list = field(default_factory=list)


def parse_time_ms(value: str) -> int:
    match = _TIME_RE.match(value.strip())
    if not match:
        raise ValueError(f"temps invalide « {value} » (attendu HH:MM:SS.fraction)")
    hours, minutes, seconds, fraction = match.groups()
    millis = int((fraction or "0").ljust(3, "0")[:3])
    return ((int(hours) * 60 + int(minutes)) * 60 + int(seconds)) * 1000 + millis


def format_time_ms(ms: int) -> str:
    hours, rest = divmod(ms, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    seconds, millis = divmod(rest, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{millis:03d}"


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvError("le fichier n'est pas encodé en UTF-8") from exc


def _clean_header(header: list[str]) -> list[str]:
    cells = [c.strip() for c in header]
    while cells and cells[-1] == "":
        cells.pop()
    return cells


def _int(value: str, line: int, column: str, minimum: int = 0) -> int:
    try:
        number = int(value.strip())
    except ValueError:
        raise CsvError(f"nombre entier attendu, reçu « {value} »", line, column) from None
    if number < minimum:
        raise CsvError(f"valeur minimale {minimum}, reçu {number}", line, column)
    return number


def _name(value: str, line: int) -> str:
    name = value.strip()
    if not name:
        raise CsvError("pseudo vide", line, "DisplayName")
    if len(name) > MAX_NAME_LENGTH:
        raise CsvError(f"pseudo trop long (max {MAX_NAME_LENGTH} caractères)", line, "DisplayName")
    return name


def parse_csv(data: bytes) -> ParsedCsv:
    text = _decode(data)
    reader = csv.reader(io.StringIO(text))

    try:
        header = _clean_header(next(reader))
    except StopIteration:
        raise CsvError("fichier vide") from None

    if header == RALLY_COLUMNS:
        kind, columns = "rally", RALLY_COLUMNS
    elif header == CHAMPIONSHIP_COLUMNS:
        kind, columns = "championship", CHAMPIONSHIP_COLUMNS
    else:
        raise CsvError(
            "en-tête non reconnu. Attendu « "
            + ",".join(RALLY_COLUMNS)
            + " » (rallye) ou « "
            + ",".join(CHAMPIONSHIP_COLUMNS)
            + f" » (championnat), reçu « {','.join(header)} »",
            line=1,
        )

    parsed = ParsedCsv(kind=kind)
    seen_names: dict[str, int] = {}
    seen_positions: dict[int, int] = {}

    for line, raw in enumerate(reader, start=2):
        cells = [c for c in raw]
        # Ignorer les lignes complètement vides et la virgule finale de RaceNet
        if not any(c.strip() for c in cells):
            continue
        while len(cells) > len(columns) and cells[-1].strip() == "":
            cells.pop()
        if len(cells) != len(columns):
            raise CsvError(f"{len(columns)} colonnes attendues, {len(cells)} trouvées", line)

        values = dict(zip(columns, cells))
        position = _int(values["Rank"], line, "Rank", minimum=1)
        name = _name(values["DisplayName"], line)

        if position in seen_positions:
            raise CsvError(f"rang {position} déjà présent ligne {seen_positions[position]}", line, "Rank")
        seen_positions[position] = line

        if name != ANONYMOUS_NAME:
            if name.lower() in seen_names:
                raise CsvError(f"pilote « {name} » déjà présent ligne {seen_names[name.lower()]}", line, "DisplayName")
            seen_names[name.lower()] = line

        if kind == "rally":
            try:
                time_ms = parse_time_ms(values["Time"])
            except ValueError as exc:
                raise CsvError(str(exc), line, "Time") from None
            try:
                diff_ms = parse_time_ms(values["DifferenceToFirst"])
            except ValueError as exc:
                raise CsvError(str(exc), line, "DifferenceToFirst") from None
            vehicle = values["Vehicle"].strip()
            platform = values["Platform"].strip()
            if not vehicle:
                raise CsvError("voiture vide", line, "Vehicle")
            if not platform:
                raise CsvError("plateforme vide", line, "Platform")
            parsed.rows.append(
                RallyRow(line, position, name, vehicle[:64], time_ms, diff_ms, platform[:16])
            )
        else:
            points = _int(values["PointsAccumulated"], line, "PointsAccumulated")
            parsed.rows.append(ChampionshipRow(line, position, name, points))

        if len(parsed.rows) > MAX_ROWS:
            raise CsvError(f"trop de lignes (max {MAX_ROWS})", line)

    if not parsed.rows:
        raise CsvError("aucun résultat dans le fichier")

    parsed.rows.sort(key=lambda r: r.position)
    return parsed
