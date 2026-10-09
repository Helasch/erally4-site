from datetime import datetime

import pytest

from app.racenet import RacenetError, parse_event, player_key, strip_identities


def entry(ssid, name, rank, time="00:10:00", penalty="00:00:00", accumulated=None, platform=2, **extra):
    return {
        "ssid": ssid,
        "wrcPlayerId": None,
        "displayName": name,
        "rank": rank,
        "time": time,
        "timePenalty": penalty,
        "timeAccumulated": accumulated or time,
        "differenceToFirst": "00:00:00",
        "vehicle": "Peugeot 208 Rally4",
        "platform": platform,
        "nationalityID": 7,
        **extra,
    }


def payload(**overrides):
    data = {
        "championship": {
            "id": "CHAMP",
            "events": [
                {
                    "id": "EV1",
                    "status": 2,
                    "absoluteOpenDate": "2026-09-16T10:00:00Z",
                    "absoluteCloseDate": "2026-09-23T10:00:00Z",
                    "eventSettings": {"location": "Rallye Monte-Carlo"},
                    "stages": [
                        {
                            "leaderboardID": "LB1",
                            "stageSettings": {
                                "route": "La Bollène-Vésubie - Peïra Cava",
                                "distance": 18.5,
                                "weatherAndSurface": "Overcast (Ice)",
                                "timeOfDay": "Night",
                            },
                        },
                        {"leaderboardID": "LB2", "stageSettings": {"route": "Col de Turini"}},
                    ],
                },
                {"id": "EV2", "status": 1, "stages": []},
            ],
        },
        "event_id": "EV1",
        "stages": [
            {
                "leaderboard_id": "LB1",
                "entries": [
                    entry("a", "Alice", 1, "00:14:30.5540000"),
                    entry("b", "Bob", 2, "00:14:42.7930000", penalty="00:00:10"),
                    # doublon renvoyé par la pagination
                    entry("b", "Bob", 2, "00:14:42.7930000", penalty="00:00:10"),
                    entry("c", "Chloé", 3, "00:25:00", penalty="00:25:00", platform=128),
                ],
            },
            {
                "leaderboard_id": "LB2",
                "entries": [entry("b", "Bob", 1, "00:10:01.7860000"), entry("a", "Alice", 2, "00:10:05")],
            },
        ],
        "overall": [
            entry("a", "Alice", 1, accumulated="00:24:35.5540000"),
            entry("b", "Bob", 2, accumulated="00:24:44.5790000"),
        ],
        "standings": [
            {"ssid": "a", "displayName": "Alice", "rank": 1, "pointsAccumulated": 25},
            {"ssid": "b", "displayName": "Bob", "rank": 2, "pointsAccumulated": 18},
        ],
    }
    data.update(overrides)
    return data


def test_parse_event_reads_stages_overall_and_standings():
    event = parse_event(payload())
    assert event.location == "Rallye Monte-Carlo"
    assert event.championship_id == "CHAMP"
    # Dates converties en heure de Paris (UTC+2 en septembre)
    assert event.starts_at == datetime(2026, 9, 16, 12, 0)
    assert event.ends_at == datetime(2026, 9, 23, 12, 0)

    es1, es2 = event.stages
    assert (es1.number, es1.name, es1.distance_km, es1.conditions, es1.time_of_day) == (
        1,
        "La Bollène-Vésubie - Peïra Cava",
        18.5,
        "Overcast (Ice)",
        "Night",
    )
    assert es2.distance_km is None and es2.conditions is None
    # Doublon supprimé, écart au premier calculé
    assert [(e.name, pos, diff) for e, pos, diff in es1.entries] == [
        ("Alice", 1, 0),
        ("Bob", 2, 12_239),
        ("Chloé", 3, 629_446),
    ]
    assert es1.entries[1][0].penalty_ms == 10_000
    assert es1.entries[2][0].platform == "PC"

    assert [(e.name, pos, total, diff) for e, pos, total, diff in event.overall] == [
        ("Alice", 1, 1_475_554, 0),
        ("Bob", 2, 1_484_579, 9_025),
    ]
    assert [(e.name, e.points) for e in event.standings] == [("Alice", 25), ("Bob", 18)]
    assert set(event.drivers()) == {player_key("a"), player_key("b"), player_key("c")}


def test_player_key_hides_ea_identifier():
    key = player_key("1234567890")
    assert key == player_key("1234567890") and key != player_key("1234567891")
    assert "1234567890" not in key and len(key) == 32


def test_overall_reordered_by_cumulative_time():
    data = payload(
        overall=[
            entry("a", "Alice", 1, accumulated="00:30:00"),
            entry("b", "Bob", 2, accumulated="00:29:00"),
        ]
    )
    assert [e.name for e, *_ in parse_event(data).overall] == ["Bob", "Alice"]


def test_stage_mismatch_is_rejected():
    data = payload()
    data["stages"][1]["leaderboard_id"] = "AUTRE"
    with pytest.raises(RacenetError, match="ES2"):
        parse_event(data)


def test_missing_stage_is_rejected():
    data = payload()
    data["stages"].pop()
    with pytest.raises(RacenetError, match="nombre de spéciales"):
        parse_event(data)


def test_unknown_event_is_rejected():
    with pytest.raises(RacenetError, match="épreuve introuvable"):
        parse_event(payload(event_id="NOPE"))


def test_invalid_time_is_rejected():
    data = payload()
    data["stages"][0]["entries"][0]["time"] = "bientôt"
    with pytest.raises(RacenetError, match="temps invalide"):
        parse_event(data)


def test_entry_without_ssid_is_rejected():
    data = payload()
    data["stages"][0]["entries"][0]["ssid"] = None
    with pytest.raises(RacenetError, match="identifiant"):
        parse_event(data)


def test_strip_identities_replaces_ssid():
    stripped = strip_identities(payload())
    first = stripped["stages"][0]["entries"][0]
    assert first["ssid"] == player_key("a")
    assert "wrcPlayerId" not in first
    assert stripped["event_id"] == "EV1"
