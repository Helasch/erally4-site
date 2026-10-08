"""Comptes pilotes (connexion Discord) et leurs sessions

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

TABLE_OPTS = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "pilot_accounts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("discord_id", sa.String(32), nullable=False, unique=True),
        sa.Column("discord_username", sa.String(64), nullable=False),
        sa.Column("site_name", sa.String(32), unique=True),
        sa.Column("racenet_name", sa.String(64)),
        sa.Column("driver_id", sa.Integer, sa.ForeignKey("drivers.id", ondelete="SET NULL"), unique=True),
        sa.Column(
            "link_status",
            sa.Enum("none", "pending", "linked", name="link_status"),
            nullable=False,
            server_default="none",
        ),
        sa.Column("vehicle", sa.String(64)),
        sa.Column("avatar_file", sa.String(128)),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )
    op.create_table(
        "pilot_sessions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column(
            "account_id", sa.Integer, sa.ForeignKey("pilot_accounts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )


def downgrade() -> None:
    op.drop_table("pilot_sessions")
    op.drop_table("pilot_accounts")
