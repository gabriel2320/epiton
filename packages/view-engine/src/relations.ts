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

export function toTrytonM2M(ids: number[]): unknown[] {
  return [["add", ids]];
}
