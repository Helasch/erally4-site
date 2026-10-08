"""Pénalités sur les résultats de rallye et ajustements de points du général

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rally_results", sa.Column("penalty_ms", sa.BigInteger, nullable=False, server_default="0"))
    op.add_column("rally_results", sa.Column("disqualified", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("rally_results", sa.Column("penalty_reason", sa.String(255), nullable=True))
    op.create_table(
        "standing_adjustments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "championship_id", sa.Integer, sa.ForeignKey("championships.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("driver_id", sa.Integer, sa.ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rally_id", sa.Integer, sa.ForeignKey("rallies.id", ondelete="SET NULL")),
        sa.Column("points", sa.Integer, nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )


def downgrade() -> None:
    op.drop_table("standing_adjustments")
    op.drop_column("rally_results", "penalty_reason")
    op.drop_column("rally_results", "disqualified")
    op.drop_column("rally_results", "penalty_ms")
