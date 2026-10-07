import os


class Settings:
    db_host = os.environ.get("DB_HOST", "localhost")
    db_port = int(os.environ.get("DB_PORT", "3306"))
    db_name = os.environ.get("DB_NAME", "erally4")
    db_user = os.environ.get("DB_USER", "erally4")
    db_password = os.environ.get("DB_PASSWORD", "")
    session_secret = os.environ.get("SESSION_SECRET", "")


settings = Settings()
