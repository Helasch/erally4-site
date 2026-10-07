from sqlalchemy import create_engine
from sqlalchemy.engine import URL

from app.config import settings

engine = create_engine(
    URL.create(
        "mysql+pymysql",
        username=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query={"charset": "utf8mb4"},
    ),
    pool_pre_ping=True,
    pool_recycle=1800,
)
