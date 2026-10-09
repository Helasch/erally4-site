"""Statut d'un rallye selon ses dates et la date du jour (heure de Paris)."""

from datetime import datetime
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")

# done : terminé avec résultats · done_pending : terminé, résultats pas encore importés
# live : en cours · next : le prochain à venir · upcoming : à venir
STATUSES = ("done", "done_pending", "live", "next", "upcoming")


def now_paris() -> datetime:
    """Heure de Paris, sans fuseau (les dates des rallyes sont saisies en heure de Paris)."""
    return datetime.now(PARIS).replace(tzinfo=None)


def compute_statuses(
    rallies: list[tuple[datetime | None, datetime | None, bool]], now: datetime
) -> list[str]:
    """Statut de chaque rallye, donnés dans l'ordre du calendrier : (début, fin, résultats importés)."""
    statuses = []
    for starts_at, ends_at, has_results in rallies:
        started = starts_at is not None and starts_at <= now
        # Entre le début et la fin : en cours, même si des résultats provisoires sont déjà importés
        # (import RaceNet pendant le rallye). Sans date de fin, des résultats signifient « terminé ».
        if started and (now <= ends_at if ends_at is not None else not has_results):
            statuses.append("live")
        elif has_results:
            statuses.append("done")
        elif ends_at is not None and ends_at < now:
            statuses.append("done_pending")
        else:
            statuses.append("upcoming")
    # Le premier rallye à venir (dans l'ordre du calendrier) est « le prochain »
    if "upcoming" in statuses:
        statuses[statuses.index("upcoming")] = "next"
    return statuses
