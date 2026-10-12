# Plateforme DAF — démonstration statique V4 (Netlify)

Démonstration **interactive et entièrement statique** des deux modes d'interface V4 :
**Analyse financière** et **Pilotage financier**. Toutes les valeurs sont **fictives**
(bandeau « Démonstration — données fictives »).

- Aucun backend : ni Supabase, ni base PostgreSQL, ni API, ni authentification, ni serveur Next.js.
- Aucune variable d'environnement, aucune clé, aucun fichier `.env`.
- Polices Newsreader et Inter intégrées localement (aucune ressource externe).

## 1. Mettre la démo en ligne — le plus simple (glisser-déposer)

Le site est déjà construit dans ce dossier.

1. Récupérer **`netlify-demo/plateforme-daf-demo-v4.zip`** (ou le dossier **`netlify-demo/dist/`**)
   depuis la branche `claude/design-v4-netlify-demo` du dépôt GitHub
   (bouton « Download raw file » sur la page du fichier ZIP).
2. Ouvrir <https://app.netlify.com/drop> (compte Netlify gratuit).
3. Glisser-déposer **le fichier ZIP** ou **le dossier `dist`** dans la zone prévue.
4. Netlify affiche l'URL du site (`https://<nom>.netlify.app`) en quelques secondes.

Aucun réglage n'est nécessaire.

## 2. Variante — site relié au dépôt GitHub (rebuild automatique)

Dans Netlify : *Add new site → Import an existing project → GitHub* → dépôt
`thomasmaurin380-afk/agents`, puis :

| Réglage | Valeur |
|---|---|
| Branch to deploy | `claude/design-v4-netlify-demo` |
| Base directory | `netlify-demo` |
| Build command | `npm ci && npm run build` (déjà défini dans `netlify.toml`) |
| Publish directory | `netlify-demo/dist` (déjà défini dans `netlify.toml`) |
| Variables d'environnement | **aucune** |

## 3. Construire et tester en local

Prérequis : Node.js 22.

```bash
cd netlify-demo
npm ci
npm run build     # vérification TypeScript + build Vite + contrôle du dossier dist/
npm run preview   # http://127.0.0.1:4173
```

`npm run build` se termine par `scripts/check-dist.mjs`, qui vérifie que `dist/` contient
`index.html` à la racine et des polices locales, et ne contient aucune référence à Supabase, à une
base de données, à une clé ni aucun appel réseau (`fetch`, `XMLHttpRequest`, `WebSocket`…).

Recette navigateur sur le site construit, servi comme un site statique (nécessite les dépendances
de l'application principale pour Playwright : `npm ci` à la racine du dépôt) :

```bash
cd netlify-demo
npx --prefix .. playwright test -c playwright.config.ts              # recette
CAPTURES=1 npx --prefix .. playwright test -c playwright.config.ts   # captures dans shots/
```

## 4. Ce qui fonctionne

1. Bascule **Analyse financière ↔ Pilotage financier** : raccourci dans l'en-tête, menu du profil
   (« Préférences d'affichage ») et menu mobile. Toute la composition change (cartes, graphiques,
   tableaux, densité, arrondis, navigation).
2. Mémorisation du mode choisi dans `localStorage` (clé `plateforme-daf-demo:interface-mode`).
3. Graphiques avec infobulles (souris et clavier).
4. Onglets du détail des postes du bilan (souris et flèches du clavier).
5. Menu mobile (bouton « Menu » / « Fermer », touche Échap).
6. Thème clair / sombre (menu du profil).

Désactivé, et signalé comme tel : filtres (période, entités, « Mensuel », « Par catégorie »),
boutons « Voir la trésorerie » et « Prévisions 90 jours », déconnexion, et autres modules du menu
(« Non inclus dans la démonstration »). Aucune fonctionnalité fictive.

## 5. Architecture (aucune duplication de l'interface)

Le projet Vite importe **directement** le code V4 du dépôt (`@/…` = racine du dépôt) :
coque `AppShell`, `PageHeader`, menu du profil, sélecteur `InterfaceModeSwitch`, tokens CSS
(`app/globals.css`, y compris les variantes `[data-ui-mode]`), cartes KPI, graphiques, tableaux,
compositions `AnalyseDashboard` / `PilotageDashboard` et données fictives
`features/design-preview/demo-data.ts`.

Seuls quelques modules sont remplacés dans `vite.config.ts` :

| Module de l'application | Remplacement dans la démo |
|---|---|
| `next/link`, `next/navigation` | `src/shims/` — ancre simple, chemin fixe, aucun routeur serveur |
| Fournisseur du mode d'interface (cookie par utilisateur) | `src/interface-mode-demo.tsx` — même contexte, préférence dans `localStorage` |
| Action de déconnexion (Supabase) | `src/shims/auth-actions.ts` — fonction vide, boutons désactivés |
| Navigation de l'application | `src/demo-nav.tsx` — même style, modules hors démo désactivés |

Les modules serveur de l'application (Supabase, base de données, services, authentification) ne
sont jamais importés : ils ne font pas partie du bundle, ce que confirme `scripts/check-dist.mjs`.
