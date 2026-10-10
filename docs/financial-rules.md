# Règles financières du moteur

> Statut : **v1 — Phase 3 (SIG)**. Code : `domain/sig/*` (pur, sans accès base),
> `services/sig.ts`, `repositories/sig.ts`. Référentiels de rattachement : `docs/sig-rules.md`.

## 1. Exactitude

- Montants en **centimes entiers** (`bigint`) de la lecture SQL (`numeric` rendu en texte) jusqu'à
  l'affichage : aucun flottant. Pourcentages calculés en entiers, arrondis au dixième.
- Aucun chiffre n'est estimé : sans source exploitable, le calcul renvoie « Données insuffisantes »
  avec la raison (balance absente à la date, FEC incomplet, mois précédent manquant…).
- Aucune ligne d'équilibrage n'est jamais créée.
- Déterminisme : mêmes données, mêmes exceptions, même référentiel ⇒ même contenu et même
  empreinte (JSON canonique, SHA-256).

## 2. Sources

Une seule source par calcul ; **jamais** d'addition balance + FEC, ni de cumul de balances successives.
Les relevés bancaires ne sont **jamais** utilisés pour les SIG (testé).

| Période | Balance | FEC |
|---|---|---|
| Exercice complet | balance courante arrêtée à la date de clôture | écritures du FEC courant de l'exercice |
| Cumul à fin de mois M | balance courante arrêtée à la fin du mois M | écritures du 1er jour de l'exercice à la fin de M |
| Mois isolé M | balance(fin M) − balance(fin M-1), les deux courantes ; mois 1 : balance(fin M) seule | écritures du mois |

- Seules les versions **courantes** comptent : balance `is_current`, FEC au statut « Enregistré »
  (les versions remplacées sont conservées mais ignorées).
- FEC « incomplet » pour une période : aucune écriture dans son dernier mois ⇒ source indisponible.
- Écritures de détermination du résultat (une même écriture mouvemente le 12 et des comptes 6/7)
  ⇒ **bloquant**, car elles annuleraient les soldes.

### Choix de la source

- Automatique : la balance si elle existe (elle reflète l'arrêté), sinon le FEC. Si les deux existent,
  le FEC sert de **contrôle croisé** compte par compte (classes 6 et 7) : tout écart est **bloquant**.
- Choix explicite par le DAF alors que les deux sources existent : **justification obligatoire** ;
  l'écart éventuel devient un avertissement conservé dans la version figée et dans le journal d'audit.

## 3. Contrôles

Bloquants (validation et publication impossibles) : aucune source ; aucun compte de classe 6/7 ;
compte sans rattachement PCG ; compte de gestion sans rubrique (à confirmer, supprimé par le
référentiel, sans règle) ; **écart de rapprochement** ; divergence balance/FEC sans choix justifié ;
écritures de clôture dans le FEC.

Rapprochement indépendant : le résultat issu des SIG est comparé à −Σ(débit − crédit) de tous les
comptes de classes 6 et 7, calculé **sans** les règles. L'écart attendu est 0,00 €.

Avertissements (conservés dans la version figée) : données provisoires ou exercice non clos ;
« Données N-1 indisponibles » ; durées N / N-1 différentes ; référentiels N / N-1 différents ;
exceptions de classement utilisées ; résultat exceptionnel non nul en 2025 ; référentiel non encore
validé par le cabinet (affiché, bloque uniquement la publication).

## 4. Comparaison N / N-1

- N-1 = l'exercice qui se termine la veille de l'ouverture de N ; même période relative (même rang de
  mois, exercices décalés compris). Calculé avec **son** référentiel et ses exceptions, en source automatique.
- N-1 n'est affiché que s'il est complet et rapproché à 0,00 € ; sinon « Données N-1 indisponibles »
  (jamais zéro).
- Variation en euros toujours ; en % seulement si N-1 ≠ 0 (sinon « n.s. »). Part du CA seulement si le
  CA est strictement positif.

## 5. Cycle de vie

1. **Provisoire** : calcul à la demande (personnel du cabinet), jamais enregistré.
2. **Validé** : `sig.validate` (administrateur ou collaborateur DAF), sans contrôle bloquant, sur le
   contenu effectivement affiché (empreinte comparée). Crée une version **figée** (`sig_snapshots`) :
   période, source et fichiers, référentiel et version, empreinte du référentiel, version du moteur,
   montants, détail par compte, contrôles, exceptions utilisées, auteur, date, `data_version`,
   empreinte des données, empreinte du contenu. Immuable (trigger, y compris pour le propriétaire).
3. **Publié** : `sig.publish` (administrateur DAF uniquement, jamais automatique), seulement si la
   version n'est pas obsolète et si le référentiel a été validé par le cabinet (contrôlé aussi en base).
4. **Obsolète** : l'empreinte des données (balances et FEC courants, rattachements PCG des comptes
   6/7, exceptions actives, pour N et N-1) ou du référentiel a changé. L'historique est conservé ; le
   client voit un avertissement « données mises à jour ».

Le client ne lit que les versions publiées (service **et** RLS) : soldes principaux, CA, comparaison,
explications simples, date de publication, statut des données. Ni détail par compte, ni justification,
ni exception, ni version non publiée.

## 6. Performance

Agrégation en SQL (`GROUP BY` compte) sur le FEC ; une requête par source et par période ; aucune
boucle N+1 ; aucun cache applicatif (calcul en quelques dizaines de millisecondes pour une TPE). Les
versions figées tiennent lieu de résultat stocké, invalidé par empreinte.
