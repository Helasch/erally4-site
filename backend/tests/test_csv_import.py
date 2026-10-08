import pytest

from app.csv_import import CsvError, format_time_ms, parse_csv, parse_time_ms

# Même structure que les exports RaceNet (virgule finale incluse), pseudos fictifs
RALLY_CSV = """Rank,DisplayName,Vehicle,Time,DifferenceToFirst,Platform,
1,PiloteA,Peugeot 208 Rally4,01:08:48.9450000,00:00:00,PSN,
2,PiloteB,Renault Clio Rally4,01:09:25.2610000,00:00:36.3160000,STEAM,
3,WRC Player,Opel Corsa Rally4,01:28:35.3750000,00:19:46.4300000,XBOX,
4,WRC Player,Renault Clio Rally4,01:35:33.2970000,00:26:44.3520000,PSN,
"""

CHAMPIONSHIP_CSV = """Rank,DisplayName,PointsAccumulated,
1,PiloteA,41,
2,PiloteB,37,
3,WRC Player,1,
4,WRC Player,0,
"""


def test_parse_rally():
    parsed = parse_csv(RALLY_CSV.encode())
    assert parsed.kind == "rally"
    assert len(parsed.rows) == 4
    first = parsed.rows[0]
    assert (first.position, first.name, first.vehicle, first.platform) == (1, "PiloteA", "Peugeot 208 Rally4", "PSN")
    assert first.time_ms == 4_128_945
    assert first.diff_ms == 0
    assert parsed.rows[1].diff_ms == 36_316


def test_parse_championship():
    parsed = parse_csv(CHAMPIONSHIP_CSV.encode())
    assert parsed.kind == "championship"
    assert [(r.position, r.name, r.points) for r in parsed.rows] == [
        (1, "PiloteA", 41),
        (2, "PiloteB", 37),
        (3, "WRC Player", 1),
        (4, "WRC Player", 0),
    ]


def test_anonymous_rows_flagged_and_allowed_as_duplicates():
    parsed = parse_csv(RALLY_CSV.encode())
    assert [r.is_anonymous for r in parsed.rows] == [False, False, True, True]


def test_utf8_bom_and_crlf_accepted():
    data = ("﻿" + CHAMPIONSHIP_CSV.replace("\n", "\r\n")).encode()
    assert len(parse_csv(data).rows) == 4


def test_without_trailing_comma():
    data = "Rank,DisplayName,PointsAccumulated\n1,PiloteA,10\n"
    assert parse_csv(data.encode()).rows[0].points == 10


def test_rows_sorted_by_position():
    data = "Rank,DisplayName,PointsAccumulated,\n2,PiloteB,5,\n1,PiloteA,10,\n"
    assert [r.name for r in parse_csv(data.encode()).rows] == ["PiloteA", "PiloteB"]


@pytest.mark.parametrize(
    ("csv_text", "line", "column"),
    [
        ("Rank,Name,Points\n1,A,1\n", 1, None),  # en-tête inconnu
        ("Rank,DisplayName,PointsAccumulated,\nx,A,1,\n", 2, "Rank"),
        ("Rank,DisplayName,PointsAccumulated,\n0,A,1,\n", 2, "Rank"),
        ("Rank,DisplayName,PointsAccumulated,\n1,A,abc,\n", 2, "PointsAccumulated"),
        ("Rank,DisplayName,PointsAccumulated,\n1,A,-3,\n", 2, "PointsAccumulated"),
        ("Rank,DisplayName,PointsAccumulated,\n1, ,3,\n", 2, "DisplayName"),
        ("Rank,DisplayName,PointsAccumulated,\n1,A,3,\n1,B,2,\n", 3, "Rank"),  # rang en double
        ("Rank,DisplayName,PointsAccumulated,\n1,A,3,\n2,a,2,\n", 3, "DisplayName"),  # pilote en double
        ("Rank,DisplayName,PointsAccumulated,\n1,A,3,extra\n", 2, None),  # colonne en trop
        (
            "Rank,DisplayName,Vehicle,Time,DifferenceToFirst,Platform,\n1,A,Car,1h08,00:00:00,PSN,\n",
            2,
            "Time",
        ),
        (
            "Rank,DisplayName,Vehicle,Time,DifferenceToFirst,Platform,\n1,A,,01:00:00,00:00:00,PSN,\n",
            2,
            "Vehicle",
        ),
    ],
)
def test_validation_errors_point_to_line_and_column(csv_text, line, column):
    with pytest.raises(CsvError) as exc:
        parse_csv(csv_text.encode())
    assert exc.value.line == line
    assert exc.value.column == column


def test_empty_file():
    with pytest.raises(CsvError):
        parse_csv(b"")
    with pytest.raises(CsvError):
        parse_csv(b"Rank,DisplayName,PointsAccumulated,\n")


def test_non_utf8_rejected():
    with pytest.raises(CsvError, match="UTF-8"):
        parse_csv("Rank,DisplayName,PointsAccumulated,\n1,Jérôme,1,\n".encode("latin-1"))


def test_time_roundtrip():
    assert parse_time_ms("00:00:36.3160000") == 36_316
    assert parse_time_ms("00:00:00") == 0
    assert parse_time_ms("02:03:08.4") == 7_388_400
    assert format_time_ms(4_128_945) == "01:08:48.945"
