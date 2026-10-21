# Décisions et hypothèses

Chaque entrée : contexte, décision, conséquence. Plan validé le 21/10/2026.

## D01 — Licence du projet de référence (validé)

Le cahier des charges indique qu'OpenTakeoff est sous Apache-2.0. Le dépôt
`Kentucky-ai/opentakeoff` est en réalité sous **AGPL-3.0** (README et fichier `LICENSE`,
vérifiés le 21/10/2026). Reprendre son code imposerait l'AGPL à toute l'application.
**Décision** : aucun code n'est copié ; seuls les principes (échelle par page, traçabilité,
modules purs, client seul) sont réimplémentés. Pas de fichier NOTICE nécessaire.

## D02 — Versions des dépendances (validé)

`pdfjs-dist` 4.x (worker chargé via `?url` de Vite), `pdf-lib`, `exceljs` (chargé à la
demande pour alléger le bundle ; le paquet `xlsx` publié sur npm n'est plus maintenu), `idb`,
`zustand`. Outils : Vite 6, Vitest 4 + `@vitest/coverage-v8`, ESLint 9 (flat config),
TypeScript 5 (TypeScript 7 n'est pas encore pris en charge par typescript-eslint),
Prettier, `fake-indexeddb` pour tester la persistance.

Audit npm : Vitest 3 embarquait `tinypool` vulnérable, d'où Vitest 4. Il reste une alerte
modérée sur `uuid` (dépendance d'`exceljs`) qui ne concerne que les fonctions v3/v5/v6
appelées avec un tampon ; exceljs ne les utilise pas. Acceptée en l'état.

## D03 — Un plan par projet (validé)

Un projet = un document (PDF multi-pages ou image). Les échelles sont indexées par numéro
de page (`scales: Record<number, number>`). Une image est traitée comme un PDF d'une page ;
son unité de page est le pixel. Pour un PDF, l'unité de page est le point PDF (1/72 po),
dans le repère du viewport pdf.js à l'échelle 1 (rotation de page incluse), origine en haut
à gauche.

## D04 — Échelle utilisée pour le calcul (validé)

Les quantités d'un tracé sont calculées avec `meta.scale` (l'échelle au moment du tracé),
pas avec l'échelle courante de la page. Si l'utilisateur ré-étalonne une page qui contient
déjà des tracés, l'app propose (confirmation en ligne) de mettre à jour leur `meta.scale`.
Rien n'est modifié sans validation.

## D05 — Codes de coffrage par mode (validé)

| Mode    | Codes proposés dans l'interface        |
| ------- | -------------------------------------- |
| ligne   | f2, f3, f1, f0                         |
| surface | sr, r, f0                              |
| point   | pt, f0                                 |
| ouv     | t1 (avec tableaux), t0 (sans tableaux) |
| tremie  | rv (avec rives), r0 (sans rives)       |

Une combinaison incohérente (importée d'un JSON) donne un coffrage propre nul et un
avertissement visible ; le calcul ne lève pas d'exception.

## D06 — Ouvertures et trémies (validé)

- Épaisseur `e` = `a` de l'élément cible ; ratios acier = ceux de la cible ; le facteur de
  coffrage des faces (1 ou 2) dépend du `cof` de la cible.
- La cible d'un tracé est copiée dans `measurement.targetId` au moment du tracé.
- Si la cible n'existe plus ou n'a pas le bon mode, la déduction vaut 0 et le tracé est
  signalé en erreur dans la liste et le tableau.
- Dans le tableau, une déduction est une ligne propre (son élément × son niveau). Sa
  quantité (m ou m²) reste positive ; béton, coffrage et acier sont négatifs. Les totaux
  sont nets. La colonne Quantité n'a pas de total (unités mélangées).

## D07 — Annulation et rétablissement (validé)

Pile d'historique en mémoire (instantanés des tracés et des échelles), non persistée.
Ctrl+Z retire d'abord le dernier point du tracé en cours, sinon annule la dernière action.

## D08 — Rendu et mémoire (validé)

Fichier limité à 100 Mo, image limitée à 120 mégapixels. Les pages sont chargées à la
demande ; un cache LRU garde au plus 3 pages pdf.js (`page.cleanup()` à l'éviction) et un
seul rendu bitmap. Pendant le zoom ou le déplacement, l'image existante est transformée en
CSS ; le rendu net est relancé après 200 ms d'inactivité et ne couvre que la zone visible,
ce qui reste sous les limites de taille de canvas sur un A0 à fort zoom. Les tracés sont sur
un canvas de superposition redessiné par `requestAnimationFrame`, sans rendu React au
mouvement de la souris. Un PDF invalide, protégé, vide ou d'un format inconnu produit un
message en français, sans plantage.

## D09 — Palette de couleurs (validé)

Les tracés sont des objets graphiques : le critère retenu est un contraste ≥ 3:1 sur
blanc (WCAG 1.4.11), vérifié par un test. Les textes de l'interface respectent ≥ 4,5:1.
Une palette de 27 couleurs à ≥ 4,5:1 serait trop sombre pour rester distinguable.

## D10 — Exports (validé)

- CSV : séparateur `;`, BOM UTF-8 pour Excel, décimale virgule cochée par défaut.
- PDF annoté : tracés dessinés sur les pages d'origine (conversion par le viewport pdf.js),
  légende sur chaque page annotée, page finale avec le tableau récapitulatif et la mention
  de validation. Pour une image : nouvelle page PDF de la taille de l'image.
- Téléchargement par Blob + `a.download`, avec repli (copie presse-papiers, zone de texte).

## D11 — Périmètre de la phase 1 (validé)

Inclus : verrouillage d'angle 45°/90° (Maj), outil « vérifier une cote » (K), édition des
tracés. Reporté en phase 4 : accrochage aux extrémités vectorielles du PDF (lecture des
opérateurs pdf.js). Les fonctions pures de snap sont écrites et testées dès la phase 1.

## D12 — Couverture de tests (validé)

Seuil 90 % sur `src/lib/**`. Le code qui dépend du navigateur (chargement pdf.js, rendu
canvas) est placé hors de `lib/` (`src/pdf/`, `src/components/`). `lib/store.ts` est testé
avec `fake-indexeddb` ; les exports sont testés en Node (pdf-lib et exceljs y fonctionnent).

## D13 — Valeurs par défaut (validé)

Niveaux initiaux : « Fondations », « RDC », « R+1 ». Identifiants des éléments du catalogue
stables (slugs, ex. `voiles-ext`) pour que `targetId` et les gabarits restent valides.
Champ `version` ajouté au `Project` pour les migrations de format.

## D14 — Clavier sur le plan (validé)

Réticule clavier : flèches pour déplacer (10 px, Maj = 50 px), Espace pour poser un point
(sans glisser), Entrée pour terminer. Espace maintenu + glisser = déplacement du plan.
Raccourcis d'outils : V sélection, T tracer, E étalonner, K vérifier une cote.

## D15 — Ouverture dans un voile non coffré

Le cahier des charges dit « 1 face si la cible est f1, sinon 2 ». Pour une cible `f0`
(non coffrée), déduire deux faces rendrait le coffrage net négatif sans raison : on déduit
0 face. Les tableaux (`t1`) restent comptés.

## D16 — Ouvrir un plan dans un projet qui a des tracés

Choix en ligne : « Nouveau projet avec ce plan » (les tracés sont effacés) ou « Garder les
tracés (plan révisé) » (mêmes numéros de page). Rien n'est effacé sans ce choix.

## D17 — Affichage et ergonomie

- Tous les tracés de la page sont affichés, quel que soit le niveau (le filtre par niveau
  arrive en phase 4). Les poteaux sont dessinés à leur taille réelle a × b si l'échelle est
  connue, avec une taille minimale à l'écran.
- Glisser sur le plan avec l'outil Sélection déplace la vue.
- Bouton « Ouvrir le plan d'exemple » quand aucun plan n'est ouvert (`demo/plan-demo.pdf`
  est intégré au build).
- Légende du PDF annoté en haut à gauche de chaque page annotée, orientée selon la rotation
  de la page.
- Les messages d'information disparaissent après 6 s ; les erreurs restent jusqu'à leur
  fermeture.
- L'historique d'annulation repart de zéro à la réouverture de l'onglet (D07).

## Phase 2

- D18 : hauteur de niveau par défaut 2,70 m ; seuls voiles et poteaux peuvent la suivre (case à cocher),
  les projets v1 gardent leurs hauteurs fixes (migration v1→v2 sans changement de résultat).
- D19 : la fenêtre ajoute le coffrage de l'allège (W·e) ; l'appui est un tracé séparé facultatif.
- D20 : les pertes ne touchent que les colonnes « à commander » (affichées seulement si une perte ≠ 0).
- D21 : recouvrements désactivés par défaut ; déduction unilatérale pour ne jamais compter deux fois ;
  détection géométrique simplifiée (voir FORMULAS.md), liste des jonctions visible à l'écran.
- D22 : supprimer un élément supprime ses tracés (confirmation) ; les cibles pendantes sont effacées
  et signalées par un avertissement de calcul plutôt que de supprimer les ouvertures.
- D23 : appliquer un catalogue conserve les éléments utilisés par des tracés mais absents du gabarit.
- D24 : bibliothèque par défaut dans localStorage (`metre-ba:library`) ; nouveaux projets l'utilisent.
- D25 : l'ouverture se trace par glisser, la largeur saisie fait foi (le second point est recalé).

## Phase 3

- D26 : le mode d'acier est par élément, « ratio » par défaut. Un projet antérieur (sans `steelMode`)
  reste en ratio : ses quantités ne changent pas.
- D27 : en mode détaillé, le lot de barres et le panneau sont comptés une fois par tracé. Une longueur
  différente se fait en dupliquant l'élément ou en surchargeant le tracé. Aucune longueur normative
  (recouvrement, crochet, ancrage) n'est proposée.
- D28 : la masse linéique HA est la formule demandée 0,00617 × d². Aucune masse de panneau n'est
  codée : l'utilisateur la saisit, l'écran la marque « à vérifier ».
- D29 : le nombre de panneaux est l'arrondi supérieur de la surface à couvrir divisée par la surface
  utile (recouvrement retiré dans les deux sens). La masse porte sur la surface brute.
- D30 : une déduction vers une cible en mode détaillé ne retire pas d'acier (avertissement). Le béton
  et le coffrage restent déduits.
