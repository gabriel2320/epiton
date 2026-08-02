/** Pure UI helpers extracted from ModelWorkspace (L2.1). No RPC / Screen state. */

export function noticeTone(message: string): "default" | "accent" | "danger" | "muted" {
  if (/fail|error|before running|nothing selected/i.test(message)) return "danger";
  if (/…|\.\.\.|importing|exporting|copying|running/i.test(message)) return "muted";
  if (/saved|ok|exported|imported|copied/i.test(message)) return "accent";
  return "default";
}
