"""Classement RaceNet rallye par rallye, réglages du site

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("racenet_standings", sa.Column("rally_id", sa.Integer, nullable=True))
    op.create_foreign_key(
        "fk_racenet_standings_rally", "racenet_standings", "rallies", ["rally_id"], ["id"], ondelete="CASCADE"
    )
    op.create_table(
        "site_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )


def downgrade() -> None:
    op.drop_table("site_settings")
    op.drop_constraint("fk_racenet_standings_rally", "racenet_standings", type_="foreignkey")
    op.drop_column("racenet_standings", "rally_id")
