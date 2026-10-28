"""Spéciale importée en CSV : général du rallye recalculé à partir des spéciales, et points du rallye."""

from types import SimpleNamespace

from app.csv_import import ANONYMOUS_NAME
from app.services import StageLine, _rally_points_by_key, contiguous, general_rows

RACENET = SimpleNamespace(scoring_mode="racenet", scoring=[])


def line(stage, position, name, time_ms):
    return StageLine(stage, position, ("name", name), None, name, "Peugeot 208 Rally4", "PSN", time_ms)


def test_general_sums_stage_times_of_drivers_who_ran_every_stage():
    lines = [
        line(1, 1, "A", 60_000),
        line(1, 2, "B", 61_000),
        line(1, 3, "C", 62_000),
        line(2, 1, "B", 70_000),
        line(2, 2, "A", 72_000),
    ]
    rows = general_rows(lines, [1, 2], [])
    # C n'a pas couru l'ES2 : il n'est pas classé, comme dans le général de RaceNet
    assert [(position, raw_name, total, diff) for position, _, raw_name, _, total, diff, _ in rows] == [
        (1, "B", 131_000, 0),
        (2, "A", 132_000, 1_000),
    ]


def test_equal_totals_split_by_rank_on_last_stage():
    lines = [line(1, 1, "A", 60_000), line(1, 2, "B", 61_000), line(2, 1, "B", 70_000), line(2, 2, "A", 71_000)]
    assert [raw_name for _, _, raw_name, *_ in general_rows(lines, [1, 2], [])] == ["B", "A"]


def test_unidentified_wrc_players_keep_their_racenet_total():
    lines = [line(1, 1, "A", 60_000), line(2, 1, "A", 70_000)]
    untracked = [SimpleNamespace(time_ms=125_000, raw_name=ANONYMOUS_NAME, vehicle="Opel Corsa Rally4", platform="XBOX")]
    rows = general_rows(lines, [1, 2], untracked)
    assert [(position, raw_name, total) for position, _, raw_name, _, total, _, _ in rows] == [
        (1, ANONYMOUS_NAME, 125_000),
        (2, "A", 130_000),
    ]


def test_contiguous_stage_numbers():
    assert contiguous([1, 2, 3])
    assert contiguous([2, 1])
    assert not contiguous([1, 3])
    assert not contiguous([])


def test_rally_points_follow_penalties_and_power_stage():
    a, b, c = ("name", "A"), ("name", "B"), ("name", "C")
    # B a la meilleure Power Stage mais une pénalité de 5 s qui le fait passer 2e ; C est non classé
    rows = [(b, 100_000, 5_000, False), (a, 102_000, 0, False), (c, 90_000, 0, True)]
    points = _rally_points_by_key(RACENET, rows, {b: 1, a: 2, c: 3})
    assert points == {a: (1, 25 + 4), b: (2, 18 + 5), c: (None, 0)}
