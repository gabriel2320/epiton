/** Probe ir.model.access rows for ACL coach / gateway strict mode. */
import type { EpitonClient } from "./index";

export async function modelHasAccessRows(
  client: EpitonClient,
  model: string,
): Promise<boolean | null> {
  try {
    const rows = await client.searchRead(
      "ir.model.access",
      [["model.model", "=", model]],
      ["id"],
      0,
      1,
    );
    return rows.length > 0;
  } catch {
    return null;
  }
}
