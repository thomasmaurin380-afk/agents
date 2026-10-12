# Modes d'interface : Analyse financière et Pilotage financier (prototype V4)

Statut : **preuve de concept, en attente de validation.** Seul le tableau de bord de démonstration
(`/daf/maquette`) est conçu pour les deux modes. Le système n'est pas encore généralisé aux autres pages.

## 1. Ce qui est livré

| Élément | Emplacement |
|---|---|
| Préférence `interfaceMode = "analyse" \| "pilotage"` (type, défaut, clé par utilisateur, garde de saisie) | `features/interface-mode/mode.ts` |
| Fournisseur React : lecture et écriture locales, synchronisation entre onglets, attribut `data-interface-mode` sur `<html>` | `features/interface-mode/provider.tsx` |
| Sélecteur « Mode d'interface » (préférences d'affichage du profil et tiroir mobile), raccourci segmenté dans l'en-tête du tableau de bord | `features/interface-mode/controls.tsx` |
| Jeu de données fictif **unique** | `features/design-preview/dashboard/data.ts` |
| Modèle de calcul **unique**, lu par les deux modes | `features/design-preview/dashboard/model.ts` |
| Composition Analyse / composition Pilotage | `features/design-preview/dashboard/{analyse,pilotage}-dashboard.tsx` |
| Composants financiers partagés | `components/finance/*`, `components/charts/*` (barres et ligne avec axe secondaire, anneau, mini-courbe, mini-barres) |
| Jetons communs et propres à chaque mode | `app/globals.css`, section « V4 » |
| Captures et démonstration | `docs/design-v4/*.png`, `demo-bascule.gif` |

## 2. Principes d'architecture

1. **Le mode choisit la composition, jamais les chiffres.** Les deux compositions reçoivent le même
   objet `DashboardModel`. Elles ne font aucun calcul : elles choisissent ce qu'elles montrent, dans
   quel ordre et à quelle échelle.
2. **Source de vérité unique pour les calculs.** Variations et pourcentages arrondis au dixième passent
   par `domain/sig/report` (`variation`, `percentOf`, `decimalToCents`), comme les SIG. Aucune règle
   comptable ni financière n'est recopiée. Les montants restent des chaînes décimales exactes : les
   nombres flottants ne servent qu'au tracé des graphiques (`plotValue`).
3. **Les dérivés sont calculés, pas saisis.** Capitaux propres, ratio d'endettement, parts, marges,
   progression vers l'objectif et variations sont calculés. Les tests vérifient l'équilibre du bilan
   (actif = dettes + capitaux propres, en N et N-1), la concordance des séries mensuelles avec le bilan,
   et la concordance de la trésorerie et du résultat entre les deux modes.
4. **Sens économique explicite.** La tonalité d'une variation dépend de l'indicateur (une hausse des
   dettes est défavorable, une baisse du ratio d'endettement est favorable), pas du signe seul.
5. **Jetons.** Les jetons communs couvrent les polices (Newsreader pour les grands titres et montants,
   Inter pour l'interface, les tableaux et les contrôles, chiffres tabulaires vérifiés dans les deux
   fichiers de police), la palette catégorielle et les surfaces. Les jetons propres à chaque mode
   (`--dash-gap`, `--dash-pad`, `--dash-radius`) donnent 14/18/10 px en Analyse et 24/28/20 px en
   Pilotage. Les ajustements de coque (largeur utile, densité de la navigation, fond) ne s'appliquent
   qu'aux pages qui contiennent `[data-dashboard]`.
6. **État conservé à la bascule.** Le périmètre (entité) est dans l'adresse (`?entite=`) : il survit à
   la bascule, au rechargement et au partage du lien. La période est commune : situation au 31/12/2024
   en Analyse, cumul janvier à décembre 2024 en Pilotage. Quand un état n'est pas compatible (une
   entité seule en Pilotage), il est conservé, signalé, et réversible en un clic.
7. **Aucune perte silencieuse.** Un formulaire déclare `useModeChangeGuard(dirty)`. Tant qu'il porte des
   modifications non enregistrées, une bascule demande confirmation.
8. **Persistance.** Pour le prototype, la préférence est stockée dans `localStorage` sous la clé
   `daf:interface-mode:v1:<userId>`, donc une clé par utilisateur sur un même navigateur (vérifié en E2E).
   Cible : préférence serveur par utilisateur, avec le même type et la même API côté React (seule la
   source change). **Aucune migration à ce stade.**
9. **Protection du prototype.** Le fournisseur, le sélecteur et la page ne sont actifs qu'avec
   `DESIGN_PREVIEW=1`. Sans cette variable, la page renvoie une 404, le menu ne contient aucune entrée
   et aucune préférence n'est lue ni écrite (test E2E `design-preview.spec.ts`).

## 3. Généralisation (après validation, non réalisée)

- **Espace entreprise** (`/daf/c/[id]/…`) et **portail dirigeant** (`/client/[id]`) : même fournisseur
  dans leur layout, compositions par mode pour chaque page qui le justifie. Les données restent filtrées
  par les mêmes gardes et la même RLS : le mode ne donne accès à rien de plus.
- **Espace cabinet** (portefeuille multi-entreprises) : il reçoit sa propre composition par mode. Il ne
  faut pas le confondre avec le tableau de bord financier d'une entreprise. Aucune consolidation entre
  entreprises indépendantes.
- **Phase 4** : `buildDashboardModel` sera remplacé par les véritables indicateurs (avec statut « données
  insuffisantes »). Les compositions ne changeront pas de contrat.

## 4. Écarts assumés par rapport aux images de référence

| Point | Choix | Raison |
|---|---|---|
| Barre de recherche, cloche de notifications | Non reproduites | Ces fonctions n'existent pas : ce seraient de faux contrôles |
| Navigation de la référence (Analyses, Budgets, Clients & Factures…) | Navigation réelle conservée | Les modules non livrés restent signalés « à venir » avec leur phase |
| Marge nette | 14,9 % au lieu de 12,4 % | 186 540 / 1 248 320 = 14,9 % : le chiffre de l'image est incohérent avec ses propres montants |
| Objectif annuel | 74,6 % au lieu de 74 % | Calcul au dixième, règle commune |
| Répartition des actifs | Trésorerie 11,8 %, autres actifs 10,2 % (au lieu de 16 % et 6 %) | La trésorerie du bilan doit être égale à la trésorerie du mode Pilotage (523 410 €) |
| Créances clients 18 % | Libellé « Créances (clients et autres) » | Les créances clients seules valent 312 690 €, comme dans le mode Pilotage |
| « Voir la trésorerie », « Prévisions 90 jours » | Boutons désactivés, mention « phase 5b » | Le module n'existe pas encore |
| Mini-barres de trésorerie | Juillet à décembre | La période affichée se termine en décembre 2024 |
| Résultat net sur le graphique combiné | Échelle de droite, signalée dans la légende | Un ordre de grandeur dix fois plus petit rendait la ligne illisible |
| Comptes des entités | Mention « avant éliminations, somme ≠ consolidé » | Ne pas présenter une somme comme une consolidation |
