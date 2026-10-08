"""Rallyes : date et heure de début et de fin (remplace la date unique)

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rallies", sa.Column("starts_at", sa.DateTime, nullable=True))
    op.add_column("rallies", sa.Column("ends_at", sa.DateTime, nullable=True))
    # La date unique existante devient « toute la journée »
    op.execute(
        "UPDATE rallies SET starts_at = TIMESTAMP(event_date, '00:00:00'), "
        "ends_at = TIMESTAMP(event_date, '23:59:00') WHERE event_date IS NOT NULL"
    )
    op.drop_column("rallies", "event_date")


def downgrade() -> None:
    op.add_column("rallies", sa.Column("event_date", sa.Date, nullable=True))
    op.execute("UPDATE rallies SET event_date = DATE(starts_at) WHERE starts_at IS NOT NULL")
    op.drop_column("rallies", "ends_at")
    op.drop_column("rallies", "starts_at")
