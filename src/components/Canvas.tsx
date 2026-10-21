import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { hitAnnotation } from "../lib/annotations";
import { isCalibrated } from "../lib/calibration";
import { lockAngle, nearestVertex, snapToPoints } from "../lib/geometry";
import { computeMeasurement } from "../lib/quantities";
import { detectScale, ratioToScale } from "../lib/scaleText";
import { formatQty } from "../lib/format";
import type { Measurement, Pt } from "../lib/types";
import {
  activeElement,
  addAnnotation,
  addDraftPoint,
  finishCloud,
  finishDraft,
  fitView,
  moveVertex,
  newId,
  notify,
  pageScale,
  panBy,
  setPageScale,
  useApp,
  zoomAt,
  type View,
} from "../state/store";
import {
  drawAnnotations,
  drawDraft,
  drawLabel,
  drawOpeningDraft,
  drawPageLabel,
  drawProbe,
  drawReticle,
  drawShape,
  drawSnapMark,
  hitTest,
  liveLabel,
  measurementLabelAnchor,
} from "./draw";
import { ScaleBar } from "./ScaleBar";
import { AnnotatePanel, OpeningPanel, ProbePanel } from "./Dialogs";
import { openDemoPlan } from "../state/session";

const RENDER_DELAY = 200;

function visibleOnPage(s: ReturnType<typeof useApp.getState>): Measurement[] {
  const hidden = new Set(s.project.settings.hiddenElementIds);
  return s.project.measurements.filter((m) => {
    if (m.page !== s.page || hidden.has(m.elementId)) return false;
    return s.planLevel === "all" || m.level === s.project.level;
  });
}

type Drag =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "vertex"; id: string; index: number; started: boolean }
  | { kind: "opening"; p1: Pt }
  | { kind: "press"; sx: number; sy: number };

export default function PlanCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef<Pt | null>(null);
  const snapped = useRef<Pt | null>(null);
  const screenMouse = useRef<Pt | null>(null);
  const reticle = useRef<Pt | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const spaceHeld = useRef(false);
  const spacePanned = useRef(false);
  const rendered = useRef<View | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const frame = useRef(0);
  const renderTimer = useRef<ReturnType<typeof setTimeout>>();

  const doc = useApp((s) => s.doc);
  const page = useApp((s) => s.page);
  const pageSize = useApp((s) => s.pageSize);
  const tool = useApp((s) => s.tool);
  const calibrated = useApp((s) => pageScale(s) !== null);

  // ---------- rendu ----------

  function dpr(): number {
    return window.devicePixelRatio || 1;
  }

  function drawOverlay(): void {
    frame.current = 0;
    const ov = ovRef.current;
    if (!ov) return;
    const ctx = ov.getContext("2d");
    if (!ctx) return;
    const r = dpr();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);
    const s = useApp.getState();
    if (!s.doc) return;
    const { zoom, x, y } = s.view;
    const px = 1 / zoom;
    const scale = pageScale(s);
    ctx.setTransform(r * zoom, 0, 0, r * zoom, r * x, r * y);

    for (const m of visibleOnPage(s)) {
      const el = s.project.elements.find((e) => e.id === m.elementId);
      if (!el) continue;
      drawShape(ctx, el, m.pts, {
        px,
        scale: m.meta.scale,
        hover: s.hoverId === m.id,
        selected: s.selectedId === m.id,
      });
      if (s.project.settings.showLabels && scale !== null) {
        const anchor = measurementLabelAnchor(m.pts);
        if (anchor) {
          const q = computeMeasurement(m, s.project.elements, {
            levelHeights: s.project.levelHeights,
          });
          drawPageLabel(ctx, formatQty(q.quantity, q.unit), anchor, px, el.color);
        }
      }
    }
    drawAnnotations(ctx, s.project.annotations, s.page, px, s.selectedId);

    const el = activeElement(s);
    let label: string | null = null;
    if (s.tool === "draw" && el && s.draft.length > 0) {
      drawDraft(ctx, el, s.draft, mouse.current, px);
      label = liveLabel(el, mouse.current ? [...s.draft, mouse.current] : s.draft, scale);
    }
    if ((s.tool === "calibrate" || s.tool === "verify") && s.probe.length > 0) {
      drawProbe(ctx, s.probe, s.probe.length < 2 ? mouse.current : null, px);
    }
    if (s.openingDraft) drawOpeningDraft(ctx, s.openingDraft, px, scale);
    if (snapped.current) drawSnapMark(ctx, snapped.current, px);
    if (reticle.current) drawReticle(ctx, reticle.current, px);

    const sm = screenMouse.current;
    if (label && sm) {
      ctx.setTransform(r, 0, 0, r, 0, 0);
      drawLabel(ctx, label, sm[0], sm[1]);
    }
  }

  function requestDraw(): void {
    if (!frame.current) frame.current = requestAnimationFrame(drawOverlay);
  }

  function syncBackground(): void {
    const bg = bgRef.current;
    const r = rendered.current;
    if (!bg) return;
    const v = useApp.getState().view;
    if (!r) {
      bg.style.transform = "";
      return;
    }
    const k = v.zoom / r.zoom;
    bg.style.transform = `translate(${v.x - r.x * k}px, ${v.y - r.y * k}px) scale(${k})`;
  }

  async function renderBackground(): Promise<void> {
    const bg = bgRef.current;
    const s = useApp.getState();
    if (!bg || !s.doc || size.current.w === 0) return;
    const v = { ...s.view };
    try {
      const ok = await s.doc.render(s.page, bg, {
        ...v,
        width: size.current.w,
        height: size.current.h,
        dpr: dpr(),
      });
      if (ok) {
        rendered.current = v;
        syncBackground();
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erreur de rendu.");
    }
  }

  function scheduleRender(delay = RENDER_DELAY): void {
    clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => void renderBackground(), delay);
  }

  // Abonnement : redessin des tracés à chaque changement, rendu net après une pause du zoom.
  useEffect(() => {
    const unsub = useApp.subscribe((s, prev) => {
      requestDraw();
      if (s.view !== prev.view) {
        syncBackground();
        scheduleRender();
      }
    });
    return () => {
      unsub();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      clearTimeout(renderTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Taille de la zone d'affichage.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const first = size.current.w === 0;
      size.current = { w: rect.width, h: rect.height };
      const ov = ovRef.current;
      if (ov) {
        ov.width = Math.round(rect.width * dpr());
        ov.height = Math.round(rect.height * dpr());
      }
      if (first) fitView(rect.width, rect.height);
      requestDraw();
      scheduleRender(first ? 0 : RENDER_DELAY);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nouvelle page ou nouveau plan : on recadre et on rend immédiatement.
  useEffect(() => {
    rendered.current = null;
    const bg = bgRef.current;
    if (bg) {
      bg.style.transform = "";
      bg.getContext("2d")?.clearRect(0, 0, bg.width, bg.height);
    }
    reticle.current = null;
    fitView(size.current.w, size.current.h);
    scheduleRender(0);
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, pageSize]);

  // Coins vectoriels et échelle lue dans le texte de la page (jamais appliquée seule).
  useEffect(() => {
    if (!doc) {
      useApp.setState({ snapPoints: [], scaleOffer: null });
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const [corners, text] = await Promise.all([doc.vectorCorners(page), doc.pageText(page)]);
        if (cancel) return;
        const s = useApp.getState();
        const offer =
          isCalibrated(s.project.scales, page) || s.dismissedScale.includes(page)
            ? null
            : detectScale(text);
        useApp.setState({ snapPoints: corners, scaleOffer: offer });
      } catch {
        if (!cancel) useApp.setState({ snapPoints: [], scaleOffer: null });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [doc, page]);

  // ---------- interactions ----------

  function toPage(sx: number, sy: number): Pt {
    const v = useApp.getState().view;
    return [(sx - v.x) / v.zoom, (sy - v.y) / v.zoom];
  }

  function localXY(e: { clientX: number; clientY: number }): Pt {
    const rect = wrapRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  /**
   * Maj verrouille l'angle à 45°/90° et l'emporte sur l'accrochage.
   * Sinon, le point colle au coin vectoriel (ou à un sommet déjà tracé) le plus proche.
   */
  function aimed(p: Pt, shift: boolean): Pt {
    const s = useApp.getState();
    const anchor =
      s.tool === "draw" || (s.tool === "annotate" && s.annotateKind !== "text")
        ? s.draft[s.draft.length - 1]
        : s.tool === "opening" && s.openingDraft
          ? s.openingDraft[0]
          : s.probe.length === 1
            ? s.probe[0]
            : undefined;
    if (shift && anchor) {
      snapped.current = null;
      return lockAngle(anchor, p, 45);
    }
    if (s.prefs.snap && (s.tool === "draw" || s.tool === "opening" || s.tool === "annotate")) {
      const own: Pt[] = [];
      for (const m of s.project.measurements) if (m.page === s.page) own.push(...m.pts);
      const hit = snapToPoints(p, s.snapPoints.concat(own), 10 / s.view.zoom);
      snapped.current = hit;
      if (hit) return hit;
    } else snapped.current = null;
    return p;
  }

  function clickAt(p: Pt, count: number): void {
    const s = useApp.getState();
    if (s.tool === "draw") {
      const el = activeElement(s);
      if (!el) return;
      if (count >= 2) {
        if (el.mode !== "point") finishDraft();
        return;
      }
      addDraftPoint(p);
    } else if (s.tool === "annotate") {
      if (s.annotateKind === "text") {
        useApp.setState({ textDraft: p, draft: [] });
        return;
      }
      if (s.annotateKind === "arrow") {
        if (s.draft.length === 0) useApp.setState({ draft: [p] });
        else {
          addAnnotation({ id: newId(), kind: "arrow", page: s.page, from: s.draft[0]!, to: p });
          useApp.setState({ draft: [] });
        }
        return;
      }
      if (count >= 2) finishCloud();
      else useApp.setState({ draft: [...s.draft, p] });
    } else if (s.tool === "calibrate" || s.tool === "verify") {
      if (s.probe.length >= 2) useApp.setState({ probe: [p] });
      else useApp.setState({ probe: [...s.probe, p] });
    } else {
      const ann = hitAnnotation(s.project.annotations, s.page, p, 8 / s.view.zoom);
      if (ann) {
        useApp.setState({ selectedId: ann.id });
        return;
      }
      const hit = hitTest(visibleOnPage(s), s.project.elements, p, {
        px: 1 / s.view.zoom,
        scale: pageScale(s),
      });
      useApp.setState({ selectedId: hit?.id ?? null });
    }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>): void {
    const [sx, sy] = localXY(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché : la capture est facultative
    }
    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      e.preventDefault();
      drag.current = { kind: "pan", lastX: sx, lastY: sy };
      spacePanned.current = true;
      return;
    }
    if (e.button !== 0) return;
    const s = useApp.getState();
    if (s.tool === "opening") {
      if (pageScale(s) === null) {
        notify("error", "Page non étalonnée : étalonnez l'échelle avant de tracer une ouverture.");
        return;
      }
      const p = aimed(toPage(sx, sy), e.shiftKey);
      drag.current = { kind: "opening", p1: p };
      useApp.setState({ openingDraft: [p, p] });
      return;
    }
    if (s.tool === "select" && s.selectedId) {
      const m = s.project.measurements.find((x) => x.id === s.selectedId);
      if (m) {
        const idx = nearestVertex(m.pts, toPage(sx, sy), 8 / s.view.zoom);
        if (idx >= 0) {
          drag.current = { kind: "vertex", id: m.id, index: idx, started: false };
          return;
        }
      }
    }
    drag.current = { kind: "press", sx, sy };
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>): void {
    const [sx, sy] = localXY(e);
    const p = aimed(toPage(sx, sy), e.shiftKey);
    mouse.current = p;
    screenMouse.current = [sx, sy];
    reticle.current = null;
    const d = drag.current;
    if (d?.kind === "pan") {
      panBy(sx - d.lastX, sy - d.lastY);
      d.lastX = sx;
      d.lastY = sy;
      return;
    }
    if (d?.kind === "opening") {
      useApp.setState({ openingDraft: [d.p1, p] });
      suppressClick.current = true;
      return;
    }
    if (d?.kind === "vertex") {
      moveVertex(d.id, d.index, p, !d.started);
      d.started = true;
      return;
    }
    if (d?.kind === "press" && Math.hypot(sx - d.sx, sy - d.sy) > 4) {
      // Glisser sur le plan avec l'outil Sélection : déplacement de la vue.
      if (useApp.getState().tool === "select") {
        drag.current = { kind: "pan", lastX: sx, lastY: sy };
        panBy(sx - d.sx, sy - d.sy);
      }
      suppressClick.current = true;
      return;
    }
    const s = useApp.getState();
    if (s.tool === "select" && !d) {
      const hit = hitTest(visibleOnPage(s), s.project.elements, p, {
        px: 1 / s.view.zoom,
        scale: pageScale(s),
      });
      if ((hit?.id ?? null) !== s.hoverId) useApp.setState({ hoverId: hit?.id ?? null });
    }
    requestDraw();
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>): void {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (d?.kind === "pan" || d?.kind === "vertex") suppressClick.current = true;
    if (d?.kind === "opening") {
      suppressClick.current = true;
      const od = useApp.getState().openingDraft;
      const zoom = useApp.getState().view.zoom;
      if (od && Math.hypot(od[1][0] - od[0][0], od[1][1] - od[0][1]) * zoom < 6) {
        useApp.setState({ openingDraft: null });
      }
    }
  }

  function onClick(e: MouseEvent<HTMLCanvasElement>): void {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const [sx, sy] = localXY(e);
    clickAt(aimed(toPage(sx, sy), e.shiftKey), e.detail);
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const [sx, sy] = localXY(e);
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    zoomAt(factor, sx, sy);
  }

  // `wheel` doit être non passif pour bloquer le défilement de la page.
  useEffect(() => {
    const ov = ovRef.current;
    if (!ov) return;
    ov.addEventListener("wheel", onWheel, { passive: false });
    return () => ov.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const s = useApp.getState();
    const step = (e.shiftKey ? 50 : 10) / s.view.zoom;
    const arrows: Record<string, Pt> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = arrows[e.key];
    if (delta) {
      e.preventDefault();
      e.stopPropagation();
      const base = reticle.current ?? toPage(size.current.w / 2, size.current.h / 2);
      reticle.current = [base[0] + delta[0], base[1] + delta[1]];
      mouse.current = reticle.current;
      const v = s.view;
      screenMouse.current = [reticle.current[0] * v.zoom + v.x, reticle.current[1] * v.zoom + v.y];
      requestDraw();
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (!spaceHeld.current) {
        spaceHeld.current = true;
        spacePanned.current = false;
      }
    }
  }

  function onKeyUp(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== " ") return;
    e.stopPropagation();
    spaceHeld.current = false;
    if (!spacePanned.current && reticle.current) clickAt(reticle.current, 1);
  }

  const blocked = (tool === "draw" || tool === "opening") && doc !== null && !calibrated;
  const cursor = tool === "select" ? "default" : blocked ? "not-allowed" : "crosshair";

  return (
    <div
      ref={wrapRef}
      className="plan"
      tabIndex={0}
      role="application"
      aria-label="Plan. Flèches : déplacer le réticule ; Espace : poser un point ; Entrée : terminer ; Échap : annuler."
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        spaceHeld.current = false;
      }}
    >
      <canvas ref={bgRef} className="plan-bg" aria-hidden="true" />
      <canvas
        ref={ovRef}
        className="plan-overlay"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          mouse.current = null;
          screenMouse.current = null;
          requestDraw();
        }}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden="true"
      />
      {!doc && (
        <div className="plan-empty">
          <p>Ouvrez un plan PDF ou une image pour commencer.</p>
          <p className="muted">
            Le fichier reste dans votre navigateur : rien n'est envoyé sur un serveur.
          </p>
          <p>
            <button type="button" onClick={() => void openDemoPlan()}>
              Ouvrir le plan d'exemple
            </button>
          </p>
        </div>
      )}
      {blocked && (
        <div className="plan-blocked" role="alert">
          <strong>Page non étalonnée.</strong> Aucune mesure n'est possible avant l'étalonnage de
          l'échelle de cette page.
          <button
            type="button"
            onClick={() => useApp.setState({ tool: "calibrate", probe: [], draft: [] })}
          >
            Étalonner maintenant
          </button>
        </div>
      )}
      {doc && <ProbePanel />}
      {doc && <OpeningPanel />}
      {doc && <AnnotatePanel />}
      {doc && <ScaleOffer />}
      {doc && <ScaleBar />}
    </div>
  );
}

/** Proposition d'échelle lue dans le texte. Rien n'est appliqué sans ce bouton. */
function ScaleOffer() {
  const offer = useApp((s) => s.scaleOffer);
  const page = useApp((s) => s.page);
  const calibrated = useApp((s) => isCalibrated(s.project.scales, s.page));
  if (offer === null || calibrated) return null;
  const scale = ratioToScale(offer);
  return (
    <section className="probe-panel" aria-label="Échelle lue sur la page">
      <p>
        Texte « 1/{offer} » lu sur cette page. En supposant qu'une unité de page vaut un point (1/72
        pouce), 1 unité = {(scale * 1000).toFixed(2).replace(".", ",")} mm.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setPageScale(page, scale, false);
            useApp.setState({ scaleOffer: null });
            notify("success", `Échelle 1/${offer} appliquée à la page ${page}.`);
          }}
        >
          Appliquer 1/{offer}
        </button>
        <button
          type="button"
          onClick={() => {
            const dismissed = useApp.getState().dismissedScale;
            useApp.setState({
              scaleOffer: null,
              dismissedScale: dismissed.includes(page) ? dismissed : [...dismissed, page],
            });
          }}
        >
          Ignorer
        </button>
      </div>
      <p className="muted small">
        Cette hypothèse est fausse si le PDF n'est pas à l'échelle du papier.
      </p>
    </section>
  );
}
