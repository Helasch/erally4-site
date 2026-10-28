"""Import d'une spéciale seule (fichier CSV exporté de RaceNet)

Revision ID: 0007
Revises: 0006
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "imports",
        "kind",
        existing_type=sa.Enum("rally", "championship", "racenet", name="import_kind"),
        type_=sa.Enum("rally", "championship", "racenet", "stage", name="import_kind"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute("DELETE FROM imports WHERE kind = 'stage'")
    op.alter_column(
        "imports",
        "kind",
        existing_type=sa.Enum("rally", "championship", "racenet", "stage", name="import_kind"),
        type_=sa.Enum("rally", "championship", "racenet", name="import_kind"),
        existing_nullable=False,
    )
