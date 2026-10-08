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
        if has_results:
            statuses.append("done")
        elif ends_at is not None and ends_at < now:
            statuses.append("done_pending")
        elif starts_at is not None and starts_at <= now and (ends_at is None or now <= ends_at):
            statuses.append("live")
        else:
            statuses.append("upcoming")
    # Le premier rallye à venir (dans l'ordre du calendrier) est « le prochain »
    if "upcoming" in statuses:
        statuses[statuses.index("upcoming")] = "next"
    return statuses
