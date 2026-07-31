/** Helpers for One2Many / Many2Many command lists used by Tryton writes. */
export type O2MCommand =
  | { op: "create"; values: Record<string, unknown> }
  | { op: "write"; id: number; values: Record<string, unknown> }
  | { op: "delete"; id: number }
  | { op: "add"; id: number }
  | { op: "remove"; id: number };

export function toTrytonO2M(commands: O2MCommand[]): unknown[] {
  return commands.map((c) => {
    switch (c.op) {
      case "create":
        return ["create", c.values];
      case "write":
        return ["write", [c.id], c.values];
      case "delete":
        return ["delete", [c.id]];
      case "add":
        return ["add", [c.id]];
      case "remove":
        return ["remove", [c.id]];
    }
  });
}

/** Set-style M2M write (add all ids). Prefer `toTrytonM2MDelta` when editing. */
export function toTrytonM2M(ids: number[]): unknown[] {
  return [["add", ids]];
}

/** Sao-style M2M delta: add newcomers, remove dropouts. */
export function toTrytonM2MDelta(previous: number[], next: number[]): unknown[] {
  const prev = new Set(previous);
  const nxt = new Set(next);
  const add = next.filter((id) => !prev.has(id));
  const remove = previous.filter((id) => !nxt.has(id));
  const cmds: unknown[] = [];
  if (add.length) cmds.push(["add", add]);
  if (remove.length) cmds.push(["remove", remove]);
  if (!cmds.length && next.length) return [["add", next]];
  return cmds;
}
