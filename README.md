# eRally4 Cup — site web

Site du championnat de rallye virtuel **eRally4 Cup** (EA Sports WRC, 6 manches).

## Architecture

```
Traefik ──► web (Next.js, :3000) ──/api/*, /health──► api (FastAPI, :8000) ──► MariaDB
            réseaux webproxy + internal               réseaux internal + db-network
```

- `frontend/` : Next.js + React (seul service exposé via Traefik).
- `backend/` : FastAPI (non exposé, accessible uniquement via le réseau interne).

## Dev local

Prérequis : Docker.

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Site : http://localhost:3000
- API : http://localhost:8000/health

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` :

1. build des images `web` et `api` (amd64 + arm64) et publication sur GHCR :
   `ghcr.io/helasch/erally4-web` et `ghcr.io/helasch/erally4-api` (tags `latest` et SHA du commit) ;
2. connexion SSH au serveur, `git clone`/mise à jour du dépôt dans le dossier du projet ;
3. écriture du `.env` depuis les secrets GitHub ;
4. `docker compose pull` puis `docker compose up -d --remove-orphans`.

Mise en place initiale : voir [DEPLOY.md](DEPLOY.md).
