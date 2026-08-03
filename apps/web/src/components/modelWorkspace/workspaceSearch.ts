import type { ActWindowDomainTab, JsonValue } from "@epiton/protocol";
import {
  buildSearchDomain,
  evalDomain,
  mergeDomains,
  parseSearchDomain,
} from "@epiton/view-engine";

/** Evaluate the selected Tryton action-domain tab against the volatile session context. */
export function activeWorkspaceTabDomain(
  tabs: ActWindowDomainTab[],
  activeIndex: number,
  context: Record<string, unknown>,
): unknown[] {
  if (activeIndex < 0) return [];
  const tab = tabs[activeIndex];
  return tab ? evalDomain(tab.domain ?? [], context) : [];
}

/** Compose action, domain-tab, and user-search constraints in Tryton wire order. */
export function workspaceListDomain(
  actionDomain: unknown[],
  tabDomain: unknown[],
  searchQuery: string,
  searchFields: string[],
): unknown[] {
  return mergeDomains(
    mergeDomains(actionDomain, tabDomain),
    buildSearchDomain(searchQuery, searchFields),
  );
}

/** Validate the user-owned part before composing or enabling a list RPC. */
export function workspaceListDomainResult(
  actionDomain: unknown[],
  tabDomain: unknown[],
  searchQuery: string,
  searchFields: string[],
): { ok: true; domain: unknown[] } | { ok: false; error: string } {
  const parsed = parseSearchDomain(searchQuery, searchFields);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    domain: mergeDomains(mergeDomains(actionDomain, tabDomain), parsed.domain),
  };
}

/** Convert a saved Tryton domain back into the screen search representation. */
export function savedSearchText(domain: JsonValue | null | undefined): string {
  return typeof domain === "string" ? domain : JSON.stringify(domain ?? []);
}
