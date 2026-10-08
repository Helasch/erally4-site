import os


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    env = os.environ.get("APP_ENV", "production")

    db_host = os.environ.get("DB_HOST", "localhost")
    db_port = int(os.environ.get("DB_PORT", "3306"))
    db_name = os.environ.get("DB_NAME", "erally4")
    db_user = os.environ.get("DB_USER", "erally4")
    db_password = os.environ.get("DB_PASSWORD", "")

    session_hours = int(os.environ.get("SESSION_HOURS", "168"))
    cookie_secure = _bool("COOKIE_SECURE", True)

    uploads_dir = os.environ.get("UPLOADS_DIR", "/data/uploads")
    max_upload_bytes = int(os.environ.get("MAX_UPLOAD_BYTES", str(1024 * 1024)))

    # Verrouillage d'un compte admin après N échecs de connexion
    login_max_failures = 5
    login_lock_minutes = 15
    # Limite globale de tentatives par IP (fenêtre glissante)
    login_ip_max_attempts = 20
    login_ip_window_seconds = 15 * 60


settings = Settings()
