"""Règles des comptes pilotes (fonctions pures, testées sans base de données)."""

import re
from dataclasses import dataclass

from app.csv_import import ANONYMOUS_NAME

SITE_NAME_MIN, SITE_NAME_MAX = 3, 32
RACENET_NAME_MAX = 64
_SITE_NAME_RE = re.compile(r"^[\w .\-]+$", re.UNICODE)
_RESERVED = {"admin", "administrateur", "erally4", "erally4 cup", "moderateur", ANONYMOUS_NAME.lower()}

# Voitures proposées par défaut (complétées par celles vues dans les résultats)
DEFAULT_VEHICLES = ["Ford Fiesta MK8 Rally4", "Opel Corsa Rally4", "Peugeot 208 Rally4", "Renault Clio Rally4"]


class AccountError(ValueError):
    """Saisie invalide, message destiné au pilote."""


def clean_site_name(value: str) -> str:
    name = " ".join(value.split())  # espaces multiples / en bord supprimés
    if not SITE_NAME_MIN <= len(name) <= SITE_NAME_MAX:
        raise AccountError(f"Le pseudo doit faire entre {SITE_NAME_MIN} et {SITE_NAME_MAX} caractères.")
    if not _SITE_NAME_RE.match(name):
        raise AccountError("Le pseudo ne peut contenir que des lettres, chiffres, espaces, points, tirets et _.")
    if name.lower() in _RESERVED:
        raise AccountError("Ce pseudo est réservé, choisissez-en un autre.")
    return name


def clean_racenet_name(value: str) -> str | None:
    name = value.strip()
    if not name:
        return None
    if len(name) > RACENET_NAME_MAX:
        raise AccountError(f"Pseudo RaceNet trop long ({RACENET_NAME_MAX} caractères max).")
    if name.lower() == ANONYMOUS_NAME.lower():
        raise AccountError(
            f"« {ANONYMOUS_NAME} » est le pseudo masqué de RaceNet : indiquez votre vrai pseudo, "
            "l'admin fera la liaison avec vos résultats."
        )
    return name


@dataclass
class LinkDecision:
    status: str  # "none" | "pending" | "linked"
    driver_id: int | None


def decide_link(racenet_name: str | None, matching_driver_id: int | None, taken_by_other: bool) -> LinkDecision:
    """Liaison automatique : pseudo RaceNet trouvé et libre -> relié ; sinon demande à l'admin."""
    if not racenet_name:
        return LinkDecision("none", None)
    if matching_driver_id is not None and not taken_by_other:
        return LinkDecision("linked", matching_driver_id)
    return LinkDecision("pending", None)


def safe_next(path: str | None, default: str = "/mon-compte") -> str:
    """Redirection après connexion : chemin interne uniquement (pas de redirection vers un autre site)."""
    if not path or not path.startswith("/") or path.startswith("//") or "\\" in path or "\n" in path:
        return default
    return path
