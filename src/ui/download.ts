/** Déclenche un téléchargement ; renvoie `false` si le navigateur l'a refusé. */
export function downloadBlob(blob: Blob, filename: string): boolean {
  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    const u = url;
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
    return true;
  } catch {
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}

/** Repli pour un fichier binaire : ouverture dans un nouvel onglet. */
export function openBlob(blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob);
    // Avec « noopener », window.open renvoie toujours null : impossible de détecter un blocage.
    const w = window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return w !== null;
  } catch {
    return false;
  }
}

export function slug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "projet"
  );
}
