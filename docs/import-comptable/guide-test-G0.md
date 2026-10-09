# Guide pas à pas : lancer le test G0 dans Google Apps Script

**Durée** : environ 10 minutes. **Prérequis** : un ordinateur, un navigateur (Chrome conseillé) et un compte Google. Un compte personnel ou de test suffit, car le test n'utilise que des **données fictives**.

**Ce que fait le test** : il fait tourner le moteur d'import dans Google, sur les jeux fictifs S01 puis S03, et vérifie qu'il obtient **exactement** les mêmes résultats que nos tests.

**Ce qu'il ne fait pas** : il n'ouvre aucun classeur, aucun fichier Drive, aucun e-mail. Il n'envoie rien sur Internet et ne demande **aucune autorisation**. Ce n'est pas un déploiement : le code reste dans un projet privé que vous pouvez supprimer à la fin.

**Le fichier à copier** : `G0_fichier_unique.gs`, joint au message. Il est aussi dans le dépôt : `import-comptable/gas/G0_fichier_unique.gs`, branche `claude/import-comptable-prototype`.

---

## Étape 1 : ouvrir Google Apps Script

1. Ouvrez votre navigateur.
2. Allez à l'adresse **https://script.google.com**
3. Connectez-vous avec votre compte Google si la page le demande.

## Étape 2 : créer un projet vide

1. En haut à gauche, cliquez sur le bouton **« + Nouveau projet »**.
2. Un éditeur s'ouvre. Au centre, il contient déjà quelques lignes :
   ```
   function myFunction() {

   }
   ```
3. En haut à gauche, cliquez sur **« Projet sans titre »**, tapez `TEST-G0-import`, puis cliquez sur **« Renommer »**.

## Étape 3 : coller le fichier

1. Cliquez **dans la zone de code**, au centre de l'écran.
2. Sélectionnez tout le texte : **Ctrl + A** (sur Mac : **Cmd + A**).
3. Appuyez sur **Suppr** : la zone de code doit être vide.
4. Ouvrez le fichier **`G0_fichier_unique.gs`** que je vous ai transmis, puis sélectionnez tout son contenu (**Ctrl + A**) et copiez-le (**Ctrl + C**).
   - *Variante* : sur GitHub, ouvrez le fichier, cliquez sur le bouton **« Raw »**, puis **Ctrl + A** et **Ctrl + C**.
5. Revenez dans l'éditeur Apps Script, cliquez dans la zone de code vide et collez (**Ctrl + V**, ou **Cmd + V** sur Mac).
6. Vérifiez que les premières lignes commencent par :
   ```
   /**
    * TEST G0 - IMPORT COMPTABLE - FICHIER UNIQUE (DONNEES FICTIVES UNIQUEMENT)
   ```

## Étape 4 : enregistrer

- Cliquez sur l'icône **disquette (« Enregistrer le projet »)** au-dessus du code, ou appuyez sur **Ctrl + S** (sur Mac : **Cmd + S**).
- Attendez quelques secondes : l'enregistrement est terminé quand la mention « non enregistré » disparaît.

## Étape 5 : lancer le test

1. Au-dessus du code, à droite des boutons « Exécuter » et « Déboguer », se trouve une **liste déroulante**. Elle doit afficher **`testPrototypeFictif`**. Sinon, cliquez dessus et choisissez `testPrototypeFictif`.
2. Cliquez sur **« ▷ Exécuter »**.
3. **Normalement, aucune fenêtre d'autorisation n'apparaît.** Si une fenêtre « Autorisation requise » s'ouvre malgré tout : **cliquez sur « Annuler », n'autorisez rien**, et prévenez-moi.

## Étape 6 : lire le résultat

1. En bas de l'écran s'ouvre le panneau **« Journal d'exécution »**. Après quelques secondes, il affiche « Exécution commencée », puis vos résultats, puis « Exécution terminée ».
2. Repérez la ligne qui commence par **`RESULTAT G0`** :
   - **`RESULTAT G0 : REUSSI ...`** : le test est concluant ;
   - **`RESULTAT G0 : ECHEC ...`** : le test a détecté un écart.
   - Si un **message en rouge** apparaît à la place (une erreur), c'est aussi une information utile : ne cherchez pas à corriger.
3. Dans tous les cas, sélectionnez le contenu du journal (de « Exécution commencée » à « Exécution terminée »), copiez-le et collez-le dans votre réponse. Une capture d'écran convient aussi.

## Étape 7 (facultative) : ranger

- Le projet `TEST-G0-import` ne contient que des données fictives et n'a accès à rien. Vous pouvez le garder pour les prochains tests ou le supprimer.
- Pour le supprimer : retournez sur https://script.google.com, faites un clic droit sur le projet (ou cliquez sur les trois points ⋮ de sa ligne), puis **« Supprimer »**.

---

## Ce que je ferai de votre résultat

| Résultat | Suite |
|---|---|
| REUSSI | Le moteur est confirmé identique dans Google. Je note la durée affichée : c'est la première mesure réelle du risque « lenteur du calcul des empreintes ». Nous pourrons préparer le palier G1 (un classeur de test vierge) |
| ECHEC, ou message rouge | J'analyse le journal que vous me transmettez et je corrige. Rien n'a été modifié de votre côté, et aucune donnée n'est concernée |
| Fenêtre d'autorisation | Vous avez annulé : rien n'a été autorisé. Je vérifie le fichier et vous renvoie une version corrigée |
