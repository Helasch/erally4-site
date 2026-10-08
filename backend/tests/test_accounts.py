import pytest

from app.accounts import AccountError, LinkDecision, clean_racenet_name, clean_site_name, decide_link, safe_next


def test_site_name_cleaned():
    assert clean_site_name("  Louis   le  Rapide ") == "Louis le Rapide"
    assert clean_site_name("Gabriel_44-16.fr") == "Gabriel_44-16.fr"
    assert clean_site_name("Jérôme") == "Jérôme"


@pytest.mark.parametrize("value", ["ab", "x" * 33, "<script>", "Louis@home", "Admin", "WRC Player", "   "])
def test_site_name_rejected(value):
    with pytest.raises(AccountError):
        clean_site_name(value)


def test_racenet_name():
    assert clean_racenet_name("  Helasch ") == "Helasch"
    assert clean_racenet_name("") is None
    with pytest.raises(AccountError):
        clean_racenet_name("WRC Player")
    with pytest.raises(AccountError):
        clean_racenet_name("x" * 65)


def test_link_decision():
    assert decide_link(None, None, False) == LinkDecision("none", None)
    assert decide_link("Helasch", 21, False) == LinkDecision("linked", 21)
    # pseudo déjà relié à un autre compte : l'admin tranche
    assert decide_link("Helasch", 21, True) == LinkDecision("pending", None)
    # pseudo inconnu des résultats (ou masqué en « WRC Player ») : l'admin tranche
    assert decide_link("Inconnu", None, False) == LinkDecision("pending", None)


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/pilotes/3", "/pilotes/3"),
        (None, "/mon-compte"),
        ("https://evil.example", "/mon-compte"),
        ("//evil.example", "/mon-compte"),
        ("/\\evil.example", "/mon-compte"),
    ],
)
def test_safe_next(path, expected):
    assert safe_next(path) == expected
