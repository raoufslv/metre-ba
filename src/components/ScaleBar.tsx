import { rulerLength } from "../lib/calibration";
import { formatNumber } from "../lib/format";
import { pageScale, useApp } from "../state/store";

/** Un point PDF mesure 25,4 / 72 mm sur le papier. */
const MM_PER_PT = 25.4 / 72;

export function ScaleBar() {
  const scale = useApp(pageScale);
  const zoom = useApp((s) => s.view.zoom);
  const kind = useApp((s) => s.plan?.kind);
  const page = useApp((s) => s.page);

  if (scale === null) {
    return (
      <div className="scalebar scalebar-missing" role="status">
        Page {page} non étalonnée
      </div>
    );
  }
  const ruler = rulerLength(scale / zoom);
  const ratio = kind === "pdf" ? Math.round((scale * 1000) / MM_PER_PT) : null;
  const label =
    ruler.meters >= 1
      ? `${formatNumber(ruler.meters, 0)} m`
      : `${formatNumber(ruler.meters * 100, 0)} cm`;
  return (
    <div className="scalebar" role="status" aria-label={`Règle étalonnée : ${label}`}>
      <div className="ruler" style={{ width: `${ruler.px}px` }}>
        <span className="ruler-half" />
      </div>
      <span>
        {label}
        {ratio ? ` · échelle ≈ 1/${ratio}` : ""}
      </span>
    </div>
  );
}
