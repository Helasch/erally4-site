from app.scoring import Classified, TimedResult, apply_adjustments, classify


def test_classify_without_penalty_keeps_racenet_order():
    out = classify([TimedResult(1, 1000), TimedResult(2, 1500), TimedResult(3, 1800)])
    assert [(c.key, c.position, c.diff_ms, c.diff_prev_ms) for c in out] == [
        (1, 1, 0, 0),
        (2, 2, 500, 500),
        (3, 3, 800, 300),
    ]


def test_time_penalty_reorders():
    out = classify([TimedResult(1, 1000, penalty_ms=1000), TimedResult(2, 1500), TimedResult(3, 1800)])
    assert [(c.key, c.position, c.time_ms) for c in out] == [(2, 1, 1500), (3, 2, 1800), (1, 3, 2000)]
    assert out[0].diff_ms == 0


def test_disqualified_at_the_end_without_position():
    out = classify([TimedResult(1, 1000, disqualified=True), TimedResult(2, 1500)])
    assert out == [Classified(2, 1, 1500, 0, 0), Classified(1, None, 1000, None, None)]


def test_equal_times_keep_original_order():
    out = classify([TimedResult(1, 1200), TimedResult(2, 1000, penalty_ms=200)])
    assert [c.key for c in out] == [1, 2]


def test_adjustments_reorder_standings():
    entries = [(10, 1, 41), (20, 2, 37), (30, 3, 30)]
    assert apply_adjustments(entries, {}) == [(0, 1, 41), (1, 2, 37), (2, 3, 30)]
    assert apply_adjustments(entries, {10: -10}) == [(1, 1, 37), (0, 2, 31), (2, 3, 30)]
    # égalité après ajustement : l'ordre d'origine (RaceNet) départage
    assert apply_adjustments(entries, {20: -7}) == [(0, 1, 41), (1, 2, 30), (2, 3, 30)]


def test_adjustments_ignore_unidentified_rows():
    entries = [(None, 1, 20), (10, 2, 18)]
    assert apply_adjustments(entries, {10: 5}) == [(1, 1, 23), (0, 2, 20)]
