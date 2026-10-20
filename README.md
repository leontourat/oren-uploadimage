# Oren Image Upload — Discord OAuth2

## 1. Base de données
Dans Cloudflare D1 > Console, exécuter `worker/schema-discord.sql`.
Les nouvelles tables `discord_*` ne suppriment pas les anciennes.

## 2. Worker
Déployer `worker/worker.js` dans `herbergeurimage`.
Bindings : `DB` (D1), `IMAGES` (R2).
Secrets Cloudflare (Settings > Variables and Secrets) :
- `DISCORD_CLIENT_ID` : ID de l'application Discord.
- `DISCORD_CLIENT_SECRET` : secret OAuth2 (NE PAS mettre dans GitHub).
- `OAUTH_STATE_SECRET` : longue chaîne aléatoire d'au moins 32 caractères.

Option fortement conseillée avant ouverture publique : `SITE_ORIGINS` (variable texte) contenant les origines autorisées, séparées par des virgules, par exemple `https://exemple.github.io,https://images.exemple.fr`. Sans cette variable, les origines HTTPS sont autorisées dynamiquement : pratique pour les tests mais moins sûr pour la production.

## 3. Discord Developer Portal
https://discord.com/developers/applications > application > OAuth2 > Redirects :
`https://herbergeurimage.maxgamingdu4.workers.dev/api/auth/discord/callback`

Utiliser les scopes OAuth2 `identify` (configurés par le Worker). Le bot Discord n'est pas nécessaire.

## 4. GitHub Pages
Envoyer les fichiers HTML, `css`, `js`, `assets` à la racine du dépôt. Ne jamais publier les secrets.
Ouvrir `login.html`, cliquer sur Discord, autoriser dans la popup. Les popups doivent être autorisées.
La session est conservée dans sessionStorage : une fermeture d'onglet nécessite une nouvelle connexion.

## 5. Admin
Après la première connexion, récupérer son ID Discord puis exécuter dans D1 :
`UPDATE discord_users SET role='admin' WHERE discord_id='VOTRE_ID_DISCORD';`

## Limites
Les images sont publiques par défaut, 10 Mo maximum. Les images privées ne sont pas partageables publiquement. Ajouter avant ouverture publique : quotas par utilisateur, rate limiting Cloudflare, politique de modération et gestion des signalements. L'authentification du site repose sur un jeton Bearer stocké par onglet, et non sur un cookie inter-domaine.
