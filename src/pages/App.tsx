import { useEffect, useState } from "react";
import PlanCanvas from "../components/Canvas";
import { ExportFallback, HelpDialog, type FallbackContent } from "../components/Dialogs";
import Sidebar from "../components/Sidebar";
import SummaryTable from "../components/SummaryTable";
import Toolbar from "../components/Toolbar";
import { fitToScreen, zoomCenter } from "../ui/view";
import { DISCLAIMER } from "../lib/export/report";
import { goToPage, restoreSession, startAutosave } from "../state/session";
import {
  cancelCurrent,
  deleteMeasurement,
  finishDraft,
  redoAction,
  setTool,
  undoAction,
  useApp,
} from "../state/store";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function useShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const s = useApp.getState();
      if (s.helpOpen || document.querySelector("dialog[open]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redoAction();
        else undoAction();
        return;
      }
      if (mod && key === "y") {
        if (isTyping(e.target)) return;
        e.preventDefault();
        redoAction();
        return;
      }
      if (e.key === "Escape") {
        if (isTyping(e.target)) (e.target as HTMLElement).blur();
        cancelCurrent();
        return;
      }
      if (isTyping(e.target) || mod || e.altKey) return;
      if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) return;

      const plan = s.plan;
      switch (e.key) {
        case "Enter":
          if (s.tool === "draw" && s.draft.length > 0) {
            e.preventDefault();
            finishDraft();
          }
          return;
        case "Delete":
        case "Backspace":
          if (s.selectedId) {
            e.preventDefault();
            deleteMeasurement(s.selectedId);
          }
          return;
        case "?":
          e.preventDefault();
          useApp.setState({ helpOpen: true });
          return;
        case "+":
        case "=":
          if (plan) zoomCenter(1.25);
          return;
        case "-":
          if (plan) zoomCenter(1 / 1.25);
          return;
        case "0":
          if (plan) fitToScreen();
          return;
        case "PageUp":
          e.preventDefault();
          void goToPage(s.page - 1);
          return;
        case "PageDown":
          e.preventDefault();
          void goToPage(s.page + 1);
          return;
      }
      if (!plan) return;
      if (key === "v") setTool("select");
      else if (key === "t") setTool("draw");
      else if (key === "e") setTool("calibrate");
      else if (key === "k") setTool("verify");
      else if (key === "o") setTool("opening");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function useTheme(): void {
  const theme = useApp((s) => s.prefs.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}

function NoticeBar() {
  const notice = useApp((s) => s.notice);
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const t = setTimeout(() => useApp.setState({ notice: null }), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <div className="notice-region" aria-live={notice?.kind === "error" ? "assertive" : "polite"}>
      {notice && (
        <div
          className={`notice notice-${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className="close"
            aria-label="Fermer le message"
            onClick={() => useApp.setState({ notice: null })}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [fallback, setFallback] = useState<FallbackContent | null>(null);
  useShortcuts();
  useTheme();

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void restoreSession().then(() => {
      if (!cancelled) stop = startAutosave();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#plan-zone">
        Aller au plan
      </a>
      <Toolbar onFallback={setFallback} />
      <div className="workspace">
        <Sidebar />
        <main id="plan-zone" className="plan-zone" aria-label="Plan">
          <PlanCanvas />
        </main>
      </div>
      <SummaryTable />
      <footer className="footer">
        <strong>{DISCLAIMER}</strong> Les plans restent dans votre navigateur : aucun envoi.
      </footer>
      <NoticeBar />
      <HelpDialog />
      <ExportFallback content={fallback} onClose={() => setFallback(null)} />
    </div>
  );
}
