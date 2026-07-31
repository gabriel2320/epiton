/**
 * Soft-fail database discovery (Tryton common.db.list).
 */

import type { EpitonClient } from "./index";

/** List databases from trytond. Soft-fails to []. */
export async function listDatabases(client: EpitonClient): Promise<string[]> {
  try {
    const result = await client.callUnauthenticated("common.db.list", []);
    if (!Array.isArray(result)) return [];
    return result.map(String).filter((name) => name.length > 0);
  } catch {
    return [];
  }
}
