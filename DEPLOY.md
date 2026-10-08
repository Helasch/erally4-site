# Déploiement

À chaque push sur `main`, la GitHub Action construit et publie les images publiques :

- `ghcr.io/helasch/erally4-web:latest`
- `ghcr.io/helasch/erally4-api:latest`

Deux façons de les mettre en production.

## Option 1 — Manuel (actuelle)

Sur le serveur :

1. Créer le dossier du projet et récupérer le compose :

   ```bash
   mkdir -p /opt/docker/erally4-site && cd /opt/docker/erally4-site
   curl -O https://raw.githubusercontent.com/Helasch/erally4-site/main/docker-compose.yml
   ```

2. Créer un `.env` à côté avec les identifiants de la base `erally4` — ce sont les **deux seules valeurs** à fournir :

   ```
   DB_USER=...
   DB_PASSWORD=...
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

## Option 2 — Automatique via GitHub Actions

Après chaque fusion sur `main`, une fois les images publiées, l'Action se connecte en SSH au serveur et fait
exactement le déploiement manuel : récupère le `docker-compose.yml` à jour, puis `docker compose pull` et `up -d`.
**Le `.env` du serveur n'est jamais modifié** : les identifiants de la base restent uniquement sur le serveur.

Prérequis côté serveur (Option 1 déjà faite) : le dossier du projet avec son `.env`, et un utilisateur de
déploiement qui peut lancer `docker` et `curl` et écrire dans ce dossier.

### 1. Clé SSH dédiée (une seule fois)

```bash
ssh-keygen -t ed25519 -C "github-actions-erally4" -f erally4_deploy
```

(Entrée deux fois pour ne pas mettre de phrase de passe.)

- `erally4_deploy.pub` (publique) → à l'admin du serveur, qui l'ajoute au `~/.ssh/authorized_keys`
  de l'utilisateur de déploiement.
- `erally4_deploy` (privée) → secret GitHub `SSH_PRIVATE_KEY`, puis supprimer le fichier local.

### 2. Secrets et variable GitHub

Dépôt → Settings → Secrets and variables → Actions.

| Nom | Type | Valeur |
|---|---|---|
| `SERVER_HOST` | Secret | adresse du serveur |
| `SERVER_USER` | Secret | utilisateur SSH de déploiement |
| `SERVER_PATH` | Secret | dossier du projet sur le serveur (ex. `/opt/docker/erally4-site`) |
| `SSH_PRIVATE_KEY` | Secret | contenu de `erally4_deploy` |
| `SERVER_FINGERPRINT` | Secret (conseillé) | empreinte de la clé du serveur, pour ne se connecter qu'à lui (voir ci-dessous) |
| `DEPLOY_ENABLED` | Variable | `true` pour activer le déploiement automatique |

Empreinte du serveur (à lancer par l'admin, sur le serveur) :

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

→ copier la partie `SHA256:…` dans `SERVER_FINGERPRINT`.

### 3. Tester

GitHub → Actions → « CI / CD » → *Run workflow* sur `main` : l'étape « Déploiement en production » doit passer au vert.

## Vérification

- https://erally4.devnest.fr → page d'accueil du site ;
- https://erally4.devnest.fr/health → `{"status":"ok","db":"up"}` (URL à mettre dans Uptime Kuma).
