# Déploiement

À chaque push sur `main`, la GitHub Action construit et publie les images publiques :

- `ghcr.io/helasch/erally4-web:latest`
- `ghcr.io/helasch/erally4-api:latest`

Deux façons de les mettre en production.

## Option 1 — Manuel (actuelle)

Sur le serveur, dans le dossier du projet :

1. Récupérer le compose :

   ```bash
   curl -O https://raw.githubusercontent.com/Helasch/erally4-site/main/docker-compose.yml
   ```

2. Créer un `.env` à côté (modèle : `.env.example`) :

   ```
   DB_USER=...
   DB_PASSWORD=...
   UMAMI_SITE_ID=       # optionnel
   ```

3. Lancer (et relancer à chaque mise à jour) :

   ```bash
   docker compose pull
   docker compose up -d --remove-orphans
   ```

4. Au premier lancement, créer le compte admin :

   ```bash
   docker exec -it erally4-api python -m app.cli create-admin
   ```

Les migrations de la base sont appliquées automatiquement à chaque démarrage de l'API.

## Option 2 — Automatique via GitHub Actions (plus tard)

L'Action se connecte en SSH au serveur, met à jour le dépôt, écrit le `.env` depuis les secrets GitHub,
puis fait `pull` + `up`. Désactivée tant que la variable `DEPLOY_ENABLED` n'est pas à `true`.

### Clé SSH dédiée

```bash
ssh-keygen -t ed25519 -C "github-actions-erally4" -f erally4_deploy
```

(Entrée deux fois pour ne pas mettre de phrase de passe.)

- `erally4_deploy.pub` (publique) → à l'admin du serveur, qui l'ajoute au `~/.ssh/authorized_keys`
  de l'utilisateur de déploiement.
- `erally4_deploy` (privée) → secret GitHub `SSH_PRIVATE_KEY`, puis supprimer le fichier local.

### Secrets et variables GitHub

Dépôt → Settings → Secrets and variables → Actions.

| Nom | Type | Valeur |
|---|---|---|
| `SERVER_HOST` | Secret | adresse du serveur (fournie par l'admin) |
| `SERVER_USER` | Secret | utilisateur SSH de déploiement (fourni par l'admin) |
| `SERVER_PATH` | Secret | dossier du projet sur le serveur (fourni par l'admin) |
| `SSH_PRIVATE_KEY` | Secret | contenu de `erally4_deploy` |
| `DB_USER` | Secret | fourni par l'admin |
| `DB_PASSWORD` | Secret | fourni par l'admin (éviter le caractère `'`) |
| `UMAMI_SITE_ID` | Variable (optionnelle) | ID du site sur https://stats.devnest.fr |
| `DEPLOY_ENABLED` | Variable | `true` pour activer le déploiement automatique |

## Vérification

- https://erally4.devnest.fr → page d'accueil, message « Bienvenue sur l'API eRally4 Cup » ;
- https://erally4.devnest.fr/health → `{"status":"ok","db":"up"}` (URL à mettre dans Uptime Kuma).
