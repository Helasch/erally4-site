FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# --- Tests : docker build --target test ./backend --------------------------------
FROM base AS test
COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt
COPY . .
RUN pytest -q

# --- Image de production -------------------------------------------------------------
FROM base AS runtime
COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data/uploads && chown 1000:1000 /data/uploads
USER 1000:1000

EXPOSE 8000
# Migrations appliquées à chaque démarrage, puis lancement de l'API
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
