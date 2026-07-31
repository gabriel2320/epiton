import Fuse from "fuse.js";

export type Density = "compact" | "comfortable";
export type LayoutMode = "tree-form" | "list-form" | "cards";
export type WorkspacePreset = "general" | "accounting" | "warehouse" | "clinical";

export interface MenuItem {
  id: number | string;
  name: string;
  parent?: number | string | null;
  action?: string | null;
  keywords?: string[];
}

export interface RecentRecord {
  model: string;
  id: number;
  title: string;
  at: number;
}

export interface ActionSuggestion {
  kind: "menu" | "record" | "action";
  label: string;
  score: number;
  payload: Record<string, unknown>;
}

export function scoreMatch(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 50;
  const parts = q.split(/\s+/);
  let hit = 0;
  for (const p of parts) if (t.includes(p)) hit += 1;
  return hit ? (hit / parts.length) * 40 : 0;
}

export function unifiedSearch(
  query: string,
  menus: MenuItem[],
  recents: RecentRecord[],
  limit = 20,
): ActionSuggestion[] {
  const q = query.trim();
  if (!q) {
    return menus.slice(0, Math.min(limit, 8)).map((m) => ({
      kind: "menu" as const,
      label: m.name,
      score: 1,
      payload: { id: m.id, action: m.action },
    }));
  }

  const menuDocs = menus.map((m) => ({
    kind: "menu" as const,
    label: m.name,
    haystack: `${m.name} ${(m.keywords ?? []).join(" ")} ${m.action ?? ""}`,
    payload: { id: m.id, action: m.action },
  }));
  const recentDocs = recents.map((r) => ({
    kind: "record" as const,
    label: r.title,
    haystack: `${r.title} ${r.model}`,
    payload: { model: r.model, id: r.id },
  }));

  const fuse = new Fuse([...menuDocs, ...recentDocs], {
    keys: ["label", "haystack"],
    threshold: 0.4,
    includeScore: true,
  });

  return fuse
    .search(q)
    .slice(0, limit)
    .map((hit) => ({
      kind: hit.item.kind,
      label: hit.item.label,
      score: Math.round((1 - (hit.score ?? 0)) * 100) + (hit.item.kind === "record" ? 5 : 0),
      payload: hit.item.payload,
    }));
}

export function suggestNextActions(
  history: Array<{ model: string; action: string }>,
  limit = 5,
): ActionSuggestion[] {
  const counts = new Map<string, number>();
  for (const h of history.slice(-50)) {
    const key = `${h.model}:${h.action}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, score]) => {
      const [model, action] = key.split(":");
      return {
        kind: "action" as const,
        label: `${action} on ${model}`,
        score,
        payload: { model, action },
      };
    });
}

export function adaptiveLayout(input: {
  viewportWidth: number;
  preset: WorkspacePreset;
  preferTree: boolean;
}): { layout: LayoutMode; density: Density } {
  if (input.viewportWidth < 720) {
    return { layout: "cards", density: "comfortable" };
  }
  if (input.viewportWidth < 1100) {
    return { layout: "list-form", density: "comfortable" };
  }
  if (input.preset === "warehouse") {
    return { layout: "tree-form", density: "compact" };
  }
  if (input.preset === "clinical") {
    return { layout: input.preferTree ? "tree-form" : "list-form", density: "comfortable" };
  }
  return {
    layout: input.preferTree ? "tree-form" : "list-form",
    density: input.preset === "accounting" ? "compact" : "comfortable",
  };
}

export interface AclCoachWarning {
  model: string;
  message: string;
  severity: "info" | "warn";
}

/** Educates about Tryton fail-open ACL when model access rows are missing. */
export function strictAclCoach(
  model: string,
  hasModelAccessRows: boolean | null,
): AclCoachWarning | null {
  if (hasModelAccessRows === null) return null;
  if (hasModelAccessRows) return null;
  return {
    model,
    severity: "warn",
    message: `Model ${model} has no ir.model.access rows; Tryton defaults to allow-all. Enable Epiton gateway strict mode or add access rules.`,
  };
}

export function workspaceFavorites(preset: WorkspacePreset): string[] {
  switch (preset) {
    case "accounting":
      return ["account.move", "account.account", "party.party"];
    case "warehouse":
      return ["stock.shipment.in", "stock.shipment.out", "product.product"];
    case "clinical":
      return ["gnuhealth.patient", "gnuhealth.appointment", "party.party"];
    default:
      return ["party.party", "company.company"];
  }
}
