from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

SCORING_MODES = ("racenet", "custom")
IMPORT_KINDS = ("rally", "championship")


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    admin: Mapped[Admin] = relationship()


class Championship(Base):
    __tablename__ = "championships"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    scoring_mode: Mapped[str] = mapped_column(Enum(*SCORING_MODES, name="scoring_mode"), default="racenet")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    rallies: Mapped[list["Rally"]] = relationship(
        back_populates="championship", order_by="Rally.order_index", cascade="all, delete-orphan"
    )
    scoring: Mapped[list["ScoringPoint"]] = relationship(
        order_by="ScoringPoint.position", cascade="all, delete-orphan"
    )


class ScoringPoint(Base):
    """Barème personnalisé : points attribués par place dans un rallye."""

    __tablename__ = "scoring_points"
    __table_args__ = (UniqueConstraint("championship_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    championship_id: Mapped[int] = mapped_column(ForeignKey("championships.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    points: Mapped[int] = mapped_column(Integer)


class Rally(Base):
    __tablename__ = "rallies"

    id: Mapped[int] = mapped_column(primary_key=True)
    championship_id: Mapped[int] = mapped_column(ForeignKey("championships.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    order_index: Mapped[int] = mapped_column(Integer)
    event_date: Mapped[date | None] = mapped_column(Date)

    championship: Mapped[Championship] = relationship(back_populates="rallies")
    results: Mapped[list["RallyResult"]] = relationship(
        order_by="RallyResult.position", cascade="all, delete-orphan"
    )


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RallyResult(Base):
    __tablename__ = "rally_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    rally_id: Mapped[int] = mapped_column(ForeignKey("rallies.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    # NULL = pseudo anonyme (« WRC Player ») non encore identifié
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id", ondelete="SET NULL"))
    raw_name: Mapped[str] = mapped_column(String(64))
    vehicle: Mapped[str] = mapped_column(String(64))
    time_ms: Mapped[int] = mapped_column(BigInteger)
    diff_ms: Mapped[int] = mapped_column(BigInteger)
    platform: Mapped[str] = mapped_column(String(16))

    driver: Mapped[Driver | None] = relationship()


class RacenetStanding(Base):
    """Classement général tel qu'exporté par RaceNet, après un rallye donné."""

    __tablename__ = "racenet_standings"

    id: Mapped[int] = mapped_column(primary_key=True)
    championship_id: Mapped[int] = mapped_column(ForeignKey("championships.id", ondelete="CASCADE"))
    # Rallye après lequel ce classement a été exporté (NULL : import antérieur à l'historique)
    rally_id: Mapped[int | None] = mapped_column(ForeignKey("rallies.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id", ondelete="SET NULL"))
    raw_name: Mapped[str] = mapped_column(String(64))
    points: Mapped[int] = mapped_column(Integer)

    driver: Mapped[Driver | None] = relationship()


class SiteSetting(Base):
    """Réglages du site modifiables depuis l'admin (lien Discord…)."""

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(Enum(*IMPORT_KINDS, name="import_kind"))
    championship_id: Mapped[int] = mapped_column(ForeignKey("championships.id", ondelete="CASCADE"))
    rally_id: Mapped[int | None] = mapped_column(ForeignKey("rallies.id", ondelete="SET NULL"))
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255))
    row_count: Mapped[int] = mapped_column(Integer)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
