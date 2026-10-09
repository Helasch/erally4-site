"""Spéciales des rallyes et identifiants RaceNet (import direct depuis RaceNet)

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

TABLE_OPTIONS = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.add_column("drivers", sa.Column("racenet_id", sa.String(32), nullable=True))
    op.create_unique_constraint("uq_drivers_racenet_id", "drivers", ["racenet_id"])
    op.add_column("rallies", sa.Column("racenet_event_id", sa.String(32), nullable=True))
    op.add_column("championships", sa.Column("racenet_id", sa.String(32), nullable=True))
    op.alter_column(
        "imports",
        "kind",
        existing_type=sa.Enum("rally", "championship", name="import_kind"),
        type_=sa.Enum("rally", "championship", "racenet", name="import_kind"),
        existing_nullable=False,
    )

    op.create_table(
        "stages",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("rally_id", sa.Integer, sa.ForeignKey("rallies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("distance_km", sa.Float, nullable=True),
        sa.Column("conditions", sa.String(64), nullable=True),
        sa.Column("time_of_day", sa.String(32), nullable=True),
        sa.UniqueConstraint("rally_id", "number"),
        **TABLE_OPTIONS,
    )
    op.create_table(
        "stage_results",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("stage_id", sa.Integer, sa.ForeignKey("stages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("driver_id", sa.Integer, sa.ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("raw_name", sa.String(64), nullable=False),
        sa.Column("vehicle", sa.String(64), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("time_ms", sa.BigInteger, nullable=False),
        sa.Column("penalty_ms", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("diff_ms", sa.BigInteger, nullable=False),
        **TABLE_OPTIONS,
    )


def downgrade() -> None:
    op.drop_table("stage_results")
    op.drop_table("stages")
    op.alter_column(
        "imports",
        "kind",
        existing_type=sa.Enum("rally", "championship", "racenet", name="import_kind"),
        type_=sa.Enum("rally", "championship", name="import_kind"),
        existing_nullable=False,
    )
    op.drop_column("championships", "racenet_id")
    op.drop_column("rallies", "racenet_event_id")
    op.drop_constraint("uq_drivers_racenet_id", "drivers", type_="unique")
    op.drop_column("drivers", "racenet_id")
