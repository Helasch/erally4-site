"""Calcul des classements et suggestions d'identification des « WRC Player ».

Fonctions pures (sans base de données) pour pouvoir être testées facilement.
"""

from collections import Counter
from dataclasses import dataclass, field


# --- Classement général avec barème personnalisé -----------------------------


@dataclass
class RallyFinish:
    driver_id: int
    name: str
    position: int


@dataclass
class StandingEntry:
    position: int
    driver_id: int
    name: str
    points: int
    # Points marqués sur chaque rallye (None = absent)
    per_rally: list[int | None] = field(default_factory=list)


def compute_custom_standings(
    rallies: list[list[RallyFinish]], scoring: dict[int, int]
) -> list[StandingEntry]:
    """Classement général à partir des résultats de chaque rallye et d'un barème {place: points}.

    Départage des égalités de points au nombre de meilleures places (victoires, puis 2es places, etc.).
    Les pilotes toujours à égalité partagent la même position.
    """
    totals: dict[int, StandingEntry] = {}
    finishes: dict[int, Counter] = {}

    for index, results in enumerate(rallies):
        for finish in results:
            entry = totals.get(finish.driver_id)
            if entry is None:
                entry = StandingEntry(0, finish.driver_id, finish.name, 0, [None] * len(rallies))
                totals[finish.driver_id] = entry
                finishes[finish.driver_id] = Counter()
            points = scoring.get(finish.position, 0)
            entry.points += points
            entry.per_rally[index] = points
            finishes[finish.driver_id][finish.position] += 1

    max_position = max((p for c in finishes.values() for p in c), default=0)

    def sort_key(entry: StandingEntry):
        countback = tuple(-finishes[entry.driver_id][p] for p in range(1, max_position + 1))
        return (-entry.points, countback)

    ordered = sorted(totals.values(), key=lambda e: (sort_key(e), e.name.lower()))

    previous_key = None
    for rank, entry in enumerate(ordered, start=1):
        key = sort_key(entry)
        entry.position = ordered[rank - 2].position if key == previous_key else rank
        previous_key = key

    return ordered


# --- Statistiques d'un pilote -------------------------------------------------


@dataclass
class Finish:
    position: int
    finishers: int
    diff_ms: int


@dataclass
class DriverStats:
    rallies: int = 0
    wins: int = 0
    podiums: int = 0
    top10: int = 0
    best: int | None = None
    average_position: float | None = None
    # Écart moyen au vainqueur, en millisecondes
    average_gap_ms: int | None = None


def driver_stats(finishes: list[Finish]) -> DriverStats:
    if not finishes:
        return DriverStats()
    positions = [f.position for f in finishes]
    return DriverStats(
        rallies=len(finishes),
        wins=sum(1 for p in positions if p == 1),
        podiums=sum(1 for p in positions if p <= 3),
        top10=sum(1 for p in positions if p <= 10),
        best=min(positions),
        average_position=round(sum(positions) / len(positions), 1),
        average_gap_ms=round(sum(f.diff_ms for f in finishes) / len(finishes)),
    )


# --- Évolution entre deux classements -----------------------------------------


@dataclass
class Movement:
    # Places gagnées (+) ou perdues (-) ; None si pas de comparaison possible
    evol: int | None
    # Points marqués depuis le classement précédent ; None si pas de comparaison possible
    gained: int | None
    # Absent du classement précédent
    is_new: bool


def compare_standings(
    current: list[tuple[int | None, int, int]],
    previous: list[tuple[int | None, int, int]] | None,
) -> list[Movement]:
    """Compare deux classements donnés sous forme (clé pilote, position, points).

    La clé est l'identifiant du pilote, ou None pour un « WRC Player » non identifié
    (aucune comparaison possible). Sans classement précédent, rien n'est comparé.
    """
    if previous is None:
        return [Movement(None, None, False) for _ in current]
    before = {key: (position, points) for key, position, points in previous if key is not None}
    movements = []
    for key, position, points in current:
        if key is None:
            movements.append(Movement(None, None, False))
        elif key not in before:
            movements.append(Movement(None, points, True))
        else:
            old_position, old_points = before[key]
            movements.append(Movement(old_position - position, points - old_points, False))
    return movements


# --- Suggestions pour les « WRC Player » --------------------------------------


@dataclass
class Suggestion:
    driver_id: int
    name: str
    reason: str


@dataclass
class PastRallyResult:
    driver_id: int
    name: str
    vehicle: str
    platform: str


def suggest_for_rally(
    vehicle: str,
    platform: str,
    history: list[PastRallyResult],
    names_in_file: set[str],
    limit: int = 3,
) -> list[Suggestion]:
    """Pilotes déjà vus avec la même plateforme (et idéalement la même voiture),
    absents sous leur vrai pseudo du fichier importé."""
    names_lower = {n.lower() for n in names_in_file}
    scores: dict[int, tuple[int, int, str]] = {}  # driver_id -> (same_vehicle_count, same_platform_count, name)

    for past in history:
        if past.name.lower() in names_lower or past.platform != platform:
            continue
        same_vehicle, same_platform, _ = scores.get(past.driver_id, (0, 0, past.name))
        scores[past.driver_id] = (
            same_vehicle + (past.vehicle == vehicle),
            same_platform + 1,
            past.name,
        )

    ranked = sorted(scores.items(), key=lambda item: (-item[1][0], -item[1][1], item[1][2].lower()))
    suggestions = []
    for driver_id, (same_vehicle, same_platform, name) in ranked[:limit]:
        reason = f"{platform}, " + (
            f"même voiture sur {same_vehicle} rallye(s)" if same_vehicle else "voiture différente"
        )
        suggestions.append(Suggestion(driver_id, name, reason))
    return suggestions


@dataclass
class ChampionshipCandidate:
    driver_id: int
    name: str
    # Points au dernier classement général importé (None = absent du classement précédent)
    previous_points: int | None
    # Points attendus d'après les rallyes, quand on peut les calculer (sinon None)
    expected_points: int | None = None


def suggest_for_championship(
    points: int,
    candidates: list[ChampionshipCandidate],
    names_in_file: set[str],
    limit: int = 3,
) -> list[Suggestion]:
    """Pilotes connus du championnat, absents sous leur vrai pseudo du fichier,
    dont les points sont cohérents avec ceux de la ligne « WRC Player »."""
    names_lower = {n.lower() for n in names_in_file}
    ranked: list[tuple[tuple, Suggestion]] = []

    for c in candidates:
        if c.name.lower() in names_lower:
            continue
        if c.expected_points is not None:
            if c.expected_points != points:
                continue
            ranked.append(((0, 0, c.name.lower()), Suggestion(c.driver_id, c.name, "points identiques à ceux calculés")))
            continue
        previous = c.previous_points or 0
        if previous > points:
            continue  # les points cumulés ne peuvent pas baisser
        gap = points - previous
        reason = (
            f"{previous} pt(s) au classement précédent (+{gap})"
            if c.previous_points is not None
            else "absent du classement précédent"
        )
        ranked.append(((1, gap, c.name.lower()), Suggestion(c.driver_id, c.name, reason)))

    ranked.sort(key=lambda item: item[0])
    return [s for _, s in ranked[:limit]]
