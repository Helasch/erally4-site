# eRally4 Cup — site web

Site du championnat de rallye virtuel **eRally4 Cup** (EA Sports WRC).

- **Public** : classement général du championnat en cours et classement de chaque rallye.
- **Admin** (`/admin`) : championnats, rallyes, barème, import des CSV RaceNet, correction des pseudos
  « WRC Player ».

## Architecture

```
Traefik ──► web (Next.js, :3000) ──/api/*, /health──► api (FastAPI, :8000) ──► MariaDB
            réseaux webproxy + internal               réseaux internal + db-network
```

- `frontend/` : Next.js + React (seul service exposé via Traefik).
- `backend/` : FastAPI + SQLAlchemy, migrations Alembic appliquées au démarrage.

## Classements

Chaque championnat a un mode, modifiable dans l'admin :

| Mode | Classement général | Classement d'un rallye |
|---|---|---|
| **RaceNet** | dernier CSV « championship » importé, points RaceNet tels quels | CSV « event » du rallye, au temps |
| **Personnalisé** | calculé depuis les rallyes avec le barème défini (points par place) ; égalités départagées au nombre de victoires, puis de 2es places, etc. | idem, avec les points du barème |

### Formats CSV (exports RaceNet)

Le type est détecté depuis l'en-tête :

- rallye : `Rank,DisplayName,Vehicle,Time,DifferenceToFirst,Platform`
- championnat : `Rank,DisplayName,PointsAccumulated`

Les fichiers bruts sont conservés dans le volume `/data/uploads`.

### « WRC Player »

RaceNet masque le pseudo de certains joueurs. À l'import, ces lignes sont surlignées et l'admin choisit le
pilote correspondant, avec des suggestions :

- rallye : pilotes déjà vus sur la même plateforme (et la même voiture), absents du fichier ;
- championnat : pilotes absents du fichier dont les points précédents sont cohérents.

Les pseudos restent modifiables ensuite (page du rallye, classement importé, page Pilotes avec fusion).

## Comptes pilotes

Connexion avec Discord (aucun mot de passe stocké), réservée aux membres du serveur Discord si son
identifiant est renseigné. Le pilote choisit un pseudo pour le site, indique son pseudo RaceNet, sa voiture
et une photo (réencodée en WebP 512×512 par le serveur, métadonnées supprimées, stockée dans `/data/uploads/avatars`).

- Pseudo RaceNet trouvé dans les résultats et libre → compte relié automatiquement ; sinon la demande
  apparaît dans l'admin (page **Comptes pilotes**), avec des suggestions. Les comptes en attente sont aussi
  reliés automatiquement quand leur pseudo apparaît dans un nouvel import.
- Une fois relié, le pseudo du site remplace le pseudo RaceNet dans les classements.
- Réglages Discord (Client ID, Client Secret, identifiant du serveur) : admin → **Paramètres**, qui affiche
  aussi l'adresse de retour à déclarer dans l'application Discord.

## Dev local

Prérequis : Docker et Node.js.

```bash
docker compose -f docker-compose.dev.yml up -d --build db api
cd frontend && npm install && npm run dev
```

- Site : http://localhost:3000 — admin : http://localhost:3000/admin
- Page de diagnostic (dev uniquement) : http://localhost:3000/test

Créer un admin local :

```bash
docker compose -f docker-compose.dev.yml exec api python -m app.cli create-admin
```

Tests du backend :

```bash
docker build --target test ./backend
```

## Administration en production

```bash
docker exec -it erally4-api python -m app.cli create-admin
docker exec -it erally4-api python -m app.cli reset-password <identifiant>
```

Mot de passe : 12 caractères minimum. Après 5 échecs de connexion, le compte est verrouillé 15 minutes.

## Workflow Git

- `main` = production : on ne commite pas directement dessus.
- Chaque évolution se fait sur une branche (`feature/…`, `fix/…`), puis une **Pull Request** vers `main`.
- Sur la PR, la CI lance les tests (pytest, TypeScript) et vérifie que les images se construisent,
  sans rien publier. On fusionne quand tout est vert.

```bash
git switch main && git pull
git switch -c feature/ma-fonctionnalite
# … commits …
git push -u origin feature/ma-fonctionnalite
```

## Déploiement

Chaque push sur `main` (donc chaque PR fusionnée) construit et publie les images `ghcr.io/helasch/erally4-web` et
`ghcr.io/helasch/erally4-api` (tags `latest` et SHA du commit). Mise en production : voir [DEPLOY.md](DEPLOY.md).
