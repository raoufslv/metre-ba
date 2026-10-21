import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  checkDimension,
  computeScale,
  measurementsToRescale,
  parseMeters,
  VERDICT_LABELS,
} from "../lib/calibration";
import { formatNumber, formatQty } from "../lib/format";
import { distance } from "../lib/geometry";
import { OPENING_DEFAULTS, buildOpening } from "../lib/openings";
import {
  addAnnotation,
  addMeasurements,
  newId,
  notify,
  pageScale,
  setPageScale,
  setTool,
  useApp,
} from "../state/store";

// ---------- Étalonnage et vérification de cote ----------

export function ProbePanel() {
  const tool = useApp((s) => s.tool);
  const probe = useApp((s) => s.probe);
  const page = useApp((s) => s.page);
  const scale = useApp(pageScale);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingScale, setPendingScale] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = probe.length === 2;

  useEffect(() => {
    setError(null);
    setPendingScale(null);
    if (ready) inputRef.current?.focus();
  }, [ready, tool]);

  if (tool !== "calibrate" && tool !== "verify") return null;

  const span = ready ? distance(probe[0]!, probe[1]!) : 0;

  function apply(newScale: number, rescale: boolean): void {
    setPageScale(page, newScale, rescale);
    setPendingScale(null);
    setValue("");
    notify(
      "success",
      `Page ${page} étalonnée : 1 unité de page = ${formatNumber(newScale * 1000, 3)} mm.`,
    );
    setTool("draw");
  }

  function calibrateWith(meters: number | null): void {
    if (meters === null) {
      setError("Saisissez une distance, par exemple 3,50 (mètres).");
      return;
    }
    const r = computeScale(probe[0]!, probe[1]!, meters);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const others = measurementsToRescale(useApp.getState().project.measurements, page, r.value);
    if (others.length > 0) {
      setPendingScale(r.value);
      return;
    }
    apply(r.value, false);
  }

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    if (tool === "calibrate") calibrateWith(parseMeters(value));
  }

  const check =
    tool === "verify" && ready && scale !== null
      ? checkDimension(span * scale, parseMeters(value) ?? Number.NaN)
      : null;

  let body: ReactNode;
  if (!ready) {
    body = (
      <p>
        {tool === "calibrate" ? "Étalonnage" : "Vérifier une cote"} : cliquez le{" "}
        {probe.length === 0 ? "premier" : "second"} point d'une cote connue (Maj : 45°/90°).
      </p>
    );
  } else if (pendingScale !== null) {
    const n = measurementsToRescale(
      useApp.getState().project.measurements,
      page,
      pendingScale,
    ).length;
    body = (
      <div>
        <p>
          {n} tracé(s) de cette page utilisent une autre échelle. Les recalculer avec la nouvelle
          échelle ?
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={() => apply(pendingScale, true)}>
            Mettre à jour les tracés
          </button>
          <button type="button" onClick={() => apply(pendingScale, false)}>
            Conserver leur échelle
          </button>
        </div>
      </div>
    );
  } else if (tool === "calibrate") {
    body = (
      <form onSubmit={onSubmit} className="row">
        <label htmlFor="calib-dist">Distance réelle (m)</label>
        <input
          id="calib-dist"
          ref={inputRef}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex. 5,00"
          aria-describedby={error ? "probe-error" : undefined}
        />
        <button type="submit" className="primary">
          Valider
        </button>
      </form>
    );
  } else if (scale === null) {
    body = (
      <p>
        Page non étalonnée : impossible de vérifier une cote.{" "}
        <button type="button" onClick={() => setTool("calibrate")}>
          Étalonner
        </button>
      </p>
    );
  } else {
    body = (
      <div>
        <p>
          Longueur mesurée : <strong>{formatQty(span * scale, "m")}</strong>
        </p>
        <form onSubmit={onSubmit} className="row">
          <label htmlFor="verify-dist">Cote attendue (m)</label>
          <input
            id="verify-dist"
            ref={inputRef}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ex. 5,00"
          />
        </form>
        {check && (
          <div className={`verdict verdict-${check.verdict}`} role="status">
            <strong>
              Écart {check.deviation >= 0 ? "+" : ""}
              {formatNumber(check.deviation * 100, 2)} %
            </strong>{" "}
            — {VERDICT_LABELS[check.verdict]}
            {check.verdict !== "ok" && (
              <button type="button" onClick={() => calibrateWith(check.expected)}>
                Recalibrer avec cette cote
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      className="probe-panel"
      aria-label={tool === "calibrate" ? "Étalonnage" : "Vérifier une cote"}
    >
      {body}
      {error && (
        <p id="probe-error" className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="close" aria-label="Fermer" onClick={() => setTool("select")}>
        ×
      </button>
    </section>
  );
}

// ---------- Ouverture rectangulaire (porte ou fenêtre) ----------

export function OpeningPanel() {
  const tool = useApp((s) => s.tool);
  const draftPts = useApp((s) => s.openingDraft);
  const elements = useApp((s) => s.project.elements);
  const scale = useApp(pageScale);
  const [kind, setKind] = useState<"porte" | "fenetre">("porte");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [sill, setSill] = useState("");
  const [targetId, setTargetId] = useState("");
  const [withSill, setWithSill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widthRef = useRef<HTMLInputElement>(null);

  const openingEl = elements.find((e) => e.mode === "ouv");
  const walls = elements.filter((e) => e.mode === "ligne");
  const sillEl = elements.find((e) => e.id === "appuis" && e.mode === "ligne");
  const hasDraft = draftPts !== null && scale !== null;
  const measured = hasDraft ? distance(draftPts[0], draftPts[1]) * scale : 0;

  useEffect(() => {
    if (!hasDraft) return;
    setWidth(String(Number(measured.toFixed(2))).replace(".", ","));
    setError(null);
    widthRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPts]);

  useEffect(() => {
    const d = OPENING_DEFAULTS[kind];
    setHeight(String(d.height).replace(".", ","));
    setSill(String(d.sill).replace(".", ","));
    if (kind === "porte") setWithSill(false);
  }, [kind]);

  useEffect(() => {
    if (!targetId || !walls.some((w) => w.id === targetId)) {
      setTargetId(openingEl?.targetId ?? walls[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  if (tool !== "opening") return null;
  if (!hasDraft) {
    return (
      <section className="probe-panel" aria-label="Ouverture">
        <p>
          Ouverture : glissez sur le plan, le long du mur, la largeur de la porte ou de la fenêtre.
          Vous préciserez ensuite ses dimensions exactes.
        </p>
        <button
          type="button"
          className="close"
          aria-label="Fermer"
          onClick={() => setTool("select")}
        >
          ×
        </button>
      </section>
    );
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    const w = parseMeters(width);
    const h = parseMeters(height);
    const s = kind === "fenetre" ? parseMeters(sill) : 0;
    if (!openingEl) return setError("Aucun élément de type ouverture dans le catalogue.");
    if (!targetId) return setError("Choisissez le mur dont l'ouverture est déduite.");
    if (w === null || w <= 0) return setError("Largeur invalide (ex. 0,90).");
    if (h === null || h <= 0) return setError("Hauteur invalide (ex. 2,10).");
    if (s === null || s < 0) return setError("Allège invalide (ex. 0,90).");
    const st = useApp.getState();
    const ms = buildOpening({
      element: openingEl,
      targetId,
      kind,
      p1: draftPts![0],
      p2: draftPts![1],
      width: w,
      height: h,
      sill: s,
      level: st.project.level,
      page: st.page,
      scale: scale!,
      ...(withSill && sillEl ? { sillElement: sillEl } : {}),
      newId,
    });
    addMeasurements(ms);
    useApp.setState({ openingDraft: null });
    notify(
      "success",
      ms.length > 1
        ? "Fenêtre et appui ajoutés."
        : kind === "porte"
          ? "Porte ajoutée."
          : "Fenêtre ajoutée.",
    );
  }

  return (
    <section className="probe-panel opening-panel" aria-label="Paramètres de l'ouverture">
      <form onSubmit={submit}>
        <fieldset>
          <legend>Type d'ouverture</legend>
          <label className="check">
            <input
              type="radio"
              name="op-kind"
              checked={kind === "porte"}
              onChange={() => setKind("porte")}
            />
            Porte (sans allège)
          </label>
          <label className="check">
            <input
              type="radio"
              name="op-kind"
              checked={kind === "fenetre"}
              onChange={() => setKind("fenetre")}
            />
            Fenêtre (allège + appui)
          </label>
        </fieldset>
        <div className="row">
          <label htmlFor="op-w">Largeur (m)</label>
          <input
            id="op-w"
            ref={widthRef}
            inputMode="decimal"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
          <label htmlFor="op-h">Hauteur (m)</label>
          <input
            id="op-h"
            inputMode="decimal"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
          {kind === "fenetre" && (
            <>
              <label htmlFor="op-s">Allège (m)</label>
              <input
                id="op-s"
                inputMode="decimal"
                value={sill}
                onChange={(e) => setSill(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="row">
          <label htmlFor="op-t">Déduire du mur</label>
          <select id="op-t" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {walls.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {kind === "fenetre" && sillEl && (
          <label className="check">
            <input
              type="checkbox"
              checked={withSill}
              onChange={(e) => setWithSill(e.target.checked)}
            />
            Ajouter aussi un appui de fenêtre (« {sillEl.name} »)
          </label>
        )}
        <p className="muted small">
          Largeur mesurée sur le plan : {formatNumber(measured, 2)} m ; la valeur saisie fait foi.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary">
            Ajouter l'ouverture
          </button>
          <button type="button" onClick={() => useApp.setState({ openingDraft: null })}>
            Annuler
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- Boîte de dialogue modale générique ----------

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onClose={onClose}>
      <header>
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="close" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

// ---------- Aide ----------

const SHORTCUTS: [string, string][] = [
  ["V", "Outil Sélection (déplacer un sommet, supprimer, éditer)"],
  ["T", "Outil Tracer avec l'élément actif"],
  ["E", "Étalonner l'échelle de la page"],
  ["K", "Vérifier une cote"],
  ["O", "Outil Ouverture : glisser la largeur, puis préciser porte ou fenêtre"],
  ["A", "Outil Annotation (texte, flèche, nuage) — hors quantités"],
  ["Maj", "Verrouiller l'angle à 45°/90° (l'emporte sur l'accrochage)"],
  ["Entrée / double-clic", "Terminer le tracé"],
  ["Échap", "Annuler le tracé en cours, puis la sélection"],
  ["Ctrl+Z", "Annuler (dernier point, sinon dernière action)"],
  ["Ctrl+Maj+Z ou Ctrl+Y", "Rétablir"],
  ["Maj (en traçant)", "Verrouiller l'angle à 45°/90°"],
  ["Suppr", "Supprimer le tracé sélectionné"],
  ["Molette", "Zoom centré sur la souris"],
  ["Espace + glisser, bouton du milieu", "Déplacer le plan"],
  ["+ / − / 0", "Zoom avant, arrière, ajuster à la fenêtre"],
  ["Page préc. / Page suiv.", "Changer de page"],
  ["Flèches (plan actif)", "Déplacer le réticule clavier (Maj : pas ×5)"],
  ["Espace (plan actif)", "Poser un point au réticule"],
  ["?", "Afficher cette aide"],
];

export function HelpDialog() {
  const open = useApp((s) => s.helpOpen);
  return (
    <Modal
      open={open}
      title="Raccourcis clavier"
      onClose={() => useApp.setState({ helpOpen: false })}
    >
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <th scope="row">
                <kbd>{k}</kbd>
              </th>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Les plans et le projet restent dans ce navigateur (IndexedDB). Aucune donnée n'est envoyée
        sur un serveur.
      </p>
    </Modal>
  );
}

// ---------- Repli d'export (copie / zone de texte) ----------

export interface FallbackContent {
  title: string;
  text: string;
}

export function ExportFallback({
  content,
  onClose,
}: {
  content: FallbackContent | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [content]);
  return (
    <Modal open={content !== null} title={content?.title ?? ""} onClose={onClose}>
      <p>Si le téléchargement n'a pas démarré, copiez le contenu ci-dessous.</p>
      <textarea readOnly value={content?.text ?? ""} rows={14} aria-label="Contenu exporté" />
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(content?.text ?? "")
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          Copier dans le presse-papiers
        </button>
        {copied && <span role="status">Copié.</span>}
      </div>
    </Modal>
  );
}

/** Outil Annotation : texte, flèche (2 clics) ou nuage (comme une surface). Hors quantités. */
export function AnnotatePanel() {
  const tool = useApp((s) => s.tool);
  const kind = useApp((s) => s.annotateKind);
  const textAt = useApp((s) => s.textDraft);
  const draft = useApp((s) => s.draft.length);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (textAt) {
      setText("");
      input.current?.focus();
    }
  }, [textAt]);
  if (tool !== "annotate") return null;
  return (
    <section className="probe-panel" aria-label="Annotation">
      <div className="row" role="group" aria-label="Type d'annotation">
        {(
          [
            ["text", "Texte"],
            ["arrow", "Flèche"],
            ["cloud", "Nuage"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={kind === id}
            onClick={() => useApp.setState({ annotateKind: id, draft: [], textDraft: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {textAt ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const value = text.trim();
            if (!value) return;
            const s = useApp.getState();
            addAnnotation({
              id: newId(),
              kind: "text",
              page: s.page,
              at: textAt,
              text: value,
            });
            useApp.setState({ textDraft: null });
          }}
        >
          <label htmlFor="ann-text">Texte</label>
          <input
            id="ann-text"
            ref={input}
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="primary">
            Poser
          </button>
          <button type="button" onClick={() => useApp.setState({ textDraft: null })}>
            Annuler
          </button>
        </form>
      ) : (
        <p className="muted small">
          {kind === "text" &&
            "Cliquez l'endroit du texte. Il ne sera pas compté dans les quantités."}
          {kind === "arrow" && `Cliquez l'origine, puis la pointe (${draft}/2). Hors quantités.`}
          {kind === "cloud" &&
            `Cliquez le contour du nuage, puis Entrée ou double-clic (${draft} point(s)). Hors quantités.`}
        </p>
      )}
      <button type="button" className="close" aria-label="Fermer" onClick={() => setTool("select")}>
        ×
      </button>
    </section>
  );
}
