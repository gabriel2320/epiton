import { describe, expect, it, vi } from "vitest";
import { listDatabases } from "./databases";

describe("listDatabases", () => {
  it("maps common.db.list array", async () => {
    const client = {
      callUnauthenticated: vi.fn().mockResolvedValue(["tryton", "demo"]),
    };
    await expect(listDatabases(client as never)).resolves.toEqual(["tryton", "demo"]);
  });

  it("soft-fails to []", async () => {
    const client = {
      callUnauthenticated: vi.fn().mockRejectedValue(new Error("down")),
    };
    await expect(listDatabases(client as never)).resolves.toEqual([]);
  });
});
