# Référentiels SIG

> Statut : **v2 — corrections ciblées du 2026-10-10 (648, 649, 608/609/6098, 708/7098, 74x, 672/772, 687/787).**
> Les choix de présentation du cabinet (§ 5) restent à approuver avant toute publication.
> Source de vérité : `domain/sig/rules.ts` (testé par `tests/unit/sig/engine.test.ts`).
> Les tableaux de règles ci-dessous sont générés à partir du code. La page « Référentiel SIG »
> de l'espace DAF affiche les mêmes règles et permet leur validation par l'administrateur du cabinet.

## 1. Sélection du référentiel

| Référentiel | Exercices concernés | Texte |
|---|---|---|
| `PCG-2024` | ouverts **avant** le 01/01/2025 | PCG (règlement ANC n° 2014-03 modifié), art. 842-1 « tableau des soldes intermédiaires de gestion » |
| `PCG-2025` | ouverts **à compter** du 01/01/2025 | même base, modifiée par le règlement ANC n° 2022-06 |

La sélection se fait sur la **date d'ouverture** de l'exercice (un exercice 01/07/2024 – 30/06/2025
reste en `PCG-2024`). Une comparaison N / N-1 entre deux référentiels différents est signalée.

Chaque référentiel porte un numéro de version et une **empreinte** (SHA-256 des lignes, formules,
règles et hypothèses). Toute modification change l'empreinte : les versions figées antérieures
deviennent « obsolètes » et le référentiel doit être revalidé avant toute nouvelle publication.

## 2. Rubriques et formules

Convention : un produit vaut **crédit − débit**, une charge **débit − crédit**, sur la période.
Un compte de charge créditeur (avoir, remboursement) ou de produit débiteur (annulation) donne donc
une valeur négative dans sa rubrique ; une variation de stock est prise pour son solde, positif ou
négatif, sans retraitement.

| Solde / sous-total | Formule |
|---|---|
| Chiffre d'affaires net | Ventes de marchandises + Production vendue |
| Coût d'achat des marchandises vendues | Achats de marchandises + Variation de stock de marchandises (6037) |
| **Marge commerciale** | Ventes de marchandises − Coût d'achat des marchandises vendues |
| **Production de l'exercice** | Production vendue + Production stockée + Production immobilisée |
| Consommations en provenance de tiers | Achats de matières et approvisionnements + leur variation de stock + Autres achats et charges externes |
| **Valeur ajoutée** | Marge commerciale + Production de l'exercice − Consommations en provenance de tiers |
| Charges de personnel | Salaires et traitements + Charges sociales |
| **Excédent brut d'exploitation** | Valeur ajoutée + Subventions d'exploitation − Impôts et taxes − Charges de personnel |
| **Résultat d'exploitation** | EBE + Reprises (et transferts de charges avant 2025) + Autres produits − Dotations − Autres charges |
| **Résultat courant avant impôts** | Résultat d'exploitation + Quotes-parts de bénéfice − Quotes-parts de perte + Produits financiers − Charges financières |
| **Résultat exceptionnel** | Produits exceptionnels − Charges exceptionnelles |
| **Résultat de l'exercice** | Résultat courant avant impôts + Résultat exceptionnel − Participation − Impôts sur les bénéfices |

Huit soldes sont calculés. Le neuvième solde parfois présenté (plus ou moins-values de cessions
d'éléments d'actif) n'est **pas** calculé : il exige un retraitement des cessions qui sort du plan
de comptes ; il est reporté.

## 3. Rattachement des comptes

Chaîne : **compte de l'entreprise → compte PCG** (Phase 2, plan de comptes) **→ rubrique SIG**
(référentiel) **→ calcul**. Le statut « Automatique validé » du plan de comptes porte sur le
rattachement PCG uniquement ; le rattachement SIG est contrôlé séparément.

La règle **la plus spécifique** (préfixe le plus long) s'applique. Chaque règle a un **statut** et un
**fondement** :

| Statut | Effet |
|---|---|
| automatique | rattachement direct, sans intervention |
| à confirmer | une rubrique est **proposée**, mais le compte reste **bloquant** (non intégré aux SIG, écart de rapprochement) tant que l'administrateur DAF n'a pas enregistré une décision justifiée |
| transitoire | 672 / 772 : comptes d'attente à réimputer par nature ; bloquants, message adapté à la situation (provisoire / définitive) |
| incompatible | compte inexistant dans le référentiel applicable (ex. 671, 775, 791 en 2025) : reclassement obligatoire |

| Fondement | Affichage |
|---|---|
| Règle PCG | classement découlant de la nature du compte dans le PCG |
| Convention du cabinet | choix de présentation financière, non normatif, soumis à la validation du cabinet (§ 5) |
| Exception de l'entreprise | décision du DAF pour un compte d'une entreprise (justification, auteur, date, historique) |

Un compte de classe 6/7 sans règle, sans rattachement PCG, à confirmer, transitoire ou incompatible
n'est **jamais** affecté silencieusement : il bloque la validation.

### Règle conditionnelle (708 / 7098)

708 et 7098 sont « à confirmer », sauf si **aucun** compte de marchandises (707, 607, 6037, 6097,
7097) n'a de solde sur la période : ils ne peuvent alors se rapporter qu'à la production vendue et
sont rattachés automatiquement (motif affiché dans le détail).

### Exceptions propres à une entreprise

Table `sig_account_overrides` : compte, référentiel, rubrique proposée, rubrique retenue,
justification (obligatoire), auteur, date. Jamais modifiée ni supprimée : une nouvelle décision
remplace la précédente (historique conservé, journal d'audit `sig.override`). Réservée à
l'administrateur du cabinet (`sig_rules.update`). Elle ne s'applique qu'à l'entreprise et au
référentiel concernés, et ne modifie jamais les écritures ni les montants importés.

## 4. Corrections du 2026-10-10 (référentiels v2)

Référence ANC principale : recueil des normes comptables françaises (janvier 2025) et plan de comptes
PCG 2025, renvois du tableau du compte de résultat (« subdivisions à rattacher aux postes auxquels
elles se rapportent » pour 608, 609, 648, 649, 708, 7098). Les documents ANC n'étaient pas
accessibles depuis l'environnement de développement (accès réseau refusé) : les renvois sont repris
de la référence que vous avez fournie et doivent être relus sur le texte ; ils sont présentés comme
règles **à confirmer**, jamais comme classements automatiques.

| Compte | Ancien classement (v1) | Nouveau traitement (v2) | Justification | Impact SIG | Tests |
|---|---|---|---|---|---|
| 648 | automatique → salaires | à confirmer ; proposé : salaires ; salaires ou charges sociales | renvoi ANC : rattacher aux postes concernés | charges de personnel (répartition), EBE inchangé | corrections 1, 2, 12 |
| 649 | aucune règle (via 64, à confirmer) | à confirmer ; proposé : salaires ; salaires ou charges sociales ; un crédit **diminue** la charge | remboursements de charges de personnel (remplacent 791 en 2025), renvoi ANC | charges de personnel ↓, EBE ↑ ; jamais en produit ni en CA | corrections 3, 4 |
| 708 (et 708x) | automatique → production vendue | à confirmer ; automatique en production vendue sans activité de marchandises | renvoi ANC | marge commerciale vs production ; CA inchangé (pas de double comptage) | corrections 5, 6 |
| 7098 | automatique → production vendue | même traitement que 708 | renvoi ANC | idem | correction 7 |
| 608, 6081-6087 | 608 à confirmer, 6081-6087 automatiques | 608 et toutes subdivisions à confirmer (subdivisions 608x non normalisées par le PCG) | renvoi ANC ; pas de classement prétendument réglementaire | marge / consommations | statuts |
| 6098 | automatique → autres achats | à confirmer (rabais **non affectés**) | renvoi ANC | marge / consommations | statuts |
| 74 (2025) | automatique → subventions d'exploitation | à confirmer (741, 742 ou 747 ?) | le PCG 2025 subdivise 74 | EBE | comparaison 2024/2025 |
| 741 (2025) | via 74 | automatique → subventions d'exploitation | PCG 2025 | EBE | correction 8 |
| 742 (2025) | via 74 → subventions d'exploitation | **convention à confirmer** : proposée après l'EBE (autres produits) ; le DAF peut retenir les subventions d'exploitation | subvention d'équilibre (ex-7715, exceptionnelle avant 2025) : couvre un déficit global | EBE (± montant), résultat d'exploitation et net inchangés | corrections 8, 13 |
| 747 (2025) | automatique → autres produits (« règle ») | automatique → autres produits, affiché comme **convention du cabinet** | norme : produit d'exploitation de classe 74 ; présentation après l'EBE = choix de gestion | EBE, résultat d'exploitation inchangé | corrections 8, comparaison |
| 657 / 757 (2025) | automatique → autres charges / produits | inchangé, référence PCG 2025 précisée | norme : classes 65 / 75 (exploitation) ; présentés comme les autres 65/75 | résultat d'exploitation | engine, comparaison |
| 672 / 772 | automatique → exceptionnel | **transitoires** : bloquants, à classer selon leur nature (2024 et 2025) | comptes utilisables en cours d'exercice seulement, à réimputer à la clôture | aucun montant présumé exceptionnel | corrections 9, 10 |
| 678 / 778 (2025) | automatique → exceptionnel | inchangé + avertissement de contrôle de nature si résultat exceptionnel ≠ 0 | événements majeurs et inhabituels | résultat exceptionnel | contrôles |
| 687 / 787 | automatique, maintien « incertain » | automatique, règle PCG certaine (maintien confirmé par le texte officiel) | PCG 2025 | résultat exceptionnel | correction 11 |
| 791 (2024) | automatique → reprises | inchangé, affiché comme convention du cabinet | présentation après l'EBE | résultat d'exploitation | comparaison |

Contrôle interne ajouté : chaque compte de gestion est compté exactement une fois et le résultat des
formules égale la somme signée des rubriques (contrôle `engine_integrity`, bloquant), en plus du
rapprochement du résultat net.

## 5. Choix de présentation du cabinet à approuver

- **C-0** (2025) Structure traditionnelle à huit soldes, adaptée au plan de comptes 2025.
- **C-1** (2025) 742 Subventions d'équilibre : proposé après l'EBE, confirmé entreprise par entreprise.
- **C-2** (2025) 747 Quote-part des subventions d'investissement : après l'EBE.
- **C-3** (2025) 657 / 757 Cessions d'immobilisations : dans le résultat d'exploitation, sans solde « plus ou moins-values » isolé.
- **C-4** 708 / 7098 : automatiques en production vendue uniquement sans activité de marchandises.
- **C-5** Propositions par défaut : 648 et 649 → salaires ; 608, 609, 6098 → autres achats (toujours confirmées par le DAF).
- **C-2024-1** (2024) 791 avec les reprises, après l'EBE.

Les anciennes réserves sur 687 / 787 sont levées. Les classements de 621 (charges externes), 699
(diminution de l'impôt) et des variations de stocks (pour leur solde) suivent le PCG et ne sont plus
présentés comme des hypothèses.

## 6. Règles par préfixe (générées depuis le code)

### PCG-2024 (version 2, empreinte `f812748f51c0a54e…`)

| Préfixe | Rubrique (proposée si non automatique) | Statut | Fondement | Référence / justification |
|---|---|---|---|---|
| 60 | Autres achats et charges externes | à confirmer | PCG | Classement à confirmer par le DAF — Compte 60 sans subdivision : nature d'achat indéterminée. |
| 601 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 602 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 603 | Variation de stock de matières et approvisionnements | à confirmer | PCG | Classement à confirmer par le DAF — 603 non subdivisé : variation de stock de matières (6031/6032) ou de marchandises (6037) ? |
| 6031 | Variation de stock de matières et approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6032 | Variation de stock de matières et approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6037 | Variation de stock de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 604 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 605 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 606 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 607 | Achats de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 608 | Autres achats et charges externes | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Frais accessoires d'achat : à rattacher aux achats auxquels ils se rapportent (marchandises, matières ou autres achats). |
| 609 | Autres achats et charges externes | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Rabais, remises et ristournes obtenus non ventilés : à rattacher aux achats concernés. |
| 6091 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6092 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6094 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6095 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6096 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6097 | Achats de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6098 | Autres achats et charges externes | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Rabais, remises et ristournes non affectés : à rattacher aux achats auxquels ils se rapportent. |
| 61 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 62 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 621 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) — Personnel extérieur à l'entreprise : charge externe selon le PCG (et non charge de personnel). |
| 63 | Impôts, taxes et versements assimilés | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 64 | Salaires et traitements | à confirmer | PCG | Classement à confirmer par le DAF — Compte 64 non subdivisé : salaires (641/644) ou charges sociales (645/646/647) ? |
| 641 | Salaires et traitements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 644 | Salaires et traitements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 645 | Charges sociales | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 646 | Charges sociales | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 647 | Charges sociales | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 648 | Salaires et traitements | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Autres charges de personnel : à rattacher aux salaires ou aux charges sociales selon leur nature. |
| 649 | Salaires et traitements | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Remboursements de charges de personnel : viennent en diminution des salaires ou des charges sociales remboursés (jamais en produit). |
| 65 | Autres charges de gestion courante | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 655 | Quotes-parts de perte sur opérations faites en commun | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 66 | Charges financières | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 67 | Charges exceptionnelles | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 672 | Charges exceptionnelles | transitoire (à réimputer) | PCG | PCG : compte utilisable en cours d'exercice seulement, à réimputer par nature à la clôture — Charges sur exercices antérieurs : à réimputer par nature. |
| 68 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 68 non subdivisé : dotation d'exploitation (681), financière (686) ou exceptionnelle (687) ? |
| 681 | Dotations aux amortissements, dépréciations et provisions | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 686 | Charges financières | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 687 | Charges exceptionnelles | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 689 | — | à confirmer | PCG | Classement à confirmer par le DAF — Engagements sur ressources affectées (entités à but non lucratif) : hors modèle SIG général. |
| 69 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 69 non subdivisé : participation (691) ou impôt (695 à 699) ? |
| 691 | Participation des salariés aux résultats | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 695 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 696 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 697 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 698 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 699 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) — Produit (report en arrière des déficits) : vient en diminution de l'impôt. |
| 70 | Production vendue (biens et services) | à confirmer | PCG | Classement à confirmer par le DAF — Compte 70 non subdivisé : ventes de marchandises (707) ou production vendue ? |
| 701 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 702 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 703 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 704 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 705 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 706 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 707 | Ventes de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 708 | Production vendue (biens et services) | à confirmer (automatique sans activité de marchandises) | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Produits des activités annexes : à rattacher aux ventes de marchandises ou à la production vendue selon l'activité concernée. |
| 709 | Production vendue (biens et services) | à confirmer | PCG | Classement à confirmer par le DAF — Rabais accordés non ventilés : sur ventes de marchandises (7097) ou sur production ? |
| 7091 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7092 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7094 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7095 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7096 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7097 | Ventes de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7098 | Production vendue (biens et services) | à confirmer (automatique sans activité de marchandises) | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Rabais sur produits des activités annexes : suivent le classement des produits annexes (708) auxquels ils se rapportent. |
| 71 | Production stockée | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) — Variation des stocks d'en-cours et de produits (713x). |
| 72 | Production immobilisée | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 74 | Subventions d'exploitation | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 75 | Autres produits de gestion courante | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 755 | Quotes-parts de bénéfice sur opérations faites en commun | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 76 | Produits financiers | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 77 | Produits exceptionnels | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 772 | Produits exceptionnels | transitoire (à réimputer) | PCG | PCG : compte utilisable en cours d'exercice seulement, à réimputer par nature à la clôture — Produits sur exercices antérieurs : à réimputer par nature. |
| 78 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 78 non subdivisé : reprise d'exploitation (781), financière (786) ou exceptionnelle (787) ? |
| 781 | Reprises sur charges et transferts de charges | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 786 | Produits financiers | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 787 | Produits exceptionnels | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 79 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 79 non subdivisé : transfert de charges d'exploitation (791), financières (796) ou exceptionnelles (797) ? |
| 791 | Reprises sur charges et transferts de charges | automatique | convention cabinet | Convention de présentation du cabinet (choix de gestion, non normatif) — Transferts de charges d'exploitation : présentés avec les reprises, après l'EBE [C-2024-1]. |
| 796 | Produits financiers | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 797 | Produits exceptionnels | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |

### PCG-2025 (version 2, empreinte `6beea321534cd531…`)

| Préfixe | Rubrique (proposée si non automatique) | Statut | Fondement | Référence / justification |
|---|---|---|---|---|
| 60 | Autres achats et charges externes | à confirmer | PCG | Classement à confirmer par le DAF — Compte 60 sans subdivision : nature d'achat indéterminée. |
| 601 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 602 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 603 | Variation de stock de matières et approvisionnements | à confirmer | PCG | Classement à confirmer par le DAF — 603 non subdivisé : variation de stock de matières (6031/6032) ou de marchandises (6037) ? |
| 6031 | Variation de stock de matières et approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6032 | Variation de stock de matières et approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6037 | Variation de stock de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 604 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 605 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 606 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 607 | Achats de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 608 | Autres achats et charges externes | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Frais accessoires d'achat : à rattacher aux achats auxquels ils se rapportent (marchandises, matières ou autres achats). |
| 609 | Autres achats et charges externes | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Rabais, remises et ristournes obtenus non ventilés : à rattacher aux achats concernés. |
| 6091 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6092 | Achats de matières premières et autres approvisionnements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6094 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6095 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6096 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6097 | Achats de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 6098 | Autres achats et charges externes | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Rabais, remises et ristournes non affectés : à rattacher aux achats auxquels ils se rapportent. |
| 61 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 62 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 621 | Autres achats et charges externes | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) — Personnel extérieur à l'entreprise : charge externe selon le PCG (et non charge de personnel). |
| 63 | Impôts, taxes et versements assimilés | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 64 | Salaires et traitements | à confirmer | PCG | Classement à confirmer par le DAF — Compte 64 non subdivisé : salaires (641/644) ou charges sociales (645/646/647) ? |
| 641 | Salaires et traitements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 644 | Salaires et traitements | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 645 | Charges sociales | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 646 | Charges sociales | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 647 | Charges sociales | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 648 | Salaires et traitements | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Autres charges de personnel : à rattacher aux salaires ou aux charges sociales selon leur nature. |
| 649 | Salaires et traitements | à confirmer | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Remboursements de charges de personnel : viennent en diminution des salaires ou des charges sociales remboursés (jamais en produit). |
| 65 | Autres charges de gestion courante | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 655 | Quotes-parts de perte sur opérations faites en commun | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 657 | Autres charges de gestion courante | automatique | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Valeurs comptables des immobilisations cédées (ex-675) : charge d'exploitation (classe 65), présentée avec les autres charges [C-3]. |
| 658 | Autres charges de gestion courante | automatique | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Dont pénalités et amendes (6581/6582, ex-6711/6712). |
| 66 | Charges financières | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 67 | Charges exceptionnelles | incompatible | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Compte 67 incompatible avec le PCG 2025 (seuls 672, 678 et 687 subsistent) : reclassement par le DAF. |
| 672 | Charges exceptionnelles | transitoire (à réimputer) | PCG | PCG : compte utilisable en cours d'exercice seulement, à réimputer par nature à la clôture — Charges sur exercices antérieurs : à réimputer par nature. |
| 678 | Charges exceptionnelles | automatique | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Autres charges exceptionnelles : réservées aux événements majeurs et inhabituels (contrôle de nature signalé). |
| 68 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 68 non subdivisé : dotation d'exploitation (681), financière (686) ou exceptionnelle (687) ? |
| 681 | Dotations aux amortissements, dépréciations et provisions | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 686 | Charges financières | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 687 | Charges exceptionnelles | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 689 | — | à confirmer | PCG | Classement à confirmer par le DAF — Engagements sur ressources affectées (entités à but non lucratif) : hors modèle SIG général. |
| 69 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 69 non subdivisé : participation (691) ou impôt (695 à 699) ? |
| 691 | Participation des salariés aux résultats | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 695 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 696 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 697 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 698 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 699 | Impôts sur les bénéfices | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) — Produit (report en arrière des déficits) : vient en diminution de l'impôt. |
| 70 | Production vendue (biens et services) | à confirmer | PCG | Classement à confirmer par le DAF — Compte 70 non subdivisé : ventes de marchandises (707) ou production vendue ? |
| 701 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 702 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 703 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 704 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 705 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 706 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 707 | Ventes de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 708 | Production vendue (biens et services) | à confirmer (automatique sans activité de marchandises) | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Produits des activités annexes : à rattacher aux ventes de marchandises ou à la production vendue selon l'activité concernée. |
| 709 | Production vendue (biens et services) | à confirmer | PCG | Classement à confirmer par le DAF — Rabais accordés non ventilés : sur ventes de marchandises (7097) ou sur production ? |
| 7091 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7092 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7094 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7095 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7096 | Production vendue (biens et services) | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7097 | Ventes de marchandises | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 7098 | Production vendue (biens et services) | à confirmer (automatique sans activité de marchandises) | PCG | Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent — Rabais sur produits des activités annexes : suivent le classement des produits annexes (708) auxquels ils se rapportent. |
| 71 | Production stockée | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) — Variation des stocks d'en-cours et de produits (713x). |
| 72 | Production immobilisée | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 74 | Subventions d'exploitation | à confirmer | PCG | Classement à confirmer par le DAF — Compte 74 non subdivisé : subvention d'exploitation (741), d'équilibre (742) ou quote-part de subvention d'investissement (747) ? |
| 741 | Subventions d'exploitation | automatique | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes |
| 742 | Autres produits de gestion courante | à confirmer | convention cabinet | Convention de présentation du cabinet (choix de gestion, non normatif) — Subvention d'équilibre (ex-7715) : compense un déficit global sans mesurer la performance d'exploitation. Proposition : après l'EBE ; à confirmer pour chaque entreprise [C-1]. |
| 747 | Autres produits de gestion courante | automatique | convention cabinet | Convention de présentation du cabinet (choix de gestion, non normatif) — Quote-part des subventions d'investissement virée au résultat (ex-777) : produit d'exploitation (classe 74) présenté après l'EBE, en regard des dotations aux amortissements [C-2]. |
| 75 | Autres produits de gestion courante | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 755 | Quotes-parts de bénéfice sur opérations faites en commun | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 757 | Autres produits de gestion courante | automatique | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Produits des cessions d'immobilisations (ex-775) : produit d'exploitation (classe 75), présenté avec les autres produits [C-3]. |
| 76 | Produits financiers | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 77 | Produits exceptionnels | incompatible | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Compte 77 incompatible avec le PCG 2025 (seuls 772, 778 et 787 subsistent) : reclassement par le DAF. |
| 772 | Produits exceptionnels | transitoire (à réimputer) | PCG | PCG : compte utilisable en cours d'exercice seulement, à réimputer par nature à la clôture — Produits sur exercices antérieurs : à réimputer par nature. |
| 778 | Produits exceptionnels | automatique | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Autres produits exceptionnels : réservés aux événements majeurs et inhabituels (contrôle de nature signalé). |
| 78 | — | à confirmer | PCG | Classement à confirmer par le DAF — Compte 78 non subdivisé : reprise d'exploitation (781), financière (786) ou exceptionnelle (787) ? |
| 781 | Reprises sur amortissements, dépréciations et provisions | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 786 | Produits financiers | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 787 | Produits exceptionnels | automatique | PCG | PCG art. 842-1 (tableau des SIG, système développé) |
| 79 | — | incompatible | PCG | PCG 2025 (règlement ANC n° 2022-06), plan de comptes — Transferts de charges (791, 796, 797) supprimés : les opérations doivent être enregistrées par nature (ex. 649, 7587). |

## 7. Sources

Textes ANC de référence (non consultables depuis l'environnement, à relire) : recueil des normes
comptables françaises (janvier 2025), plan de comptes PCG 2025, règlement ANC n° 2022-06.
Sources secondaires utilisées pour recouper : Lefebvre Dalloz, Crowe, Groupe Y, Compta-Online,
MaCompta, Pennylane, Legifiscal (649 remboursements de charges de personnel, 7587 indemnités
d'assurance, suppression des 79), Dougs (fiches 741, 742, 747), Sage, Cerfrance, Groupe Fiba.
