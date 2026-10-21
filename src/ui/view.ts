import { fitView, zoomAt } from "../state/store";

export function planArea(): { w: number; h: number } {
  const r = document.querySelector(".plan")?.getBoundingClientRect();
  return { w: r?.width ?? 0, h: r?.height ?? 0 };
}

export function zoomCenter(factor: number): void {
  const { w, h } = planArea();
  zoomAt(factor, w / 2, h / 2);
}

export function fitToScreen(): void {
  const { w, h } = planArea();
  fitView(w, h);
}
