import { useEffect, useMemo, useState } from "react";
import { COFFRAGE_LABELS, dimFields, hasOwnRatios, MODE_LABELS } from "../lib/catalog";
import { formatNumber, formatQty } from "../lib/format";
import { COFFRAGES_BY_MODE, computeMeasurement, targetModeFor } from "../lib/quantities";
import type { Coffrage, Element, Measurement, Mode } from "../lib/types";
import {
  deleteMeasurement,
  selectElement,
  updateElement,
  updateMeasurement,
  useApp,
} from "../state/store";

function parseDecimal(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function show(n: number): string {
  return String(n).replace(".", ",");
}

/** Champ numérique français (virgule acceptée), validé à la frappe. */
function NumberField({
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
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText((t) => (parseDecimal(t) === value ? t : show(value)));
  }, [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseDecimal(e.target.value);
          setInvalid(n === null);
          if (n !== null && n !== value) onCommit(n);
        }}
        onBlur={() => {
          setText(show(value));
          setInvalid(false);
        }}
      />
    </div>
  );
}

function family(mode: Mode): "line" | "area" | "point" {
  if (mode === "ligne" || mode === "ouv") return "line";
  if (mode === "surface" || mode === "tremie") return "area";
  return "point";
}

function ElementEditor({ el, elements }: { el: Element; elements: Element[] }) {
  const targetMode = targetModeFor(el.mode);
  const targets = targetMode ? elements.filter((e) => e.mode === targetMode) : [];
  const p = `el-${el.id}`;
  return (
    <div className="element-editor">
      <div className="field">
        <label htmlFor={`${p}-color`}>Couleur</label>
        <input
          id={`${p}-color`}
          type="color"
          value={el.color}
          onChange={(e) => updateElement(el.id, { color: e.target.value })}
        />
      </div>
      {dimFields(el.mode).map(({ field, label }) => (
        <NumberField
          key={field}
          id={`${p}-${field}`}
          label={label}
          value={el[field]}
          onCommit={(v) => updateElement(el.id, { [field]: v })}
        />
      ))}
      <div className="field">
        <label htmlFor={`${p}-cof`}>Coffrage</label>
        <select
          id={`${p}-cof`}
          value={el.cof}
          onChange={(e) => updateElement(el.id, { cof: e.target.value as Coffrage })}
        >
          {COFFRAGES_BY_MODE[el.mode].map((c) => (
            <option key={c} value={c}>
              {COFFRAGE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      {hasOwnRatios(el.mode) ? (
        <>
          <NumberField
            id={`${p}-ha`}
            label="Ratio acier HA (kg/m³)"
            value={el.ratioHA}
            onCommit={(v) => updateElement(el.id, { ratioHA: v })}
          />
          <NumberField
            id={`${p}-ts`}
            label="Ratio treillis soudé (kg/m³)"
            value={el.ratioTS}
            onCommit={(v) => updateElement(el.id, { ratioTS: v })}
          />
        </>
      ) : (
        <div className="field">
          <label htmlFor={`${p}-target`}>Déduire de</label>
          <select
            id={`${p}-target`}
            value={el.targetId ?? ""}
            onChange={(e) => updateElement(el.id, { targetId: e.target.value || undefined })}
          >
            <option value="">— choisir —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <small className="muted">Épaisseur et ratios d'acier sont ceux de l'élément ciblé.</small>
        </div>
      )}
      <small className="muted">Valeurs indicatives, à valider par un ingénieur.</small>
    </div>
  );
}

function ElementsTab() {
  const elements = useApp((s) => s.project.elements);
  const measurements = useApp((s) => s.project.measurements);
  const activeId = useApp((s) => s.activeElementId);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of measurements) c.set(m.elementId, (c.get(m.elementId) ?? 0) + 1);
    return c;
  }, [measurements]);

  return (
    <ul className="element-list" aria-label="Éléments de structure">
      {elements.map((el) => {
        const active = el.id === activeId;
        return (
          <li key={el.id} className={active ? "active" : undefined}>
            <button
              type="button"
              className="element-btn"
              aria-pressed={active}
              aria-expanded={active}
              onClick={() => selectElement(el.id)}
            >
              <span className="swatch" style={{ background: el.color }} aria-hidden="true" />
              <span className="element-name">{el.name}</span>
              <span className="badge" title={MODE_LABELS[el.mode]}>
                {counts.get(el.id) ?? 0}
              </span>
            </button>
            {active && <ElementEditor el={el} elements={elements} />}
          </li>
        );
      })}
    </ul>
  );
}

function MeasurementEditor({ m }: { m: Measurement }) {
  const elements = useApp((s) => s.project.elements);
  const levels = useApp((s) => s.project.levels);
  const el = elements.find((e) => e.id === m.elementId);
  const compatible = el ? elements.filter((e) => family(e.mode) === family(el.mode)) : elements;
  const targetMode = el ? targetModeFor(el.mode) : null;
  const p = `m-${m.id}`;
  return (
    <div className="measurement-editor">
      <div className="field">
        <label htmlFor={`${p}-el`}>Élément</label>
        <select
          id={`${p}-el`}
          value={m.elementId}
          onChange={(e) => {
            const next = elements.find((x) => x.id === e.target.value);
            if (!next) return;
            const deduction = next.mode === "ouv" || next.mode === "tremie";
            updateMeasurement(m.id, {
              elementId: next.id,
              targetId: deduction ? (m.targetId ?? next.targetId) : undefined,
              h: next.mode === "ouv" ? (m.h ?? next.h) : undefined,
            });
          }}
        >
          {compatible.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${p}-lv`}>Niveau</label>
        <select
          id={`${p}-lv`}
          value={m.level}
          onChange={(e) => updateMeasurement(m.id, { level: e.target.value })}
        >
          {levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      {el?.mode === "ouv" && (
        <NumberField
          id={`${p}-h`}
          label="Hauteur de l'ouverture (m)"
          value={m.h ?? el.h}
          onCommit={(v) => updateMeasurement(m.id, { h: v }, `m:${m.id}:h`)}
        />
      )}
      {targetMode && (
        <div className="field">
          <label htmlFor={`${p}-tg`}>Déduire de</label>
          <select
            id={`${p}-tg`}
            value={m.targetId ?? el?.targetId ?? ""}
            onChange={(e) => updateMeasurement(m.id, { targetId: e.target.value || undefined })}
          >
            <option value="">— choisir —</option>
            {elements
              .filter((e) => e.mode === targetMode)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </div>
      )}
      <p className="muted small">
        Échelle {formatNumber(m.meta.scale * 1000, 3)} mm/unité ·{" "}
        {m.meta.method === "manual" ? "manuel" : "assisté"} ·{" "}
        {m.meta.author === "human" ? "humain" : "IA"} · {m.meta.reviewed ? "relu" : "à relire"}
      </p>
      <p className="muted small">Glissez un sommet sur le plan pour le déplacer.</p>
    </div>
  );
}

function MeasurementsTab() {
  const page = useApp((s) => s.page);
  const project = useApp((s) => s.project);
  const selectedId = useApp((s) => s.selectedId);
  const hoverId = useApp((s) => s.hoverId);
  const list = project.measurements.filter((m) => m.page === page);

  if (list.length === 0) {
    return <p className="muted pad">Aucun tracé sur la page {page}.</p>;
  }
  return (
    <ul className="measurement-list" aria-label={`Tracés de la page ${page}`}>
      {list.map((m, i) => {
        const el = project.elements.find((e) => e.id === m.elementId);
        const q = computeMeasurement(m, project.elements);
        const selected = m.id === selectedId;
        return (
          <li
            key={m.id}
            className={[selected && "selected", hoverId === m.id && "hover"]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => useApp.setState({ hoverId: m.id })}
            onMouseLeave={() => useApp.setState({ hoverId: null })}
          >
            <div className="measurement-row">
              <button
                type="button"
                className="measurement-btn"
                aria-pressed={selected}
                onClick={() =>
                  useApp.setState({ selectedId: selected ? null : m.id, tool: "select", draft: [] })
                }
                onFocus={() => useApp.setState({ hoverId: m.id })}
                onBlur={() => useApp.setState({ hoverId: null })}
              >
                <span
                  className="swatch"
                  style={{ background: el?.color ?? "#666" }}
                  aria-hidden="true"
                />
                <span className="element-name">
                  {i + 1}. {el?.name ?? "Élément supprimé"}
                  <small className="muted"> · {m.level}</small>
                </span>
                <span className="qty">
                  {formatQty(q.quantity, q.unit)}
                  {q.warnings.length > 0 && (
                    <span
                      className="warn"
                      title={q.warnings.join(" ")}
                      aria-label={q.warnings.join(" ")}
                    >
                      {" "}
                      ⚠
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="icon danger"
                aria-label={`Supprimer le tracé ${i + 1} (${el?.name ?? ""})`}
                title="Supprimer"
                onClick={() => deleteMeasurement(m.id)}
              >
                🗑
              </button>
            </div>
            {selected && <MeasurementEditor m={m} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function Sidebar() {
  const [tab, setTab] = useState<"elements" | "measurements">("elements");
  const selectedId = useApp((s) => s.selectedId);
  useEffect(() => {
    if (selectedId) setTab("measurements");
  }, [selectedId]);

  return (
    <aside className="sidebar" aria-label="Éléments et tracés">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-elements"
          aria-selected={tab === "elements"}
          aria-controls="panel-elements"
          onClick={() => setTab("elements")}
        >
          Éléments
        </button>
        <button
          type="button"
          role="tab"
          id="tab-measurements"
          aria-selected={tab === "measurements"}
          aria-controls="panel-measurements"
          onClick={() => setTab("measurements")}
        >
          Tracés
        </button>
      </div>
      <div
        className="tab-panel"
        role="tabpanel"
        id={tab === "elements" ? "panel-elements" : "panel-measurements"}
        aria-labelledby={tab === "elements" ? "tab-elements" : "tab-measurements"}
      >
        {tab === "elements" ? <ElementsTab /> : <MeasurementsTab />}
      </div>
    </aside>
  );
}
