# Mise en place du déploiement (une seule fois)

## 1. Clé SSH dédiée au dépôt

Plutôt que de partager la clé privée existante de l'utilisateur de déploiement, générer une clé dédiée à ce projet :

```bash
ssh-keygen -t ed25519 -C "github-actions-erally4" -f erally4_deploy -N ""
```

- `erally4_deploy.pub` (clé **publique**) → à envoyer à l'admin du serveur, qui l'ajoute dans
  le `~/.ssh/authorized_keys` de l'utilisateur de déploiement.
- `erally4_deploy` (clé **privée**) → à coller dans le secret GitHub `SSH_PRIVATE_KEY`, puis à supprimer en local.

## 2. Côté serveur (admin)

- Ajouter la clé publique ci-dessus à l'utilisateur de déploiement.
- Créer la base `erally4` et son utilisateur, et transmettre les identifiants.
- Vérifier que l'utilisateur de déploiement peut écrire dans le dossier du projet et utiliser Docker.

Rien d'autre : le dépôt est cloné et le `.env` est écrit automatiquement par l'Action.

## 3. Secrets GitHub

Dépôt → Settings → Secrets and variables → Actions.

| Nom | Type | Valeur |
|---|---|---|
| `SERVER_HOST` | Secret | adresse du serveur (fournie par l'admin) |
| `SERVER_USER` | Secret | utilisateur SSH de déploiement (fourni par l'admin) |
| `SERVER_PATH` | Secret | dossier du projet sur le serveur (fourni par l'admin) |
| `SSH_PRIVATE_KEY` | Secret | contenu de `erally4_deploy` |
| `DB_USER` | Secret | fourni par l'admin |
| `DB_PASSWORD` | Secret | fourni par l'admin (éviter le caractère `'`) |
| `SESSION_SECRET` | Secret | chaîne aléatoire (ex. `openssl rand -hex 32`) |
| `UMAMI_SITE_ID` | Variable (optionnelle) | ID du site sur https://stats.devnest.fr |

## 4. Premier déploiement

Pousser sur `main` (ou Actions → « Déploiement du projet » → *Run workflow*), puis vérifier :

- https://erally4.devnest.fr → page d'accueil, message « Bienvenue sur l'API eRally4 Cup » ;
- https://erally4.devnest.fr/health → `{"status":"ok","db":"up"}` (URL à mettre dans Uptime Kuma).
