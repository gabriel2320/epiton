import { Button, Panel, StateBlock } from "@epiton/ui";
import { type ViewField, evalDomain } from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../lib/store";

/** Domain-aware many2one / many2many search picker. */
export function RelationSearch(props: {
  field: ViewField;
  recordValues: Record<string, unknown>;
  domain?: unknown[];
  mode: "read" | "write";
  onPick: (id: number, recName: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const client = useAppStore((s) => s.client);
  const [q, setQ] = useState("");
  const domain = useMemo(() => {
    if (props.domain) return props.domain;
    return evalDomain(props.field.domain ?? [], props.recordValues);
  }, [props.domain, props.field.domain, props.recordValues]);

  const searchDomain = useMemo(() => {
    const base = Array.isArray(domain) ? [...domain] : [];
    const term = q.trim();
    if (!term) return base;
    return [...base, ["rec_name", "ilike", `%${term}%`]];
  }, [domain, q]);

  const relation = props.field.relation ?? "";
  const listQuery = useQuery({
    queryKey: ["relation-search", relation, JSON.stringify(searchDomain)],
    enabled: Boolean(client && relation),
    queryFn: async () => {
      if (!client || !relation) return [];
      try {
        return await client.searchRead(
          relation,
          searchDomain as never[],
          ["id", "rec_name", "name"],
          0,
          40,
          null,
        );
      } catch {
        return await client.searchRead(relation, [], ["id", "rec_name"], 0, 40, null);
      }
    },
  });

  const state = listQuery.isLoading
    ? "loading"
    : listQuery.isError
      ? "error"
      : listQuery.data?.length
        ? "data"
        : "empty";

  return (
    <Panel title={t("relation.searchTitle", { field: props.field.string ?? props.field.name })}>
      <p className="text-sm text-[var(--epiton-muted)]" role="status">
        {relation || t("relation.noRelation")} ·{" "}
        {t("relation.domainClauses", { count: Array.isArray(domain) ? domain.length : 0 })}
      </p>
      <div className="epiton-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("relation.filterByName")}
          aria-label={t("relation.searchAria")}
          disabled={props.mode === "read"}
        />
        <Button onClick={() => listQuery.refetch()}>{t("workspace.refresh")}</Button>
        <Button onClick={props.onCancel}>{t("shell.close")}</Button>
      </div>
      <StateBlock
        state={state}
        message={listQuery.isError ? listQuery.error.message : t("relation.noMatches")}
      >
        <ul className="epiton-menu-list">
          {(listQuery.data ?? []).map((row) => {
            const id = Number(row.id);
            const label = String(row.rec_name ?? row.name ?? id);
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={props.mode === "read" || !Number.isFinite(id)}
                  onClick={() => props.onPick(id, label)}
                >
                  #{id} · {label}
                </button>
              </li>
            );
          })}
        </ul>
      </StateBlock>
    </Panel>
  );
}
