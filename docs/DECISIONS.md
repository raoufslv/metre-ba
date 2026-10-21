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

Fichier limité à 100 Mo. Les pages sont rendues à la demande ; un cache LRU garde au plus
3 rendus de pages. Pendant le zoom, l'image existante est mise à l'échelle par transformation ;
le rendu net est relancé après 200 ms sans zoom et ne couvre que la zone visible (plus une
marge), pour rester sous les limites de taille de canvas sur un A0. Les tracés sont sur un
canvas de superposition redessiné par `requestAnimationFrame`.

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

Réticule clavier : flèches pour déplacer (Maj = pas ×10), Espace pour poser un point
(sans glisser), Entrée pour terminer. Espace maintenu + glisser = déplacement du plan.
