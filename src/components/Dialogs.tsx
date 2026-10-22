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
import {
  addAnnotation,
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

/** Rappel : la taille se règle une fois sur l'élément, chaque clic pose un point. */
export function OpeningPanel() {
  const tool = useApp((s) => s.tool);
  const elements = useApp((s) => s.project.elements);
  const activeId = useApp((s) => s.activeElementId);
  if (tool !== "opening") return null;
  const el =
    elements.find((e) => e.id === activeId && e.mode === "ouv") ??
    elements.find((e) => e.mode === "ouv");
  return (
    <section className="probe-panel" aria-label="Ouverture">
      <p>
        Chaque clic pose une ouverture
        {el ? ` « ${el.name} » (${formatNumber(el.a, 2)} × ${formatNumber(el.h, 2)} m)` : ""}. La
        taille se règle sur l'élément ; dupliquez-le pour une autre dimension.
      </p>
      <button type="button" className="close" aria-label="Fermer" onClick={() => setTool("select")}>
        ×
      </button>
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
  ["O", "Outil Ouverture : un clic pose une ouverture de la taille de l'élément"],
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
