import { type KeywordAction, getRecordKeywords } from "@epiton/protocol";
import { Button, Panel } from "@epiton/ui";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../lib/store";

/** Sao-style Relate / Print / Action menus from ir.action.keyword. */
export function RecordActionsMenu(props: {
  model: string;
  recordId: number | null;
  onOpen: (ref: string, source: string) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);

  const keywordsQuery = useQuery({
    queryKey: ["keywords", props.model, props.recordId],
    enabled: Boolean(client && props.model),
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) return { relate: [], print: [], action: [] };
      return getRecordKeywords(client, props.model, props.recordId, sessionContext);
    },
  });

  const relate = keywordsQuery.data?.relate ?? [];
  const print = keywordsQuery.data?.print ?? [];
  const action = keywordsQuery.data?.action ?? [];
  const empty = !relate.length && !print.length && !action.length;

  return (
    <Panel title="Actions">
      {keywordsQuery.isLoading ? <p role="status">Loading keywords…</p> : null}
      {empty && !keywordsQuery.isLoading ? (
        <p className="text-sm text-[var(--epiton-muted)]" role="status">
          No relate / print / form actions
        </p>
      ) : null}
      <ActionGroup label="Relate" items={relate} onPick={(a) => props.onOpen(a.ref, "relate")} />
      <ActionGroup label="Print" items={print} onPick={(a) => props.onOpen(a.ref, "print")} />
      <ActionGroup
        label="Action"
        items={action}
        onPick={(a) => props.onOpen(a.ref, "form_action")}
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
