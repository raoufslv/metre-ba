# Métré BA

Application web de **métré béton armé sur plans PDF** pour les logements. On ouvre un plan,
on étalonne l'échelle de chaque page, on trace les éléments de structure (un code couleur
par élément) et on obtient, par élément et par niveau : **volume de béton (m³), surface de
coffrage (m²), acier HA (kg) et treillis soudé (kg)**, avec déduction des ouvertures dans
les voiles et des trémies dans les planchers.

> **Quantités à valider par un ingénieur ou un métreur avant tout chiffrage.**
> Les ratios et dimensions du catalogue sont indicatifs : l'application fait du métré, pas
> du dimensionnement.

## Confidentialité

L'application tourne **100 % dans le navigateur** :

- le plan (PDF ou image) n'est jamais envoyé sur un serveur ;
- le projet et le plan sont enregistrés localement dans IndexedDB, les préférences dans
  localStorage ;
- aucune requête réseau, aucune télémétrie, aucun compte.

Effacer les données du site dans le navigateur (ou le bouton « Nouveau projet ») supprime
tout. Pensez à exporter le JSON du projet pour le conserver ailleurs.

## Installation

Node.js 20 ou plus récent.

```bash
npm install
npm run dev        # serveur de développement sur http://localhost:5173
```

## Scripts

| Commande          | Rôle                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `npm run dev`     | Serveur de développement Vite                                                |
| `npm run check`   | Typecheck, lint, format, tests avec couverture (≥ 90 % sur `src/lib`), build |
| `npm run build`   | Build de production dans `dist/`                                             |
| `npm run preview` | Sert le build de production en local                                         |
| `npm test`        | Tests Vitest seuls                                                           |
| `npm run demo`    | Régénère `demo/plan-demo.pdf`                                                |

## Déploiement statique

`npm run build` produit un site statique dans `dist/` (chemins relatifs, `base: "./"`) :
copiez ce dossier sur n'importe quel hébergement statique (Nginx, Apache, GitHub Pages,
Netlify, un partage interne). Aucun serveur applicatif n'est nécessaire. Servez-le en HTTPS
(ou `localhost`) pour bénéficier de toutes les API du navigateur.

## Prise en main

1. **Ouvrir un plan** (PDF multi-pages, PNG ou JPEG), ou « Ouvrir le plan d'exemple ».
2. **Étalonner** (E) : cliquer les deux extrémités d'une cote connue, saisir la distance en
   mètres. L'échelle est mémorisée **par page** ; aucune mesure n'est possible sur une page
   non étalonnée.
3. **Vérifier une cote** (K) : mesurer une autre cote et saisir sa valeur ; verdict vert
   (< 1 %), orange (< 5 %) ou rouge, avec « Recalibrer ».
4. Choisir un élément dans la barre latérale (ses paramètres se déplient ; un second clic
   les réduit, la liste ne montre plus que les lignes compactes) puis **tracer** :
   - linéaire et ouverture : clics successifs, double-clic ou Entrée pour terminer ;
   - surface et trémie : au moins 3 sommets, double-clic pour fermer ;
   - unité (poteau, semelle isolée…) : un clic = une unité.

   Maj verrouille l'angle à 45°/90°, Échap annule, Ctrl+Z / Ctrl+Maj+Z annule et rétablit.

5. Onglet **Tracés** : survol, sélection, déplacement des sommets, changement d'élément ou
   de niveau, suppression.
6. **Exporter** : CSV, JSON (réimportable), Excel (Récapitulatif, Détail des tracés,
   Éléments et ratios, Audit) et PDF annoté (plan + tracés + légende + totaux).

Tous les raccourcis sont listés dans l'aide (`?`).

## Architecture

```
src/
  lib/            calculs purs, sans React ni DOM (testés, couverture ≥ 90 %)
    geometry.ts     aire (lacet), périmètre, polyligne, accrochage, verrouillage d'angle
    quantities.ts   béton, coffrage, acier par tracé ; récapitulatif élément × niveau
    rebar.ts        acier détaillé : barres HA (0,00617 × d²) et panneaux de treillis saisis
    vectors.ts      coins des vecteurs PDF pour l'accrochage
    scaleText.ts    échelle 1/n lue dans le texte, à confirmer
    revisions.ts    écarts de quantités entre deux versions
    calibration.ts  échelle par page, vérification de cote, règle
    catalog.ts      catalogue par défaut et palette contrastée
    store.ts        IndexedDB, import/export JSON validé, préférences
    export/         csv, json, xlsx (exceljs), markedPdf (pdf-lib), report
  pdf/planDoc.ts  chargement pdf.js / image, rendu de la zone visible, cache LRU
  state/          état zustand, historique, session et sauvegarde automatique
  components/     Canvas, Sidebar, Toolbar, SummaryTable, ScaleBar, Dialogs
  pages/App.tsx
tests/            Vitest (géométrie, quantités, étalonnage, catalogue, stockage, exports)
docs/             FORMULAS.md (formules et exemples chiffrés), DECISIONS.md (hypothèses)
demo/             plan fictif (RDC au 1/50, fondations au 1/100)
```

Chaque tracé garde sa traçabilité : échelle utilisée, méthode (manuelle ou assistée),
auteur (humain ou IA) et statut de relecture. Une proposition non relue ne compte jamais
dans les totaux.

## Documentation

- [`docs/FORMULAS.md`](docs/FORMULAS.md) : toutes les formules, schémas et exemples chiffrés.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) : hypothèses et choix d'implémentation.

## Inspiration

Les principes (échelle par page comme barrière, traçabilité des mesures, calculs purs,
application cliente seule) s'inspirent d'[OpenTakeoff](https://github.com/Kentucky-ai/opentakeoff).
Ce dépôt étant sous AGPL-3.0, **aucun code n'en a été repris** : tout est réimplémenté.
