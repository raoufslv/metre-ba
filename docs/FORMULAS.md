# Formules de calcul

Source de vérité : `src/lib/quantities.ts` (module pur) et ses tests `tests/quantities.test.ts`.
Valeurs indicatives : **quantités à valider par un ingénieur ou un métreur avant tout chiffrage.**

## Conversion d'échelle

L'échelle `k` est en **mètres par unité de page** (point PDF à zoom 1, ou pixel pour une
image). Elle est fixée par étalonnage : deux points cliqués à `d` unités de page d'écart,
distance réelle `D` saisie en mètres, `k = D / d`.

Chaque tracé mémorise `k` au moment du tracé (`meta.scale`) ; c'est cette valeur qui sert
au calcul (voir `DECISIONS.md`, D04).

| Grandeur sur le plan        | Grandeur réelle |
| --------------------------- | --------------- |
| longueur de polyligne `l`   | `L = l · k`     |
| aire (formule du lacet) `s` | `S = s · k²`    |
| périmètre `p`               | `P = p · k`     |

Formule du lacet pour un polygone de sommets `(xᵢ, yᵢ)` :
`s = ½ · |Σ (xᵢ · yᵢ₊₁ − xᵢ₊₁ · yᵢ)|`. Elle est exacte pour les polygones concaves tant
que les côtés ne se croisent pas.

## Dimensions effectives

Priorité : surcharges du tracé (`overrides`) > hauteur copiée au tracé (`h`) > valeurs de
l'élément. Notations : `a` épaisseur ou largeur, `b` second côté (poteaux), `h` hauteur.

## Ligne (voiles, poutres, semelles filantes…)

```
        ┌──────────── L ────────────┐
   h    │                           │      béton    = L · a · h
        └───────────────────────────┘
                 épaisseur a
```

| Coffrage | Formule        | Usage                         |
| -------- | -------------- | ----------------------------- |
| f2       | `2 · L · h`    | deux faces (voile)            |
| f3       | `L · (a + 2h)` | deux joues + fond (poutre)    |
| f1       | `L · h`        | une face (voile contre terre) |
| f0       | `0`            | non coffré                    |

Quantité affichée : `L` en m.

## Surface (planchers, dallages, radiers…)

```
   ┌───────────────┐
   │       S       │  ép. a       béton = S · a
   └───────────────┘
        périmètre P
```

| Coffrage | Formule     | Usage                          |
| -------- | ----------- | ------------------------------ |
| sr       | `S + P · a` | sous-face + rives (dalle)      |
| r        | `P · a`     | rives seules (dallage, radier) |
| f0       | `0`         | non coffré                     |

Quantité affichée : `S` en m².

## Point (poteaux, semelles isolées, regards…)

Un tracé = une unité. `béton = a · b · h`. Coffrage `pt = 2 · (a + b) · h`, `f0 = 0`.

## Ouverture dans un voile (`ouv`)

`W` largeur tracée, `h` hauteur de l'ouverture, `e` épaisseur (`a`) du voile **cible**.

```
   ┌──────────────── voile ────────────────┐
   │        ┌── W ──┐                      │
   │        │       │ h                    │
   │        │       │                      │
   └────────┴───────┴──────────────────────┘
```

- béton = `−W · h · e`
- coffrage = `−W · h · n` + (si `t1`) `(2h + W) · e`
  - `n` = faces coffrées du voile cible : 1 si `f1`, 0 si `f0`, 2 sinon ;
  - `(2h + W) · e` : les deux tableaux et le linteau (`t0` : aucun).
- acier = béton × ratios HA et TS **de la cible**.

## Trémie dans un plancher (`tremie`)

`A` aire, `P` périmètre de la trémie, `e` épaisseur du plancher cible.

- béton = `−A · e`
- coffrage = (`−A` si la cible est en `sr`) + (si `rv`) `P · e` pour les rives (`r0` : aucune)
- acier = béton × ratios de la cible.

Une déduction dont la cible est absente ou d'un mode incompatible ne déduit rien et
est signalée.

## Acier

`HA = béton × ratioHA`, `TS = béton × ratioTS`, `acier total = HA + TS`. Les déductions sont
négatives ; tous les totaux sont nets.

## Arrondis

Stockage et calculs en pleine précision. Affichage : 2 décimales pour m, m², m³ ; 0 pour kg
et unités.

## Exemples chiffrés (tests automatisés)

| #   | Cas                                      | Béton    | Coffrage                    | Acier       |
| --- | ---------------------------------------- | -------- | --------------------------- | ----------- |
| 1   | Voile ext. 10 m, 0,20 × 2,70, HA 80      | 5,40 m³  | 2 × 10 × 2,7 = 54,00 m²     | HA 432 kg   |
| 2   | Plancher 5 × 4 m, ép. 0,20, HA 90        | 4,00 m³  | 20 + 18 × 0,2 = 23,60 m²    | HA 360 kg   |
| 3   | Poteau 0,20 × 0,20 × 2,70, HA 150        | 0,108 m³ | 2 × 0,4 × 2,7 = 2,16 m²     | HA 16,2 kg  |
| 4   | Ouverture 1,00 × 2,10 dans le voile n° 1 | −0,42 m³ | −4,2 + 5,2 × 0,2 = −3,16 m² | HA −33,6 kg |
| 5   | Trémie 1 × 1 m dans le plancher n° 2     | −0,20 m³ | −1 + 4 × 0,2 = −0,20 m²     | HA −18 kg   |
| 6   | Dallage 100 m², ép. 0,12, TS 32          | 12,00 m³ | (rives seules)              | TS 384 kg   |

Totaux nets des cas 1, 2, 4 et 5 réunis : béton 8,78 m³, coffrage 74,24 m², HA 740,4 kg.
