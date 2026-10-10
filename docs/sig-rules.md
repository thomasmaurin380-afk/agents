# Référentiels SIG

> Statut : **v1 — livrée en Phase 3, hypothèses en attente de votre validation.**
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

- La règle **la plus spécifique** (préfixe le plus long) s'applique.
- `automatique` : rattachement direct.
- `à confirmer` : une rubrique est proposée, mais le compte reste **bloquant** tant que
  l'administrateur DAF n'a pas enregistré une exception justifiée pour l'entreprise.
- `supprimé` : compte qui n'existe plus dans le référentiel (ex. 671, 775, 791 en 2025) : bloquant,
  reclassement obligatoire.
- Un compte de classe 6/7 sans aucune règle, ou sans rattachement PCG, est bloquant.

### Exceptions propres à une entreprise

Table `sig_account_overrides` : compte, référentiel, rubrique proposée, rubrique retenue,
justification (obligatoire), auteur, date. Une exception n'est jamais modifiée ni supprimée : une
nouvelle décision remplace la précédente (historique conservé, journal d'audit `sig.override`).
Réservée à l'administrateur du cabinet (matrice : `sig_rules.update`). Elle ne s'applique qu'à
l'entreprise et au référentiel concernés.

## 4. Hypothèses à valider (bloquent la publication tant qu'elles ne sont pas validées)

Communes :

- **H-1** Le 621 « Personnel extérieur » est classé en consommations de tiers, et non en charges de personnel.
- **H-2** Le 708 « Produits des activités annexes » est inclus dans la production vendue et le chiffre d'affaires.
- **H-3** Le 648 est classé en salaires et traitements ; 645 à 647 en charges sociales.
- **H-4** Le 699 « Produits – report en arrière des déficits » vient en diminution de l'impôt sur les bénéfices.
- **H-5** Les variations de stocks (603x) et la production stockée (713) sont prises pour leur solde, sans retraitement.

`PCG-2024` :

- **H-2024-1** Les transferts de charges d'exploitation (791) sont présentés avec les reprises, après l'EBE ; 796 en produits financiers ; 797 en produits exceptionnels.

`PCG-2025` :

- **H-2025-0** Le règlement 2022-06 retire le modèle de tableau des SIG du PCG : la présentation traditionnelle est conservée et adaptée au nouveau plan de comptes. **Point normatif à confirmer par vous.**
- **H-2025-1** Le résultat exceptionnel ne comprend que 672, 678, 687, 772, 778 et 787 ; tout autre 67/77 est bloquant.
- **H-2025-2** Cessions d'immobilisations incorporelles et corporelles (657/757, ex-675/775) et pénalités (658, ex-6711/6712) en autres charges / autres produits, après l'EBE.
- **H-2025-3** Quote-part des subventions d'investissement virée au résultat (747, ex-777) en autres produits, après l'EBE, et non avec les subventions d'exploitation.
- **H-2025-4** Maintien des 687 / 787 (dotations et reprises exceptionnelles) : **à confirmer sur le texte officiel**, les sources secondaires consultées divergeant.
- **H-2025-5** Tout compte 79 est bloquant (transferts de charges supprimés).

### Ambiguïtés normatives signalées

1. Le texte officiel de l'ANC (anc.gouv.fr) n'était pas accessible depuis l'environnement de
   développement ; le contenu du règlement 2022-06 a été établi à partir de sources secondaires
   concordantes (éditeurs, cabinets, revues professionnelles), listées au § 6. À confirmer sur le
   texte publié au Journal officiel.
2. Statut des comptes 687 / 787 après 2025 (H-2025-4).
3. Absence de modèle de SIG dans le PCG modifié (H-2025-0) : la présentation retenue est une
   adaptation documentée, pas une reproduction d'un modèle réglementaire.

## 5. Règles par préfixe

### PCG-2024 (version 1, empreinte `b67870961945760a…`)

| Préfixe | Rubrique | Statut | Référence / justification |
|---|---|---|---|
| 60 | Autres achats et charges externes | à confirmer | Classement à confirmer par le DAF — Compte 60 sans subdivision : nature d'achat indéterminée. |
| 601 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 602 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 603 | Variation de stock de matières et approvisionnements | à confirmer | Classement à confirmer par le DAF — 603 non subdivisé : variation de stock de matières (6031/6032) ou de marchandises (6037) ? |
| 6031 | Variation de stock de matières et approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6032 | Variation de stock de matières et approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6037 | Variation de stock de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 604 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 605 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 606 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 607 | Achats de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 608 | Autres achats et charges externes | à confirmer | Classement à confirmer par le DAF — Frais accessoires d'achat non ventilés : à rattacher à la catégorie d'achats concernée. |
| 6081 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6082 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6084 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6085 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6086 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6087 | Achats de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 609 | Autres achats et charges externes | à confirmer | Classement à confirmer par le DAF — Rabais, remises et ristournes obtenus non ventilés : à rattacher à la catégorie d'achats concernée. |
| 6091 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6092 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6094 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6095 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6096 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6097 | Achats de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6098 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 61 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 62 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Y compris 621 « Personnel extérieur à l'entreprise » (charge externe). |
| 63 | Impôts, taxes et versements assimilés | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 64 | Salaires et traitements | à confirmer | Classement à confirmer par le DAF — Compte 64 non subdivisé : salaires (641/644/648) ou charges sociales (645/646/647) ? |
| 641 | Salaires et traitements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 644 | Salaires et traitements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 645 | Charges sociales | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 646 | Charges sociales | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 647 | Charges sociales | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 648 | Salaires et traitements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 65 | Autres charges de gestion courante | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 655 | Quotes-parts de perte sur opérations faites en commun | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 66 | Charges financières | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 67 | Charges exceptionnelles | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 68 | — | à confirmer | Classement à confirmer par le DAF — Compte 68 non subdivisé : dotation d'exploitation (681), financière (686) ou exceptionnelle (687) ? |
| 681 | Dotations aux amortissements, dépréciations et provisions | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 686 | Charges financières | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 687 | Charges exceptionnelles | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 689 | — | à confirmer | Classement à confirmer par le DAF — Engagements sur ressources affectées (entités à but non lucratif) : hors modèle SIG général. |
| 69 | — | à confirmer | Classement à confirmer par le DAF — Compte 69 non subdivisé : participation (691) ou impôt (695 à 699) ? |
| 691 | Participation des salariés aux résultats | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 695 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 696 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 697 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 698 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 699 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Produit (report en arrière des déficits) : vient en diminution de l'impôt. |
| 70 | Production vendue (biens et services) | à confirmer | Classement à confirmer par le DAF — Compte 70 non subdivisé : ventes de marchandises (707) ou production vendue ? |
| 701 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 702 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 703 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 704 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 705 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 706 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 707 | Ventes de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 708 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Produits des activités annexes : production vendue. |
| 709 | Production vendue (biens et services) | à confirmer | Classement à confirmer par le DAF — Rabais accordés non ventilés : sur ventes de marchandises (7097) ou sur production ? |
| 7091 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7092 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7094 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7095 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7096 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7097 | Ventes de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7098 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 71 | Production stockée | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Variation des stocks d'en-cours et de produits (713x). |
| 72 | Production immobilisée | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 74 | Subventions d'exploitation | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 75 | Autres produits de gestion courante | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 755 | Quotes-parts de bénéfice sur opérations faites en commun | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 76 | Produits financiers | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 77 | Produits exceptionnels | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 78 | — | à confirmer | Classement à confirmer par le DAF — Compte 78 non subdivisé : reprise d'exploitation (781), financière (786) ou exceptionnelle (787) ? |
| 781 | Reprises sur charges et transferts de charges | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 786 | Produits financiers | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 787 | Produits exceptionnels | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 79 | — | à confirmer | Classement à confirmer par le DAF — Compte 79 non subdivisé : transfert de charges d'exploitation (791), financières (796) ou exceptionnelles (797) ? |
| 791 | Reprises sur charges et transferts de charges | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Transferts de charges d'exploitation : présentés avec les reprises. |
| 796 | Produits financiers | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 797 | Produits exceptionnels | automatique | PCG art. 842-1 (tableau des SIG, système développé) |

### PCG-2025 (version 1, empreinte `377fea4ad3e5ed81…`)

| Préfixe | Rubrique | Statut | Référence / justification |
|---|---|---|---|
| 60 | Autres achats et charges externes | à confirmer | Classement à confirmer par le DAF — Compte 60 sans subdivision : nature d'achat indéterminée. |
| 601 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 602 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 603 | Variation de stock de matières et approvisionnements | à confirmer | Classement à confirmer par le DAF — 603 non subdivisé : variation de stock de matières (6031/6032) ou de marchandises (6037) ? |
| 6031 | Variation de stock de matières et approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6032 | Variation de stock de matières et approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6037 | Variation de stock de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 604 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 605 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 606 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 607 | Achats de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 608 | Autres achats et charges externes | à confirmer | Classement à confirmer par le DAF — Frais accessoires d'achat non ventilés : à rattacher à la catégorie d'achats concernée. |
| 6081 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6082 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6084 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6085 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6086 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6087 | Achats de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 609 | Autres achats et charges externes | à confirmer | Classement à confirmer par le DAF — Rabais, remises et ristournes obtenus non ventilés : à rattacher à la catégorie d'achats concernée. |
| 6091 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6092 | Achats de matières premières et autres approvisionnements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6094 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6095 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6096 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6097 | Achats de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 6098 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 61 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 62 | Autres achats et charges externes | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Y compris 621 « Personnel extérieur à l'entreprise » (charge externe). |
| 63 | Impôts, taxes et versements assimilés | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 64 | Salaires et traitements | à confirmer | Classement à confirmer par le DAF — Compte 64 non subdivisé : salaires (641/644/648) ou charges sociales (645/646/647) ? |
| 641 | Salaires et traitements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 644 | Salaires et traitements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 645 | Charges sociales | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 646 | Charges sociales | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 647 | Charges sociales | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 648 | Salaires et traitements | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 65 | Autres charges de gestion courante | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 655 | Quotes-parts de perte sur opérations faites en commun | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 657 | Autres charges de gestion courante | automatique | Règlement ANC n° 2022-06 — Valeur comptable des immobilisations incorporelles et corporelles cédées (ex-675) : désormais en exploitation [H-2025-2]. |
| 658 | Autres charges de gestion courante | automatique | Règlement ANC n° 2022-06 — Dont pénalités et amendes (6581/6582, ex-6711/6712) [H-2025-2]. |
| 66 | Charges financières | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 67 | Charges exceptionnelles | supprimé → reclassement | Règlement ANC n° 2022-06 — Ce compte 67 n'existe plus pour les exercices ouverts depuis le 01/01/2025 (seuls 672 et 678 subsistent) : reclassement à décider par le DAF. |
| 672 | Charges exceptionnelles | automatique | Règlement ANC n° 2022-06 — Charges sur exercices antérieurs (à solder en fin d'exercice). |
| 678 | Charges exceptionnelles | automatique | Règlement ANC n° 2022-06 — Autres charges exceptionnelles : uniquement les événements majeurs et inhabituels [H-2025-1]. |
| 68 | — | à confirmer | Classement à confirmer par le DAF — Compte 68 non subdivisé : dotation d'exploitation (681), financière (686) ou exceptionnelle (687) ? |
| 681 | Dotations aux amortissements, dépréciations et provisions | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 686 | Charges financières | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 687 | Charges exceptionnelles | automatique | Règlement ANC n° 2022-06 — Dotations exceptionnelles — maintien à confirmer [H-2025-4]. |
| 689 | — | à confirmer | Classement à confirmer par le DAF — Engagements sur ressources affectées (entités à but non lucratif) : hors modèle SIG général. |
| 69 | — | à confirmer | Classement à confirmer par le DAF — Compte 69 non subdivisé : participation (691) ou impôt (695 à 699) ? |
| 691 | Participation des salariés aux résultats | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 695 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 696 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 697 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 698 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 699 | Impôts sur les bénéfices | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Produit (report en arrière des déficits) : vient en diminution de l'impôt. |
| 70 | Production vendue (biens et services) | à confirmer | Classement à confirmer par le DAF — Compte 70 non subdivisé : ventes de marchandises (707) ou production vendue ? |
| 701 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 702 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 703 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 704 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 705 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 706 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 707 | Ventes de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 708 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Produits des activités annexes : production vendue. |
| 709 | Production vendue (biens et services) | à confirmer | Classement à confirmer par le DAF — Rabais accordés non ventilés : sur ventes de marchandises (7097) ou sur production ? |
| 7091 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7092 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7094 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7095 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7096 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7097 | Ventes de marchandises | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 7098 | Production vendue (biens et services) | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 71 | Production stockée | automatique | PCG art. 842-1 (tableau des SIG, système développé) — Variation des stocks d'en-cours et de produits (713x). |
| 72 | Production immobilisée | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 74 | Subventions d'exploitation | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 747 | Autres produits de gestion courante | automatique | Règlement ANC n° 2022-06 — Quote-part des subventions d'investissement virée au résultat (ex-777) : produit d'exploitation présenté après l'EBE [H-2025-3]. |
| 75 | Autres produits de gestion courante | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 755 | Quotes-parts de bénéfice sur opérations faites en commun | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 757 | Autres produits de gestion courante | automatique | Règlement ANC n° 2022-06 — Produits de cession d'immobilisations incorporelles et corporelles (ex-775) [H-2025-2]. |
| 76 | Produits financiers | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 77 | Produits exceptionnels | supprimé → reclassement | Règlement ANC n° 2022-06 — Ce compte 77 n'existe plus pour les exercices ouverts depuis le 01/01/2025 (seuls 772 et 778 subsistent) : reclassement à décider par le DAF. |
| 772 | Produits exceptionnels | automatique | Règlement ANC n° 2022-06 — Produits sur exercices antérieurs (à solder en fin d'exercice). |
| 778 | Produits exceptionnels | automatique | Règlement ANC n° 2022-06 — Autres produits exceptionnels : uniquement les événements majeurs et inhabituels [H-2025-1]. |
| 78 | — | à confirmer | Classement à confirmer par le DAF — Compte 78 non subdivisé : reprise d'exploitation (781), financière (786) ou exceptionnelle (787) ? |
| 781 | Reprises sur amortissements, dépréciations et provisions | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 786 | Produits financiers | automatique | PCG art. 842-1 (tableau des SIG, système développé) |
| 787 | Produits exceptionnels | automatique | Règlement ANC n° 2022-06 — Reprises exceptionnelles — maintien à confirmer [H-2025-4]. |
| 79 | — | supprimé → reclassement | Règlement ANC n° 2022-06 — Les transferts de charges (791, 796, 797) sont supprimés : les opérations doivent être reclassées par nature. |

## 6. Sources consultées (règlement ANC 2022-06)

Recherches web (le site anc.gouv.fr étant inaccessible depuis l'environnement) : Éditions Francis
Lefebvre / Lefebvre Dalloz, Crowe (dont Crowe Fiduroc), Groupe Y, Compta-Online, Blog MaCompta,
Valoxy, CRCF, TGS France, Pennylane, Axiome Associés, Cerfrance, Legifiscal, Groupe Fiba,
Simax (PCG 2025), IG Conseils, Indy, Revue française de comptabilité, BMA Groupe, Hudellet & Arres.
Points concordants retenus : suppression des comptes 79 (transferts de charges) ; résultat
exceptionnel limité aux événements majeurs et inhabituels (672, 678, 772, 778) ; cessions
d'immobilisations en exploitation (657/757) ; 777 → 747 ; 6711/6712 → 6581/6582 ; 7754 → 7571 ;
application aux exercices ouverts à compter du 01/01/2025.
