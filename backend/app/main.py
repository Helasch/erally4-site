from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db import engine
from app.routers import admin, public


app = FastAPI(title="eRally4 Cup API", docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(public.router)
app.include_router(admin.auth)
app.include_router(admin.router)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


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
