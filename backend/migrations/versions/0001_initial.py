"""Schéma initial

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TABLE_OPTS = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "admins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("failed_attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )
    op.create_table(
        "admin_sessions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("admin_id", sa.Integer, sa.ForeignKey("admins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )
    op.create_table(
        "championships",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("is_current", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column(
            "scoring_mode",
            sa.Enum("racenet", "custom", name="scoring_mode"),
            nullable=False,
            server_default="racenet",
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )
    op.create_table(
        "scoring_points",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "championship_id", sa.Integer, sa.ForeignKey("championships.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("points", sa.Integer, nullable=False),
        sa.UniqueConstraint("championship_id", "position"),
        **TABLE_OPTS,
    )
    op.create_table(
        "rallies",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "championship_id", sa.Integer, sa.ForeignKey("championships.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("order_index", sa.Integer, nullable=False),
        sa.Column("event_date", sa.Date),
        **TABLE_OPTS,
    )
    op.create_table(
        "drivers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )
    op.create_table(
        "rally_results",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("rally_id", sa.Integer, sa.ForeignKey("rallies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("driver_id", sa.Integer, sa.ForeignKey("drivers.id", ondelete="SET NULL")),
        sa.Column("raw_name", sa.String(64), nullable=False),
        sa.Column("vehicle", sa.String(64), nullable=False),
        sa.Column("time_ms", sa.BigInteger, nullable=False),
        sa.Column("diff_ms", sa.BigInteger, nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        **TABLE_OPTS,
    )
    op.create_table(
        "racenet_standings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "championship_id", sa.Integer, sa.ForeignKey("championships.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("driver_id", sa.Integer, sa.ForeignKey("drivers.id", ondelete="SET NULL")),
        sa.Column("raw_name", sa.String(64), nullable=False),
        sa.Column("points", sa.Integer, nullable=False),
        **TABLE_OPTS,
    )
    op.create_table(
        "imports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("kind", sa.Enum("rally", "championship", name="import_kind"), nullable=False),
        sa.Column(
            "championship_id", sa.Integer, sa.ForeignKey("championships.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("rally_id", sa.Integer, sa.ForeignKey("rallies.id", ondelete="SET NULL")),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False),
        sa.Column("row_count", sa.Integer, nullable=False),
        sa.Column("admin_id", sa.Integer, sa.ForeignKey("admins.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        **TABLE_OPTS,
    )


def downgrade() -> None:
    for table in (
        "imports",
        "racenet_standings",
        "rally_results",
        "drivers",
        "rallies",
        "scoring_points",
        "championships",
        "admin_sessions",
        "admins",
    ):
        op.drop_table(table)
