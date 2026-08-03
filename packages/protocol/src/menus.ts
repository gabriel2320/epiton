import { type EpitonClient, type JsonObject, type JsonValue, TrytonRpcError } from "./index";

export interface TrytonMenu {
  id: number;
  name: string;
  parent: number | null;
  action: string | null;
  favorite: boolean;
}

function malformedMenu(message: string, payload: unknown): never {
  throw new TrytonRpcError(message, -32000, payload as JsonValue);
}

function menuId(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return malformedMenu(`${label} expected a positive integer`, value);
  }
  return value as number;
}

function menuParent(value: JsonValue | undefined): number | null {
  if (value == null || value === false) return null;
  if (typeof value === "number") return menuId(value, "ir.ui.menu.parent");
  if (Array.isArray(value) && value.length === 2 && typeof value[1] === "string") {
    return menuId(value[0], "ir.ui.menu.parent[0]");
  }
  return malformedMenu("ir.ui.menu.parent expected null, id, or [id, name]", value);
}

function menuAction(value: JsonValue | undefined): string | null {
  if (value == null || value === false) return null;
  if (typeof value === "string" && value.length > 0) return value;
  return malformedMenu("ir.ui.menu.action expected null or non-empty string", value);
}

function favoriteIds(value: JsonValue): Set<number> {
  if (!Array.isArray(value)) {
    return malformedMenu("ir.ui.menu.favorite.get expected an array", value);
  }
  const ids = new Set<number>();
  for (const favorite of value) {
    if (
      !Array.isArray(favorite) ||
      favorite.length !== 3 ||
      typeof favorite[1] !== "string" ||
      !(favorite[2] == null || typeof favorite[2] === "string")
    ) {
      return malformedMenu("ir.ui.menu.favorite.get expected [id, name, icon] tuples", favorite);
    }
    ids.add(menuId(favorite[0], "ir.ui.menu.favorite id"));
  }
  return ids;
}

/** Load the complete server menu and merge Tryton's per-user favorite relation. */
export async function loadMenus(
  client: EpitonClient,
  context: JsonObject = {},
): Promise<TrytonMenu[]> {
  const [rows, rawFavorites] = await Promise.all([
    client.searchRead(
      "ir.ui.menu",
      [["active", "=", true]],
      ["name", "parent", "action"],
      0,
      null,
      null,
      context,
    ),
    client.model("ir.ui.menu.favorite", "get", [], context),
  ]);
  const favorites = favoriteIds(rawFavorites);

  return rows.map((row) => {
    const id = menuId(row.id, "ir.ui.menu.id");
    if (typeof row.name !== "string" || row.name.length === 0) {
      return malformedMenu("ir.ui.menu.name expected a non-empty string", row);
    }
    return {
      id,
      name: row.name,
      parent: menuParent(row.parent),
      action: menuAction(row.action),
      favorite: favorites.has(id),
    };
  });
}

/** Update only Tryton's per-user favorite relation; menu records stay immutable here. */
export async function setMenuFavorite(
  client: EpitonClient,
  id: number,
  favorite: boolean,
  context: JsonObject = {},
): Promise<void> {
  const safeId = menuId(id, "ir.ui.menu.favorite id");
  await client.model("ir.ui.menu.favorite", favorite ? "set" : "unset", [safeId], context);
}
