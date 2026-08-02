import { describe, expect, it } from "vitest";
import { createBackendProjectionClient, discardBackendProjection } from "./backendTruth";

describe("backend truth projection", () => {
  it("purges all cached server data at an authentication boundary", () => {
    const client = createBackendProjectionClient();
    client.setQueryData(["model", "party.party", 1], { id: 1, name: "Private" });

    discardBackendProjection(client);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getQueryData(["model", "party.party", 1])).toBeUndefined();
  });

  it("revalidates in-memory projections on focus and reconnect", () => {
    const client = createBackendProjectionClient();
    const queries = client.getDefaultOptions().queries;

    expect(queries?.refetchOnWindowFocus).toBe("always");
    expect(queries?.refetchOnReconnect).toBe("always");
    expect(queries?.gcTime).toBe(5 * 60_000);
  });
});
