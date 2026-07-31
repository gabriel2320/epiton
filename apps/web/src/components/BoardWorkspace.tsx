import { resolveBoardAction } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import { boardActionNames, parseFieldsViewGet } from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../lib/store";

/** Host for Tryton board views: list action tiles and open them. */
export function BoardWorkspace(props: {
  model: string;
  onOpen: (actionOrModel: string) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);

  const boardQuery = useQuery({
    queryKey: ["model", props.model, "board-view"],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return { names: [] as string[], error: "No client" };
      try {
        const fv = parseFieldsViewGet(
          await client.fieldsViewGet(props.model, null, "board", sessionContext),
        );
        return { names: boardActionNames(fv.arch), error: null as string | null };
      } catch (err) {
        return {
          names: [] as string[],
          error: err instanceof Error ? err.message : "Board view unavailable",
        };
      }
    },
  });

  const names = boardQuery.data?.names ?? [];
  const state = boardQuery.isLoading
    ? "loading"
    : boardQuery.data?.error
      ? "error"
      : names.length
        ? "data"
        : "empty";

  return (
    <Panel title={`Board · ${props.model}`}>
      <StateBlock state={state} message={boardQuery.data?.error ?? "No board actions in arch"}>
        <ul className="epiton-board-tiles">
          {names.map((name) => (
            <li key={name}>
              <Button
                onClick={() => {
                  void (async () => {
                    if (!client) {
                      props.onOpen(name);
                      return;
                    }
                    const resolved = await resolveBoardAction(client, name);
                    if (resolved.kind === "model") props.onOpen(resolved.model);
                    else if (resolved.kind === "wizard") props.onOpen(resolved.wizard);
                    else if (resolved.kind === "report") props.onOpen(resolved.report);
                    else if (/^\d+$/.test(name)) props.onOpen(`ir.action.act_window,${name}`);
                    else props.onOpen(name);
                  })();
                }}
              >
                {name}
              </Button>
            </li>
          ))}
        </ul>
      </StateBlock>
    </Panel>
  );
}
