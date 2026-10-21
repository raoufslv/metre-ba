import { useEffect, useState } from "react";
import { formatNumber } from "../lib/format";
import { barMassKg, developedLength } from "../lib/rebar";
import type { Bar, MeshPanel, Mode } from "../lib/types";
import { newId } from "../state/store";

function show(n: number): string {
  return String(n).replace(".", ",");
}

function parseDecimal(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function DecimalInput({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(show(value));
  useEffect(() => {
    setText((t) => (parseDecimal(t) === value ? t : show(value)));
  }, [value]);
  return (
    <label className="rebar-field" htmlFor={id}>
      {label}
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseDecimal(e.target.value);
          if (n !== null && n !== value) onCommit(n);
        }}
        onBlur={() => setText(show(value))}
      />
    </label>
  );
}

const EMPTY_MESH: MeshPanel = { name: "", width: 0, length: 0, massPerM2: 0, overlap: 0 };

/** Saisie des barres HA et d'un panneau de treillis. Comptés une fois par tracé. */
export function RebarEditor({
  idPrefix,
  mode,
  bars,
  mesh,
  onBars,
  onMesh,
}: {
  idPrefix: string;
  mode: Mode;
  bars: Bar[];
  mesh?: MeshPanel;
  onBars: (bars: Bar[]) => void;
  onMesh: (mesh: MeshPanel | undefined) => void;
}) {
  const patch = (id: string, partial: Partial<Bar>) =>
    onBars(bars.map((b) => (b.id === id ? { ...b, ...partial } : b)));

  return (
    <div className="rebar-editor">
      <p className="muted small">
        Masse linéique = 0,00617 × d² kg/m. Longueur développée = longueur + recouvrements +
        crochets. Rien n'est ajouté d'office : ce lot est compté pour chaque tracé de l'élément.
      </p>
      <ul className="bar-list">
        {bars.map((b, i) => (
          <li key={b.id}>
            <strong>Barre {i + 1}</strong>
            <span className="muted">
              {" "}
              {formatNumber(developedLength(b), 2)} m · {formatNumber(barMassKg(b), 2)} kg
            </span>
            <div className="rebar-grid">
              <DecimalInput
                id={`${idPrefix}-d-${b.id}`}
                label="Ø (mm)"
                value={b.diameter}
                onCommit={(v) => patch(b.id, { diameter: v })}
              />
              <DecimalInput
                id={`${idPrefix}-n-${b.id}`}
                label="Nombre"
                value={b.count}
                onCommit={(v) => patch(b.id, { count: v })}
              />
              <DecimalInput
                id={`${idPrefix}-L-${b.id}`}
                label="Longueur (m)"
                value={b.length}
                onCommit={(v) => patch(b.id, { length: v })}
              />
              <DecimalInput
                id={`${idPrefix}-laps-${b.id}`}
                label="Recouvrements (nb)"
                value={b.laps}
                onCommit={(v) => patch(b.id, { laps: v })}
              />
              <DecimalInput
                id={`${idPrefix}-lapL-${b.id}`}
                label="Long. d'un recouvrement (m)"
                value={b.lapLength}
                onCommit={(v) => patch(b.id, { lapLength: v })}
              />
              <DecimalInput
                id={`${idPrefix}-hooks-${b.id}`}
                label="Crochets (nb)"
                value={b.hooks}
                onCommit={(v) => patch(b.id, { hooks: v })}
              />
              <DecimalInput
                id={`${idPrefix}-hookL-${b.id}`}
                label="Long. d'un crochet (m)"
                value={b.hookLength}
                onCommit={(v) => patch(b.id, { hookLength: v })}
              />
            </div>
            <button
              type="button"
              className="danger"
              onClick={() => onBars(bars.filter((x) => x.id !== b.id))}
            >
              Retirer cette barre
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          onBars([
            ...bars,
            {
              id: newId(),
              diameter: 10,
              count: 1,
              length: 1,
              laps: 0,
              lapLength: 0,
              hooks: 0,
              hookLength: 0,
            },
          ])
        }
      >
        Ajouter une barre
      </button>

      <h3 className="rebar-title">Treillis soudé</h3>
      {!mesh ? (
        <button type="button" onClick={() => onMesh({ ...EMPTY_MESH })}>
          Ajouter un panneau
        </button>
      ) : (
        <div className="rebar-grid">
          <label className="rebar-field" htmlFor={`${idPrefix}-mesh-name`}>
            Désignation (fiche)
            <input
              id={`${idPrefix}-mesh-name`}
              value={mesh.name}
              maxLength={40}
              placeholder="à reprendre sur la fiche"
              onChange={(e) => onMesh({ ...mesh, name: e.target.value })}
            />
          </label>
          <DecimalInput
            id={`${idPrefix}-mesh-w`}
            label="Largeur (m)"
            value={mesh.width}
            onCommit={(v) => onMesh({ ...mesh, width: v })}
          />
          <DecimalInput
            id={`${idPrefix}-mesh-l`}
            label="Longueur (m)"
            value={mesh.length}
            onCommit={(v) => onMesh({ ...mesh, length: v })}
          />
          <DecimalInput
            id={`${idPrefix}-mesh-m`}
            label="Masse (kg/m², fiche)"
            value={mesh.massPerM2}
            onCommit={(v) => onMesh({ ...mesh, massPerM2: v })}
          />
          <DecimalInput
            id={`${idPrefix}-mesh-o`}
            label="Recouvrement (m)"
            value={mesh.overlap}
            onCommit={(v) => onMesh({ ...mesh, overlap: v })}
          />
          {mode === "ligne" && (
            <DecimalInput
              id={`${idPrefix}-mesh-c`}
              label="Largeur de nappe (m)"
              value={mesh.coverWidth ?? 0}
              onCommit={(v) => onMesh({ ...mesh, coverWidth: v })}
            />
          )}
          <p className="muted small">
            Panneaux = surface à couvrir ÷ surface utile, arrondi au supérieur. Surface utile =
            (largeur − recouvrement) × (longueur − recouvrement). La masse porte sur la surface
            brute. Pour une surface, la surface à couvrir est l'aire mesurée ; pour un poteau,
            l'emprise a × b.
          </p>
          <button type="button" onClick={() => onMesh(undefined)}>
            Retirer le treillis
          </button>
        </div>
      )}
    </div>
  );
}
