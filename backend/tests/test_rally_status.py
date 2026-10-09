from datetime import datetime

from app.rally_status import compute_statuses

NOW = datetime(2026, 3, 13, 18, 0)


def d(day, hour=0, minute=0):
    return datetime(2026, 3, day, hour, minute)


def test_statuses_from_dates():
    rallies = [
        (d(1, 20), d(4, 23, 59), True),  # passé, résultats importés
        (d(6, 20), d(9, 23, 59), False),  # passé, résultats pas encore là
        (d(12, 20), d(15, 23, 59), False),  # en cours
        (d(20, 20), d(22, 23, 59), False),  # prochain
        (d(27, 20), d(29, 23, 59), False),  # à venir
        (None, None, False),  # pas de date : à venir
    ]
    assert compute_statuses(rallies, NOW) == ["done", "done_pending", "live", "next", "upcoming", "upcoming"]


def test_bounds_are_inclusive():
    assert compute_statuses([(d(13, 18), d(14), False)], NOW) == ["live"]
    assert compute_statuses([(d(12), d(13, 18), False)], NOW) == ["live"]
    assert compute_statuses([(d(12), d(13, 17, 59), False)], NOW) == ["done_pending"]


def test_results_during_rally_stay_live():
    # Résultats provisoires importés depuis RaceNet pendant le rallye
    assert compute_statuses([(d(12), d(15), True)], NOW) == ["live"]
    # Sans date de fin, des résultats signifient que le rallye est terminé
    assert compute_statuses([(d(12), None, True)], NOW) == ["done"]


def test_without_dates_first_rally_without_results_is_next():
    assert compute_statuses([(None, None, True), (None, None, False), (None, None, False)], NOW) == [
        "done",
        "next",
        "upcoming",
    ]


def test_start_only():
    assert compute_statuses([(d(13), None, False)], NOW) == ["live"]
    assert compute_statuses([(d(14), None, False)], NOW) == ["next"]
