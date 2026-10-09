# Définition du MVP

> Statut : **proposition v0.1 — en attente de validation**.

## Objectif

Permettre d'accompagner **un premier client réel** en mission de *pilotage financier mensuel* :

> Chaque mois, je récupère la balance (ou le FEC) et le relevé bancaire, je les importe en quelques
> minutes, la plateforme calcule SIG, KPI et trésorerie de façon fiable et traçable, je commente et
> valide un rapport, je le publie ; le dirigeant consulte son portail et télécharge ses PDF à tout
> moment.

## Périmètre inclus

| # | Bloc | Contenu MVP | Hors MVP (plus tard) |
|---|---|---|---|
| 1 | Fondations | Auth (email + mot de passe + 2FA DAF), invitations, cabinet, entreprises, rôles, RLS, audit | SSO, facturation SaaS |
| 2 | Espaces | Espace DAF (portefeuille simple + fiche entreprise) ; portail client | Personnalisation avancée des menus |
| 3 | Imports | CSV/XLSX + FEC ; balance générale ; transactions bancaires ; modèles de correspondance ; prévisualisation ; doublons ; rapport d'import | Grand livre hors FEC, factures, budgets, imports récurrents automatiques, connecteurs bancaires |
| 4 | Comptabilité | Exercices (y c. décalés), plan de comptes, balances mensuelles/cumulées, statut provisoire/définitif | Analytique |
| 5 | SIG | Référentiel PCG versionné, mapping par préfixe + surcharges entreprise, 9 soldes, N/N-1, mensuel/cumulé, drill-down comptes, contrôles (comptes non affectés, réconciliation résultat), validation, publication | Comparaison budget, retraitements complexes |
| 6 | KPI | ~12 KPI du catalogue (CA, croissance, marge, VA, EBE, taux d'EBE, RE, RN, trésorerie disponible, flux nets, DSO si données, poids des charges) ; objectifs ; visibilité client ; « Données insuffisantes » | Formules personnalisées, KPI financiers de bilan avancés |
| 7 | Trésorerie | Comptes bancaires, transactions importées, catégorisation manuelle + règles simples (libellé contient → catégorie), soldes, encaissements/décaissements mensuels | Rapprochement factures, prévisions 30/90j/6/12 mois |
| 8 | Tableaux de bord | Dashboard DAF entreprise, accueil client, période + date d'actualisation affichées | Personnalisation des widgets |
| 9 | Reporting PDF | 3 modèles : rapport financier global, SIG, KPI ; mode instantané (avec mention « non validé ») et mode validé (version figée publiée) ; historique, téléchargement | 7 autres modèles, impression programmée |
| 10 | Accompagnement | Recommandations publiées, plan d'action, commentaires publics/internes, notes internes, documents + demandes de pièces | Missions, planning, rendez-vous, alertes automatiques |
| 11 | Démo | 3 entreprises fictives (services, commerce, artisanat), 12 mois, réinitialisables | — |

## Critères d'acceptation du MVP

1. Sur les 3 jeux de démonstration **et** un jeu de référence calculé à la main (tableur), les 9 SIG
   et les KPI MVP sont exacts au centime ; tests automatisés à l'appui.
2. Le résultat net SIG se réconcilie avec Σ classe 7 − Σ classe 6 ; tout écart bloque la publication.
3. Réimporter le même fichier ne crée aucun doublon.
4. Un client de l'entreprise A ne peut accéder à aucune donnée de B (tests service + SQL brut).
5. Aucun commentaire interne, note privée ou document interne n'apparaît dans le portail ni dans un PDF.
6. Un dirigeant génère un PDF instantané en < 30 s et télécharge un rapport validé publié.
7. L'espace DAF et le portail affichent les mêmes montants pour la même période.
8. `typecheck`, `lint`, tests unitaires/intégration/E2E et `build` passent en CI.

## Ce que le MVP n'est pas

- Pas un logiciel de tenue comptable : aucune saisie d'écriture, aucune production de comptes annuels.
- Pas d'IA pour les montants : catégorisation par règles explicites, validation humaine.
- Pas de connecteur bancaire en direct (import de fichiers uniquement).
