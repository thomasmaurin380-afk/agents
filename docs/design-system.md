# Design system V1 — Fintech premium minimaliste

> Référence graphique pour toutes les pages, y compris les futurs KPI et dashboards (Phase 4 et suivantes).
> Implémentation : `app/globals.css` (tokens), `components/ui/*`, `components/layout/*`.

## 1. Direction artistique

Interface claire, sobre et précise, avec une navigation bleu nuit. La donnée prime sur la décoration :
aucune animation décorative, pas de couleur sans signification, hiérarchie portée par la taille, le
poids et la position. La complexité financière reste disponible (détails dépliables, contrôles,
traçabilité), jamais imposée au premier regard.

## 2. Palette

| Rôle | Couleur | Token |
|---|---|---|
| Bleu nuit (navigation, identité) | `#152238` | `--navy`, `--sidebar` |
| Bleu royal (actions, éléments actifs) | `#3158D8` | `--royal`, `--primary` |
| Fond de l'application | `#F6F8FB` | `--background` |
| Surfaces (cartes) | `#FFFFFF` | `--card` |
| Texte principal | `#243247` | `--foreground` |
| Texte secondaire | `#738196` | `--subtle-foreground` |
| Vert financier | `#16856B` | `--success` |
| Rouge alerte | `#C94C58` | `--destructive` |

Dérivées (toutes dans `globals.css`) : `--primary-hover`, `--surface-2` (surfaces secondaires, en-têtes de
tableau), `--border` / `--border-strong`, `--input`, `--ring` (focus), `--accent` (sélection), et pour
chaque statut un trio `--{success|warning|destructive|info}` (pastille, bordure), `-surface` (fond),
`-text` (texte).

**Contraste (WCAG AA).** `#738196` n'atteint que ≈ 4:1 sur blanc : il est réservé aux grands textes,
icônes et repères non essentiels. Les petits textes secondaires utilisent `--muted-foreground`
(`#5F6D82`, ≥ 4,5:1 sur le fond et les cartes). De même, les textes rouges et verts utilisent
`--destructive-text` (`#AD3744`) et `--success-text` (`#0E6B55`) ; le bouton destructif est sur `#AD3744`.

**Règles d'usage.** Bleu royal : action principale, élément actif, lien. Bleu nuit : structure et
identité. Vert : état positif ayant un sens métier (publié, disponible, contrôle réussi) — **jamais**
parce qu'un montant est positif. Rouge : erreur, blocage, action irréversible. Ambre : avertissement,
provisoire, à vérifier.

## 3. Mode sombre

Le mode clair est la référence. Le mode sombre (`next-themes`, classe `.dark`) redéfinit les mêmes
tokens : fond `#0D131E`, cartes `#141C2A`, surfaces `#1A2333`, bordures blanches à 8 %, bleu d'action
`#4A6FE3`, navigation `#0A0F18`. Aucune page ne définit de couleur propre au thème : tout passe par
les tokens.

## 4. Typographie

Geist (paquet `geist`, police locale servie par `next/font/local` : aucun chargement externe),
repli Inter puis polices système. Geist Mono pour les numéros de compte.

| Usage | Style |
|---|---|
| Titre de page (`PageHeader`) | 24–28 px, semi-gras, interlettrage −0,01 em ; surtitre `eyebrow` optionnel |
| Titre de section (`SectionTitle`) | 16 px semi-gras |
| Titre de carte | 15 px semi-gras |
| Texte courant | 14 px |
| Libellés de formulaire | 13 px medium |
| En-têtes de tableau, surtitres (`.eyebrow`) | 11 px capitales, interlettrage 0,08 em |
| Chiffres de synthèse (`Stat`) | 28 px semi-gras, chiffres tabulaires |

Montants : classe `num` (chiffres tabulaires, sans césure) et alignement à droite. Les chiffres
tabulaires sont aussi activés par défaut sur le `body`. Un montant important se distingue par sa
taille et sa position, pas par sa couleur ; signes et valeurs négatives toujours affichés.

## 5. Structure et navigation

- **Sidebar** bleu nuit, 256 px, fixe sur ordinateur ; repliable sur mobile via le bouton « Menu »
  (sans JavaScript, accessible au clavier). Groupes « Cabinet » et « Entreprise active » (nom de
  l'entreprise affiché) côté DAF, « Mon espace » côté dirigeant. Élément actif : fond légèrement
  éclairci, texte blanc, filet bleu à gauche (un seul indicateur). Modules à venir : grisés, phase
  indiquée, non cliquables. La navigation ne montre que les liens autorisés.
- **En-tête** clair et collant : espace et cabinet (ordinateur), utilisateur, thème, déconnexion.
  Aucun bouton factice.
- **Contenu** : largeur maximale 1360 px, marges 16 / 24 / 32 px, espacement vertical entre sections
  de 24 à 40 px. `PageHeader` (surtitre, titre, description, actions) en tête de chaque page.

## 6. Composants

| Composant | Règles |
|---|---|
| `Card` | fond blanc, bordure `--border`, rayon 12 px, ombre `--shadow-card` quasi imperceptible ; ne pas imbriquer de cartes sans nécessité |
| `Button` | `default` = primaire (bleu royal) · `outline` = secondaire · `ghost` / `link` = tertiaire · `destructive` = irréversible (toujours derrière une confirmation) ; états survol, focus (anneau bleu), désactivé, `aria-busy` |
| `Badge` | pastille arrondie ; `success` (publié, disponible), `warning` (provisoire, à vérifier), `destructive` (bloquant, obsolète), `info`, `default` (validé), `outline` / `secondary` (neutre). Le libellé porte toujours le sens |
| `Alert` | filet coloré à gauche, fond teinté, texte lisible |
| `Input`, `Select`, `Textarea`, `Label`, `FieldError` | hauteur 40 px mobile / 36 px ordinateur, focus bleu, erreur rouge annoncée (`role="alert"`) |
| `Table` | en-têtes `eyebrow` sur `--surface-2`, lignes de 48 px, survol subtil ; `TableCell num` pour les montants ; défilement horizontal confiné au tableau |
| `Stat` | chiffre de synthèse : libellé, valeur, précision |
| `EmptyState` | icône discrète, message court, action éventuelle |
| `InsufficientDataCard` | indicateur sans données : « Données insuffisantes » + source manquante, jamais de valeur |

**Tableaux financiers (SIG).** Lignes de détail en 13 px, sous-totaux en medium, soldes sur fond
`--surface-2` avec filet supérieur ; valeur ajoutée et EBE repérés par un filet bleu, résultat de
l'exercice sur fond `--accent`. L'ordre et les formules ne changent jamais pour l'affichage. Détail
par compte en `<details>` (chevron), avec le fondement du classement (PCG / Cabinet / Entreprise).

## 7. Responsive

Largeurs vérifiées : 1440, 1024, 768, 390 px. Aucune page ne défile horizontalement ; seuls les
tableaux denses défilent dans leur cadre (les colonnes financières ne sont jamais masquées). Les
cartes portent `min-w-0` pour ne pas élargir les grilles. Formulaires sur une colonne en mobile.

## 8. Accessibilité

Focus visible partout (anneau `--ring`), navigation clavier (menu mobile compris), libellés associés
aux champs, erreurs annoncées, `aria-current` sur la navigation et les étapes, contraste AA,
statuts compréhensibles sans la couleur, `prefers-reduced-motion` respecté (transitions coupées),
transitions limitées à 150 ms sur les couleurs.

## 9. Pour les futurs développements

1. Utiliser exclusivement les tokens (`bg-card`, `text-muted-foreground`, `bg-success-surface`…),
   jamais de couleur codée en dur ni de valeur arbitraire de couleur.
2. Réutiliser `PageHeader`, `SectionTitle`, `Card`, `Stat`, `Table`, `Badge`, `EmptyState` avant de
   créer un composant ; en cas de nouveau composant, l'ajouter à `components/ui` et à ce document.
3. KPI et graphiques (Phase 4) : séries en bleu royal et dérivés neutres ; vert / rouge uniquement
   quand le sens économique de l'indicateur le justifie ; toujours « Données insuffisantes » sans
   source ; montants en `num`.
4. Conserver les `data-testid` et libellés utilisés par les tests E2E.
