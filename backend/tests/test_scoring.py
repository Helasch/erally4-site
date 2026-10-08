from app.scoring import (
    ChampionshipCandidate,
    Movement,
    PastRallyResult,
    RallyFinish,
    compare_standings,
    compute_custom_standings,
    suggest_for_championship,
    suggest_for_rally,
)

SCORING = {1: 25, 2: 18, 3: 15, 4: 12}


def F(driver_id, position):
    return RallyFinish(driver_id, f"P{driver_id}", position)


def test_points_summed_over_rallies():
    standings = compute_custom_standings([[F(1, 1), F(2, 2)], [F(2, 1), F(1, 3)]], SCORING)
    assert [(e.name, e.points, e.per_rally) for e in standings] == [
        ("P2", 43, [18, 25]),
        ("P1", 40, [25, 15]),
    ]
    assert [e.position for e in standings] == [1, 2]


def test_absent_driver_scores_nothing_on_that_rally():
    standings = compute_custom_standings([[F(1, 1)], [F(1, 1), F(2, 2)]], SCORING)
    p2 = next(e for e in standings if e.driver_id == 2)
    assert p2.per_rally == [None, 18]
    assert p2.points == 18


def test_positions_beyond_scale_score_zero():
    standings = compute_custom_standings([[F(1, 1), F(2, 9)]], SCORING)
    assert standings[1].points == 0


def test_perfect_tie_shares_position():
    scoring = {1: 10, 2: 6, 3: 4}
    # P1 : 1er puis 3e = 14 ; P2 : 2e puis 2e = 12 ; P3 : 3e puis 1er = 14
    standings = compute_custom_standings(
        [[F(1, 1), F(2, 2), F(3, 3)], [F(3, 1), F(2, 2), F(1, 3)]], scoring
    )
    assert [e.points for e in standings] == [14, 14, 12]
    # P1 et P3 : même nombre de victoires et de 3es places -> égalité parfaite, même position
    assert [e.position for e in standings] == [1, 1, 3]


def test_countback_prefers_more_wins():
    scoring = {1: 10, 2: 5}
    # P1 : 1 victoire = 10 ; P2 : 2 deuxièmes places = 10
    standings = compute_custom_standings([[F(1, 1), F(2, 2)], [F(2, 2)]], scoring)
    assert [(e.driver_id, e.points, e.position) for e in standings] == [(1, 10, 1), (2, 10, 2)]


def test_empty():
    assert compute_custom_standings([], SCORING) == []


def test_rally_suggestions_by_platform_and_vehicle():
    history = [
        PastRallyResult(1, "Alice", "Opel Corsa Rally4", "XBOX"),
        PastRallyResult(1, "Alice", "Opel Corsa Rally4", "XBOX"),
        PastRallyResult(2, "Bob", "Peugeot 208 Rally4", "XBOX"),
        PastRallyResult(3, "Carl", "Opel Corsa Rally4", "PSN"),
        PastRallyResult(4, "Dan", "Opel Corsa Rally4", "XBOX"),
    ]
    suggestions = suggest_for_rally("Opel Corsa Rally4", "XBOX", history, names_in_file={"Dan"})
    # Carl : mauvaise plateforme ; Dan : déjà présent sous son pseudo
    assert [s.name for s in suggestions] == ["Alice", "Bob"]
    assert "même voiture" in suggestions[0].reason


def test_championship_suggestions_use_previous_points():
    candidates = [
        ChampionshipCandidate(1, "Alice", previous_points=3),
        ChampionshipCandidate(2, "Bob", previous_points=10),  # ne peut pas redescendre à 5
        ChampionshipCandidate(3, "Carl", previous_points=None),
        ChampionshipCandidate(4, "Dan", previous_points=4),  # présent dans le fichier
    ]
    suggestions = suggest_for_championship(5, candidates, names_in_file={"Dan"})
    assert [s.name for s in suggestions] == ["Alice", "Carl"]


def test_championship_suggestions_exact_expected_points_first():
    candidates = [
        ChampionshipCandidate(1, "Alice", previous_points=5),
        ChampionshipCandidate(2, "Bob", previous_points=None, expected_points=8),
        ChampionshipCandidate(3, "Carl", previous_points=None, expected_points=9),
    ]
    suggestions = suggest_for_championship(8, candidates, names_in_file=set())
    assert [s.name for s in suggestions] == ["Bob", "Alice"]


def test_compare_standings_movements():
    previous = [(1, 1, 41), (2, 2, 37), (3, 3, 30)]
    current = [(2, 1, 55), (1, 2, 50), (4, 3, 20), (3, 4, 30), (None, 5, 10)]
    assert compare_standings(current, previous) == [
        Movement(evol=1, gained=18, is_new=False),  # 2e -> 1er
        Movement(evol=-1, gained=9, is_new=False),  # 1er -> 2e
        Movement(evol=None, gained=20, is_new=True),  # nouveau pilote
        Movement(evol=-1, gained=0, is_new=False),  # n'a pas marqué
        Movement(evol=None, gained=None, is_new=False),  # WRC Player non identifié
    ]


def test_compare_standings_without_previous():
    assert compare_standings([(1, 1, 25)], None) == [Movement(None, None, False)]
