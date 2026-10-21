import { useState } from "react";
import { formatNumber, formatQty } from "../lib/format";
import { compareProjects } from "../lib/revisions";
import { deleteRevision, saveRevision, useApp } from "../state/store";
import { Modal } from "./Dialogs";

/** Versions nommées et écarts de quantités. Les annotations n'y figurent pas. */
export default function RevisionsDialog() {
  const open = useApp((s) => s.revisionsOpen);
  const project = useApp((s) => s.project);
  const [name, setName] = useState("");
  const [baseId, setBaseId] = useState("");
  const [nextId, setNextId] = useState("current");

  const base = project.revisions.find((r) => r.id === baseId);
  const next =
    nextId === "current" ? project : project.revisions.find((r) => r.id === nextId)?.snapshot;
  const deltas = base && next && base.snapshot !== next ? compareProjects(base.snapshot, next) : [];

  return (
    <Modal open={open} title="Révisions" onClose={() => useApp.setState({ revisionsOpen: false })}>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (saveRevision(name)) setName("");
        }}
      >
        <label htmlFor="rev-name">Enregistrer la version actuelle</label>
        <input
          id="rev-name"
          value={name}
          maxLength={60}
          placeholder="ex. Avant modification des voiles"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary">
          Enregistrer
        </button>
      </form>
      <p className="muted small">
        Une révision fige les quantités. Vingt versions au plus : la plus ancienne est retirée
        ensuite. Comparaison = version de droite moins version de gauche.
      </p>
      {project.revisions.length === 0 ? (
        <p>Aucune version enregistrée.</p>
      ) : (
        <>
          <ul className="revision-list">
            {project.revisions.map((r) => (
              <li key={r.id}>
                <span>
                  {r.name}
                  <small className="muted">
                    {" "}
                    · {r.savedAt ? new Date(r.savedAt).toLocaleString("fr-FR") : ""}
                  </small>
                </span>
                <button type="button" onClick={() => deleteRevision(r.id)}>
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <label htmlFor="rev-base">Base</label>
            <select id="rev-base" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              <option value="">— choisir —</option>
              {project.revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <label htmlFor="rev-next">Comparée à</label>
            <select id="rev-next" value={nextId} onChange={(e) => setNextId(e.target.value)}>
              <option value="current">Projet actuel</option>
              {project.revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {base &&
            next &&
            (deltas.length === 0 ? (
              <p>Aucun écart de quantité.</p>
            ) : (
              <table>
                <caption className="sr-only">Écarts de quantités</caption>
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
                      Acier kg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deltas.map((d) => (
                    <tr key={`${d.elementId}|${d.level}`}>
                      <th scope="row">{d.name}</th>
                      <td>{d.level}</td>
                      <td className="num">
                        {d.quantity > 0 ? "+" : ""}
                        {formatQty(d.quantity, d.unit)}
                      </td>
                      <td className="num">
                        {d.concrete > 0 ? "+" : ""}
                        {formatNumber(d.concrete, 2)}
                      </td>
                      <td className="num">
                        {d.formwork > 0 ? "+" : ""}
                        {formatNumber(d.formwork, 2)}
                      </td>
                      <td className="num">
                        {d.steel > 0 ? "+" : ""}
                        {formatNumber(d.steel, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </>
      )}
    </Modal>
  );
}
