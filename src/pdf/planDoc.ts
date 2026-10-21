import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Pt } from "../lib/types";
import { vectorCorners } from "../lib/vectors";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 120_000_000;
/** Pages pdf.js gardées en mémoire (LRU). */
const PAGE_CACHE = 3;

export type PlanKind = "pdf" | "image";

export interface RenderView {
  zoom: number;
  /** Décalage écran (px CSS) de l'origine de la page. */
  x: number;
  y: number;
  /** Taille de la zone visible (px CSS). */
  width: number;
  height: number;
  dpr: number;
}

export interface PlanDoc {
  kind: PlanKind;
  mime: string;
  pageCount: number;
  /** Taille de page en unités de page (points PDF ou pixels d'image), rotation incluse. */
  pageSize(n: number): Promise<{ width: number; height: number }>;
  /** Rend la zone visible ; renvoie `false` si le rendu a été annulé par un rendu plus récent. */
  render(n: number, target: HTMLCanvasElement, v: RenderView): Promise<boolean>;
  /** Coins des vecteurs, en unités de page (origine en haut à gauche). Vide pour une image. */
  vectorCorners(n: number): Promise<Pt[]>;
  /** Texte de la page, pour proposer une échelle lue. Vide pour une image. */
  pageText(n: number): Promise<string>;
  destroy(): void;
}

export class PlanError extends Error {}

export function sniffKind(data: ArrayBuffer): { kind: PlanKind; mime: string } | null {
  const b = new Uint8Array(data.slice(0, 1024));
  const head = String.fromCharCode(...b.slice(0, 8));
  if (String.fromCharCode(...b).includes("%PDF-")) return { kind: "pdf", mime: "application/pdf" };
  if (head.startsWith("\x89PNG")) return { kind: "image", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) return { kind: "image", mime: "image/jpeg" };
  return null;
}

export async function openPlan(data: ArrayBuffer): Promise<PlanDoc> {
  if (data.byteLength === 0) throw new PlanError("Le fichier est vide.");
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new PlanError(
      `Fichier trop lourd (${Math.round(data.byteLength / 1048576)} Mo) : limite ${MAX_FILE_BYTES / 1048576} Mo.`,
    );
  }
  const kind = sniffKind(data);
  if (!kind) throw new PlanError("Format non reconnu : ouvrez un PDF, un PNG ou un JPEG.");
  return kind.kind === "pdf" ? openPdf(data) : openImage(data, kind.mime);
}

function pdfErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "PasswordException") return "PDF protégé par mot de passe : non pris en charge.";
  if (name === "InvalidPDFException") return "Fichier PDF invalide ou endommagé.";
  if (name === "MissingPDFException") return "Fichier PDF introuvable.";
  return "Impossible d'ouvrir ce PDF (fichier endommagé ou non pris en charge).";
}

function isCancel(e: unknown): boolean {
  return e instanceof Error && e.name === "RenderingCancelledException";
}

function prepare(target: HTMLCanvasElement, v: RenderView): CanvasRenderingContext2D {
  const w = Math.max(1, Math.round(v.width * v.dpr));
  const h = Math.max(1, Math.round(v.height * v.dpr));
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  // Taille CSS figée : un redimensionnement de la zone ne doit pas étirer l'image.
  target.style.width = `${v.width}px`;
  target.style.height = `${v.height}px`;
  const ctx = target.getContext("2d", { alpha: false });
  if (!ctx) throw new PlanError("Canvas indisponible dans ce navigateur.");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  return ctx;
}

async function openPdf(data: ArrayBuffer): Promise<PlanDoc> {
  let doc: PDFDocumentProxy;
  try {
    // pdf.js transfère le tampon au worker : on lui passe une copie.
    doc = await pdfjs.getDocument({
      data: new Uint8Array(data.slice(0)),
      isEvalSupported: false,
      disableAutoFetch: true,
    }).promise;
  } catch (e) {
    throw new PlanError(pdfErrorMessage(e));
  }
  const cache = new Map<number, PDFPageProxy>();
  let task: RenderTask | null = null;

  async function getPage(n: number): Promise<PDFPageProxy> {
    const hit = cache.get(n);
    if (hit) {
      cache.delete(n);
      cache.set(n, hit);
      return hit;
    }
    const page = await doc.getPage(n);
    cache.set(n, page);
    while (cache.size > PAGE_CACHE) {
      const [oldN, old] = cache.entries().next().value as [number, PDFPageProxy];
      cache.delete(oldN);
      old.cleanup();
    }
    return page;
  }

  return {
    kind: "pdf",
    mime: "application/pdf",
    pageCount: doc.numPages,
    async pageSize(n) {
      const vp = (await getPage(n)).getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },
    async render(n, target, v) {
      task?.cancel();
      task = null;
      const page = await getPage(n);
      const off = document.createElement("canvas");
      const ctx = prepare(off, v);
      const viewport = page.getViewport({ scale: v.zoom * v.dpr });
      const current = page.render({
        canvasContext: ctx,
        viewport,
        transform: [1, 0, 0, 1, v.x * v.dpr, v.y * v.dpr],
      });
      task = current;
      try {
        await current.promise;
      } catch (e) {
        if (isCancel(e)) return false;
        throw new PlanError("Erreur de rendu de la page : le PDF est peut-être endommagé.");
      } finally {
        if (task === current) task = null;
      }
      const out = prepare(target, v);
      out.drawImage(off, 0, 0);
      off.width = 0;
      return true;
    },
    async vectorCorners(n) {
      const page = await getPage(n);
      const ops = await page.getOperatorList();
      const vp = page.getViewport({ scale: 1 });
      return vectorCorners(ops).map(([x, y]) => {
        const p = vp.convertToViewportPoint(x, y);
        return [p[0], p[1]] as Pt;
      });
    },
    async pageText(n) {
      const page = await getPage(n);
      const content = await page.getTextContent();
      return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    },
    destroy() {
      task?.cancel();
      cache.clear();
      void doc.destroy();
    },
  };
}

async function openImage(data: ArrayBuffer, mime: string): Promise<PlanDoc> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([data], { type: mime }));
  } catch {
    throw new PlanError("Image illisible ou endommagée.");
  }
  if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close();
    throw new PlanError("Image trop grande (plus de 120 mégapixels).");
  }
  let generation = 0;
  return {
    kind: "image",
    mime,
    pageCount: 1,
    async pageSize() {
      return { width: bitmap.width, height: bitmap.height };
    },
    async render(_n, target, v) {
      const gen = ++generation;
      await Promise.resolve();
      if (gen !== generation) return false;
      const ctx = prepare(target, v);
      const s = v.zoom * v.dpr;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = v.zoom < 1 ? "high" : "low";
      ctx.setTransform(s, 0, 0, s, v.x * v.dpr, v.y * v.dpr);
      ctx.drawImage(bitmap, 0, 0);
      return true;
    },
    async vectorCorners() {
      return [];
    },
    async pageText() {
      return "";
    },
    destroy() {
      bitmap.close();
    },
  };
}
