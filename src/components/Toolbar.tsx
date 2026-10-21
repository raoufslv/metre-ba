import { useRef, useState, type FormEvent } from "react";
import { summaryToCsv } from "../lib/export/csv";
import { projectToJson } from "../lib/export/json";
import { summarize } from "../lib/quantities";
import {
  getPlanBytes,
  goToPage,
  importProjectText,
  openPlanFile,
  resetProject,
  updatePrefs,
} from "../state/session";
import {
  addLevel,
  applyTemplate,
  finishDraft,
  notify,
  redoAction,
  setLevel,
  setLevelHeight,
  setShowLabels,
  setTool,
  undoAction,
  useApp,
  type Tool,
} from "../state/store";
import { downloadBlob, openBlob, slug } from "../ui/download";
import { fitToScreen, zoomCenter } from "../ui/view";
import { DEFAULT_LEVEL_HEIGHT } from "../lib/types";
import { loadLibrary, saveLibrary } from "../lib/store";
import { parseCatalog, serializeCatalog } from "../lib/templates";
import type { FallbackContent } from "./Dialogs";

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Sélection", key: "V" },
  { id: "draw", label: "Tracer", key: "T" },
  { id: "opening", label: "Ouverture", key: "O" },
  { id: "annotate", label: "Annotation", key: "A" },
  { id: "calibrate", label: "Étalonner", key: "E" },
  { id: "verify", label: "Vérifier une cote", key: "K" },
];

const THEMES = { auto: "Thème : auto", light: "Thème : clair", dark: "Thème : sombre" } as const;

export default function Toolbar({ onFallback }: { onFallback: (c: FallbackContent) => void }) {
  const plan = useApp((s) => s.plan);
  const page = useApp((s) => s.page);
  const zoom = useApp((s) => s.view.zoom);
  const tool = useApp((s) => s.tool);
  const levels = useApp((s) => s.project.levels);
  const level = useApp((s) => s.project.level);
  const draftLen = useApp((s) => s.draft.length);
  const prefs = useApp((s) => s.prefs);
  const levelHeight = useApp((s) => s.project.levelHeights[s.project.level]);
  const planLevel = useApp((s) => s.planLevel);
  const showLabels = useApp((s) => s.project.settings.showLabels);
  const hasMeasurements = useApp((s) => s.project.measurements.length > 0);

  const planInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newLevel, setNewLevel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tplInput = useRef<HTMLInputElement>(null);
  const [hText, setHText] = useState<string | null>(null);

  function commitHeight(text: string): void {
    const t = text.trim().replace(",", ".");
    if (t === "") setLevelHeight(level, null);
    else {
      const n = Number(t);
      if (!Number.isFinite(n) || n <= 0 || n > 20) {
        notify("error", "Hauteur sous plafond invalide (nombre entre 0 et 20 m).");
        return;
      }
      setLevelHeight(level, n);
    }
    setHText(null);
  }

  async function onTemplateChosen(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const r = parseCatalog(await file.text());
      if (!r.ok) return notify("error", `Catalogue refusé : ${r.error}`);
      applyTemplate(r.value);
    } catch {
      notify("error", "Lecture du fichier impossible.");
    }
  }

  function exportTemplate(): void {
    const text = serializeCatalog(useApp.getState().project.elements);
    const blob = new Blob([text], { type: "application/json" });
    if (!downloadBlob(blob, `${name()}-catalogue.json`)) onFallback({ title: "Catalogue", text });
  }

  function saveAsLibrary(): void {
    const ok = saveLibrary(globalThis.localStorage, useApp.getState().project.elements);
    notify(
      ok ? "success" : "error",
      ok
        ? "Catalogue enregistré : il servira de base aux nouveaux projets."
        : "Enregistrement impossible (stockage indisponible).",
    );
  }

  function resetLibrary(): void {
    saveLibrary(globalThis.localStorage, null);
    notify("success", "Bibliothèque réinitialisée : catalogue d'usine pour les nouveaux projets.");
  }

  function onPlanChosen(file: File | undefined): void {
    if (!file) return;
    if (hasMeasurements) setPendingFile(file);
    else void openPlanFile(file, false);
  }

  async function onJsonChosen(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      importProjectText(await file.text());
    } catch {
      notify("error", "Lecture du fichier impossible.");
    }
  }

  function onAddLevel(e: FormEvent): void {
    e.preventDefault();
    if (newLevel !== null && addLevel(newLevel)) setNewLevel(null);
  }

  const name = () => slug(useApp.getState().project.name);

  function exportText(kind: "csv" | "json", show: boolean): void {
    const project = useApp.getState().project;
    const text =
      kind === "csv"
        ? summaryToCsv(summarize(project), { comma: useApp.getState().prefs.csvComma })
        : projectToJson(project);
    const title = kind === "csv" ? "Récapitulatif CSV" : "Projet JSON";
    if (show) return onFallback({ title, text });
    const blob =
      kind === "csv"
        ? new Blob(["\ufeff", text], { type: "text/csv;charset=utf-8" })
        : new Blob([text], { type: "application/json" });
    const ok = downloadBlob(
      blob,
      `${name()}-${kind === "csv" ? "recapitulatif.csv" : "projet.json"}`,
    );
    if (!ok) onFallback({ title, text });
  }

  async function exportBinary(kind: "xlsx" | "pdf"): Promise<void> {
    const project = useApp.getState().project;
    setBusy(kind === "xlsx" ? "Génération Excel…" : "Génération du PDF annoté…");
    try {
      let blob: Blob;
      let file: string;
      if (kind === "xlsx") {
        const { buildWorkbook } = await import("../lib/export/xlsx");
        blob = new Blob([await buildWorkbook(project)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        file = `${name()}-metre.xlsx`;
      } else {
        const bytes = getPlanBytes();
        const p = useApp.getState().plan;
        if (!bytes || !p) {
          notify("error", "Ouvrez un plan pour produire le PDF annoté.");
          return;
        }
        const { buildMarkedPdf } = await import("../lib/export/markedPdf");
        const out = await buildMarkedPdf(
          project,
          p.kind === "pdf"
            ? { kind: "pdf", data: bytes }
            : { kind: "image", data: bytes, mime: p.mime },
        );
        blob = new Blob([new Uint8Array(out)], { type: "application/pdf" });
        file = `${name()}-plan-annote.pdf`;
      }
      if (!downloadBlob(blob, file) && !openBlob(blob)) {
        notify(
          "error",
          "Le navigateur a bloqué le téléchargement. Autorisez les téléchargements pour ce site.",
        );
      } else {
        notify("success", `Export « ${file} » prêt.`);
      }
    } catch (e) {
      notify("error", `Export impossible : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <header className="toolbar">
      <div className="group brand">
        <strong>Métré BA</strong>
      </div>

      <div className="group" role="group" aria-label="Fichiers">
        <button type="button" onClick={() => planInput.current?.click()}>
          Ouvrir un plan
        </button>
        <input
          ref={planInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
          hidden
          onChange={(e) => {
            onPlanChosen(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => jsonInput.current?.click()}>
          Importer un projet
        </button>
        <input
          ref={jsonInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onJsonChosen(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {confirmReset ? (
          <span className="inline-confirm" role="alert">
            Effacer le projet et le plan enregistrés ?
            <button
              type="button"
              className="danger"
              onClick={() => {
                setConfirmReset(false);
                void resetProject();
              }}
            >
              Confirmer
            </button>
            <button type="button" onClick={() => setConfirmReset(false)}>
              Annuler
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)}>
            Nouveau projet
          </button>
        )}
      </div>

      {pendingFile && (
        <div className="group inline-confirm" role="alert">
          Ce projet contient des tracés.
          <button
            type="button"
            className="primary"
            onClick={() => {
              void openPlanFile(pendingFile, false);
              setPendingFile(null);
            }}
          >
            Nouveau projet avec ce plan
          </button>
          <button
            type="button"
            onClick={() => {
              void openPlanFile(pendingFile, true);
              setPendingFile(null);
            }}
          >
            Garder les tracés (plan révisé)
          </button>
          <button type="button" onClick={() => setPendingFile(null)}>
            Annuler
          </button>
        </div>
      )}

      <div className="group" role="group" aria-label="Pages et zoom">
        <button
          type="button"
          aria-label="Page précédente"
          disabled={!plan || page <= 1}
          onClick={() => void goToPage(page - 1)}
        >
          ‹
        </button>
        <span className="page-label" aria-live="polite">
          Page {plan ? page : "–"} / {plan?.pageCount ?? "–"}
        </span>
        <button
          type="button"
          aria-label="Page suivante"
          disabled={!plan || page >= plan.pageCount}
          onClick={() => void goToPage(page + 1)}
        >
          ›
        </button>
        <button
          type="button"
          aria-label="Zoom arrière"
          disabled={!plan}
          onClick={() => zoomCenter(1 / 1.25)}
        >
          −
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)} %</span>
        <button
          type="button"
          aria-label="Zoom avant"
          disabled={!plan}
          onClick={() => zoomCenter(1.25)}
        >
          +
        </button>
        <button type="button" disabled={!plan} onClick={fitToScreen}>
          Ajuster
        </button>
      </div>

      <div className="group" role="group" aria-label="Niveau">
        <label htmlFor="level-select">Niveau</label>
        <select id="level-select" value={level} onChange={(e) => setLevel(e.target.value)}>
          {levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <label htmlFor="level-h">H. plafond (m)</label>
        <input
          id="level-h"
          className="narrow"
          inputMode="decimal"
          value={hText ?? String(levelHeight ?? DEFAULT_LEVEL_HEIGHT).replace(".", ",")}
          onChange={(e) => setHText(e.target.value)}
          onBlur={() => hText !== null && commitHeight(hText)}
          onKeyDown={(e) => e.key === "Enter" && hText !== null && commitHeight(hText)}
          aria-describedby="level-h-hint"
        />
        <span id="level-h-hint" className="sr-only">
          Hauteur appliquée par défaut aux éléments à hauteur d'étage de ce niveau.
        </span>
        <label htmlFor="plan-level">Afficher</label>
        <select
          id="plan-level"
          value={planLevel}
          onChange={(e) =>
            useApp.setState({ planLevel: e.target.value === "current" ? "current" : "all" })
          }
        >
          <option value="all">Tous les niveaux</option>
          <option value="current">Niveau actif</option>
        </select>
        {newLevel === null ? (
          <button type="button" aria-label="Ajouter un niveau" onClick={() => setNewLevel("")}>
            + Niveau
          </button>
        ) : (
          <form onSubmit={onAddLevel} className="inline-form">
            <label htmlFor="new-level" className="sr-only">
              Nom du nouveau niveau
            </label>
            <input
              id="new-level"
              autoFocus
              value={newLevel}
              placeholder="ex. R+2"
              onChange={(e) => setNewLevel(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNewLevel(null)}
            />
            <button type="submit">Ajouter</button>
            <button type="button" onClick={() => setNewLevel(null)}>
              Annuler
            </button>
          </form>
        )}
      </div>

      <div className="group" role="group" aria-label="Outils">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            disabled={!plan}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          disabled={draftLen === 0}
          onClick={() => finishDraft()}
          title="Terminer (Entrée)"
        >
          Terminer
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.snap}
            onChange={(e) => updatePrefs({ snap: e.target.checked })}
          />
          Accrochage
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          Étiquettes
        </label>
        <button type="button" onClick={undoAction} title="Annuler (Ctrl+Z)">
          Annuler
        </button>
        <button type="button" onClick={redoAction} title="Rétablir (Ctrl+Maj+Z)">
          Rétablir
        </button>
      </div>

      <div className="group" role="group" aria-label="Gabarits">
        <details className="menu">
          <summary>Gabarits</summary>
          <div className="menu-body">
            <button type="button" onClick={exportTemplate}>
              Exporter le catalogue (JSON)
            </button>
            <button type="button" onClick={() => tplInput.current?.click()}>
              Charger un catalogue…
            </button>
            <input
              ref={tplInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void onTemplateChosen(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <hr />
            <button type="button" onClick={saveAsLibrary}>
              Enregistrer comme bibliothèque par défaut
            </button>
            <button
              type="button"
              onClick={resetLibrary}
              disabled={loadLibrary(globalThis.localStorage) === null}
            >
              Revenir au catalogue d'usine
            </button>
          </div>
        </details>
      </div>

      <div className="group" role="group" aria-label="Exports">
        <details className="menu">
          <summary>Exporter</summary>
          <div className="menu-body">
            <button type="button" onClick={() => exportText("csv", false)}>
              CSV (récapitulatif)
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.csvComma}
                onChange={(e) => updatePrefs({ csvComma: e.target.checked })}
              />
              Décimale virgule
            </label>
            <button type="button" onClick={() => void exportBinary("xlsx")}>
              Excel
            </button>
            <button type="button" onClick={() => void exportBinary("pdf")} disabled={!plan}>
              PDF annoté
            </button>
            <button type="button" onClick={() => exportText("json", false)}>
              JSON (projet complet)
            </button>
            <hr />
            <button type="button" onClick={() => exportText("csv", true)}>
              Afficher / copier le CSV
            </button>
            <button type="button" onClick={() => exportText("json", true)}>
              Afficher / copier le JSON
            </button>
          </div>
        </details>
        {busy && (
          <span className="muted" role="status">
            {busy}
          </span>
        )}
      </div>

      <div className="group end">
        <button
          type="button"
          onClick={() => {
            const order = ["auto", "light", "dark"] as const;
            updatePrefs({ theme: order[(order.indexOf(prefs.theme) + 1) % 3]! });
          }}
        >
          {THEMES[prefs.theme]}
        </button>
        <button type="button" onClick={() => useApp.setState({ revisionsOpen: true })}>
          Révisions
        </button>
        <button type="button" onClick={() => window.print()}>
          Imprimer
        </button>
        <button
          type="button"
          aria-label="Aide et raccourcis clavier"
          title="Aide (?)"
          onClick={() => useApp.setState({ helpOpen: true })}
        >
          ?
        </button>
      </div>
    </header>
  );
}
