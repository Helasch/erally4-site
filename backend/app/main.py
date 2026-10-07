from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db import engine

app = FastAPI(title="eRally4 Cup API", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    """Sonde Uptime Kuma : vérifie aussi la connexion à la BDD."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "error", "db": "down"}, status_code=503)
    return {"status": "ok", "db": "up"}


@app.get("/api/hello")
def hello():
    return {"message": "Bienvenue sur l'API eRally4 Cup"}
