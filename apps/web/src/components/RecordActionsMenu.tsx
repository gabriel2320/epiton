import { type JsonObject, type KeywordAction, getRecordKeywords } from "@epiton/protocol";
import { Button, Panel } from "@epiton/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../lib/store";
import { buttonRpcContext } from "./modelWorkspace/actionToolbar";

/** Sao-style Relate / Print / Action menus from ir.action.keyword. */
export function RecordActionsMenu(props: {
  model: string;
  recordId: number | null;
  context: JsonObject;
  onOpen: (ref: string, source: string, context: JsonObject) => void;
}) {
  const { t } = useTranslation();
  const client = useAppStore((s) => s.client);
  const actionContext =
    props.recordId == null
      ? props.context
      : buttonRpcContext(props.context, props.model, [props.recordId]);

  const keywordsQuery = useQuery({
    queryKey: ["keywords", props.model, props.recordId, actionContext],
    enabled: Boolean(client && props.model),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) return { relate: [], print: [], action: [] };
      return getRecordKeywords(client, props.model, props.recordId, actionContext);
    },
  });

  const relate = keywordsQuery.data?.relate ?? [];
  const print = keywordsQuery.data?.print ?? [];
  const action = keywordsQuery.data?.action ?? [];
  const empty = !relate.length && !print.length && !action.length;

  return (
    <Panel title={t("workspace.actions")}>
      {keywordsQuery.isLoading ? <p role="status">{t("workspace.loadingKeywords")}</p> : null}
      {empty && !keywordsQuery.isLoading ? (
        <p className="text-sm text-[var(--epiton-muted)]" role="status">
          {t("workspace.noKeywordActions")}
        </p>
      ) : null}
      <ActionGroup
        label={t("workspace.relate")}
        items={relate}
        onPick={(a) => props.onOpen(a.ref, "relate", actionContext)}
      />
      <ActionGroup
        label={t("workspace.print")}
        items={print}
        onPick={(a) => props.onOpen(a.ref, "print", actionContext)}
      />
      <ActionGroup
        label={t("workspace.action")}
        items={action}
        onPick={(a) => props.onOpen(a.ref, "form_action", actionContext)}
      />
    </Panel>
  );
}

function ActionGroup(props: {
  label: string;
  items: KeywordAction[];
  onPick: (action: KeywordAction) => void;
}) {
  if (!props.items.length) return null;
  return (
    <div className="epiton-action-group">
      <h4>{props.label}</h4>
      <ul className="epiton-menu-list">
        {props.items.map((item) => (
          <li key={`${item.type}-${item.id}`}>
            <Button onClick={() => props.onPick(item)}>{item.name}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
