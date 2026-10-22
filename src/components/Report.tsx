import { DISCLAIMER } from "../lib/export/report";
import { formatNumber, formatQty } from "../lib/format";
import { summarize } from "../lib/quantities";
import { DEFAULT_LEVEL_HEIGHT } from "../lib/types";
import { useApp } from "../state/store";

/** Feuille visible seulement à l'impression. Les annotations n'y sont pas comptées. */
export default function ReportSheet() {
  const project = useApp((s) => s.project);
  const summary = summarize(project);
  const t = summary.totals;
  return (
    <article className="report-sheet" aria-hidden="true">
      <h1>Rapport de métré — {project.name}</h1>
      <p>
        <strong>{DISCLAIMER}</strong>
      </p>
      <p>
        Niveau courant : {project.level}. Hauteurs sous plafond :{" "}
        {project.levels
          .map(
            (lv) => `${lv} ${formatNumber(project.levelHeights[lv] ?? DEFAULT_LEVEL_HEIGHT, 2)} m`,
          )
          .join(", ")}
        .
      </p>
      <p>
        Échelles :{" "}
        {Object.keys(project.scales).length === 0
          ? "aucune page étalonnée"
          : Object.entries(project.scales)
              .map(
                ([page, scale]) => `page ${page} : 1 unité = ${formatNumber(scale * 1000, 3)} mm`,
              )
              .join(" ; ")}
        .
      </p>
      <table>
        <thead>
          <tr>
            <th>Élément</th>
            <th>Niveau</th>
            <th>Quantité</th>
            <th>Épaisseur m</th>
            <th>Côté b m</th>
            <th>Hauteur m</th>
            <th>Béton m³</th>
            <th>Coffrage m²</th>
            <th>Acier kg</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={`${r.elementId}|${r.level}`}>
              <td>{r.name}</td>
              <td>{r.level}</td>
              <td>{formatQty(r.quantity, r.unit)}</td>
              <td>{r.a === null ? "" : formatNumber(r.a, 2)}</td>
              <td>{r.b === null ? "" : formatNumber(r.b, 2)}</td>
              <td>{r.h === null ? "" : formatNumber(r.h, 2)}</td>
              <td>{formatNumber(r.concrete, 2)}</td>
              <td>{formatNumber(r.formwork, 2)}</td>
              <td>{formatNumber(r.steel, 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total net</th>
            <td />
            <td />
            <td />
            <td />
            <td />
            <td>{formatNumber(t.concrete, 2)}</td>
            <td>{formatNumber(t.formwork, 2)}</td>
            <td>{formatNumber(t.steel, 0)}</td>
          </tr>
        </tfoot>
      </table>
      {summary.haByDiameter.length > 0 && (
        <>
          <h2>Acier HA par diamètre</h2>
          <ul>
            {summary.haByDiameter.map((d) => (
              <li key={d.diameter}>
                Ø {formatNumber(d.diameter, 0)} mm : {formatNumber(d.count, 0)} barres,{" "}
                {formatNumber(d.length, 2)} m, {formatNumber(d.kg, 2)} kg
              </li>
            ))}
          </ul>
        </>
      )}
      {summary.meshes.length > 0 && (
        <>
          <h2>Treillis soudé (masse saisie, à vérifier)</h2>
          <ul>
            {summary.meshes.map((m) => (
              <li key={`${m.name}|${m.width}|${m.length}`}>
                {m.name} : {formatNumber(m.panels, 0)} panneaux, chutes {formatNumber(m.offcut, 2)}{" "}
                m², {formatNumber(m.kg, 2)} kg
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        {project.annotations.length} annotation(s) sur le plan (textes, flèches, nuages), exclues
        des quantités.
        {summary.pending > 0
          ? ` ${summary.pending} proposition(s) non relue(s) exclue(s) des totaux.`
          : ""}
      </p>
    </article>
  );
}
