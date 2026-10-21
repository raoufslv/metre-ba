import { useMemo, useState } from "react";
import { DISCLAIMER } from "../lib/export/report";
import { formatNumber, formatQty } from "../lib/format";
import { summarize } from "../lib/quantities";
import { useApp } from "../state/store";

function Num({ v, d }: { v: number; d: number }) {
  return <td className={v < 0 ? "num neg" : "num"}>{formatNumber(v, d)}</td>;
}

export default function SummaryTable() {
  const project = useApp((s) => s.project);
  const summary = useMemo(() => summarize(project), [project]);
  const [open, setOpen] = useState(true);
  const t = summary.totals;

  return (
    <section className="summary" aria-labelledby="summary-title">
      <header className="summary-head">
        <h2 id="summary-title">Récapitulatif</h2>
        <span className="totals-inline" aria-live="polite">
          Béton <strong>{formatQty(t.concrete, "m³")}</strong> · Coffrage{" "}
          <strong>{formatQty(t.formwork, "m²")}</strong> · Acier{" "}
          <strong>{formatQty(t.steel, "kg")}</strong>
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="summary-body"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Réduire" : "Afficher"}
        </button>
      </header>
      <p className="disclaimer">{DISCLAIMER}</p>
      {open && (
        <div id="summary-body" className="summary-body">
          {summary.rows.length === 0 ? (
            <p className="muted pad">Aucun tracé : étalonnez une page puis tracez des éléments.</p>
          ) : (
            <table>
              <caption className="sr-only">Quantités par élément et par niveau</caption>
              <thead>
                <tr>
                  <th scope="col">Élément</th>
                  <th scope="col">Niveau</th>
                  <th scope="col" className="num">
                    Quantité
                  </th>
                  <th scope="col" className="num">
                    Béton m³
                  </th>
                  <th scope="col" className="num">
                    Coffrage m²
                  </th>
                  <th scope="col" className="num">
                    Acier HA kg
                  </th>
                  <th scope="col" className="num">
                    Treillis soudé kg
                  </th>
                  <th scope="col" className="num">
                    Acier total kg
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={`${r.elementId}|${r.level}`}>
                    <th scope="row">
                      <span className="swatch" style={{ background: r.color }} aria-hidden="true" />
                      {r.name}
                      {r.warnings.length > 0 && (
                        <span
                          className="warn"
                          title={r.warnings.join(" ")}
                          aria-label={r.warnings.join(" ")}
                        >
                          {" "}
                          ⚠
                        </span>
                      )}
                    </th>
                    <td>{r.level}</td>
                    <td className="num">{formatQty(r.quantity, r.unit)}</td>
                    <Num v={r.concrete} d={2} />
                    <Num v={r.formwork} d={2} />
                    <Num v={r.ha} d={0} />
                    <Num v={r.ts} d={0} />
                    <Num v={r.steel} d={0} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total net</th>
                  <td />
                  <td />
                  <Num v={t.concrete} d={2} />
                  <Num v={t.formwork} d={2} />
                  <Num v={t.ha} d={0} />
                  <Num v={t.ts} d={0} />
                  <Num v={t.steel} d={0} />
                </tr>
              </tfoot>
            </table>
          )}
          {summary.pending > 0 && (
            <p className="muted pad">
              {summary.pending} proposition(s) non relue(s) exclue(s) des totaux.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
