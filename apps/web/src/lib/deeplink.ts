/** Deep-link helpers: ?model=party.party&id=1 (no React Router). */

export function readDeepLink(): { model: string | null; id: number | null } {
  if (typeof window === "undefined") return { model: null, id: null };
  const params = new URLSearchParams(window.location.search);
  const model = params.get("model");
  const idRaw = params.get("id");
  const id = idRaw != null && idRaw !== "" ? Number(idRaw) : null;
  return {
    model: model?.includes(".") ? model : null,
    id: id != null && Number.isFinite(id) ? id : null,
  };
}

export function writeDeepLink(model: string, id: number | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("model", model);
  if (id != null) params.set("id", String(id));
  else params.delete("id");
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", next);
}
