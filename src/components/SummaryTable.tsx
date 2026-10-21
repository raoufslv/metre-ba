import { useMemo, useState } from "react";
import { DISCLAIMER } from "../lib/export/report";
import { formatNumber, formatQty } from "../lib/format";
import { summarize } from "../lib/quantities";
import { setSettings, useApp } from "../state/store";

function Num({ v, d }: { v: number; d: number }) {
  return <td className={v < 0 ? "num neg" : "num"}>{formatNumber(v, d)}</td>;
}

export default function SummaryTable() {
  const project = useApp((s) => s.project);
  const summary = useMemo(() => summarize(project), [project]);
  const [open, setOpen] = useState(true);
  const t = summary.totals;
  const settings = project.settings;
  const showOrder = summary.rows.some(
    (r) => Math.abs(r.orderConcrete - r.concrete) > 1e-9 || Math.abs(r.orderSteel - r.steel) > 1e-9,
  );
  const [tolText, setTolText] = useState<string | null>(null);
  function commitTol(text: string): void {
    const n = Number(text.trim().replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 2) setSettings({ overlapTolerance: n });
    setTolText(null);
  }

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
      <div className="overlap-opt">
        <label className="check">
          <input
            type="checkbox"
            checked={settings.overlapDeduction}
            onChange={(e) => setSettings({ overlapDeduction: e.target.checked })}
          />
          Déduire les recouvrements de coffrage aux jonctions
        </label>
        {settings.overlapDeduction && (
          <>
            <label htmlFor="overlap-tol">Tolérance (m)</label>
            <input
              id="overlap-tol"
              className="narrow"
              inputMode="decimal"
              value={tolText ?? String(settings.overlapTolerance).replace(".", ",")}
              onChange={(e) => setTolText(e.target.value)}
              onBlur={() => tolText !== null && commitTol(tolText)}
              onKeyDown={(e) => e.key === "Enter" && tolText !== null && commitTol(tolText)}
            />
          </>
        )}
        <details>
          <summary>
            Comment ça marche
            {settings.overlapDeduction
              ? ` — ${summary.junctions.length} jonction(s), ${formatNumber(
                  summary.junctions.reduce((a, j) => a + j.area, 0),
                  2,
                )} m² déduits`
              : ""}
          </summary>
          <p className="muted small">
            Quand deux éléments du même niveau se touchent (mur contre mur, poteau contre voile ou
            poutre, mur sous un plancher), la face de contact n'est pas à coffrer. Le coffrage de
            l'élément « receveur » est réduit de la surface de contact : voile contre voile (a × h
            min.), poteau contre voile (a × h min.), voile ou poteau sous plancher (longueur dans le
            plancher × a). Les contacts sont détectés à la tolérance près ; la déduction ne dépasse
            jamais le coffrage du receveur. Désactivé par défaut : vérifiez le résultat avant de le
            retenir.
          </p>
          {settings.overlapDeduction && summary.junctions.length > 0 && (
            <ul className="small">
              {summary.junctions.map((j, i) => (
                <li key={i}>
                  {j.kind} : −{formatNumber(j.area, 2)} m²
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
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
                  {showOrder && (
                    <>
                      <th scope="col" className="num">
                        Béton à commander m³
                      </th>
                      <th scope="col" className="num">
                        Acier à commander kg
                      </th>
                    </>
                  )}
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
                    {showOrder && (
                      <>
                        <Num v={r.orderConcrete} d={2} />
                        <Num v={r.orderSteel} d={0} />
                      </>
                    )}
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
                  {showOrder && (
                    <>
                      <Num v={t.orderConcrete} d={2} />
                      <Num v={t.orderSteel} d={0} />
                    </>
                  )}
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
