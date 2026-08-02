import { describe, expect, it } from "vitest";
import {
  createBackendProjectionClient,
  discardBackendProjection,
  invalidateModelProjections,
} from "./backendTruth";

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

  it("invalidates cross-model projections after a Tryton mutation", async () => {
    const client = createBackendProjectionClient();
    const partyKey = ["model", "party.party", "list"];
    const patientKey = ["model", "gnuhealth.patient", "list"];
    const menuKey = ["menus", 1];
    client.setQueryData(partyKey, [{ id: 1 }]);
    client.setQueryData(patientKey, []);
    client.setQueryData(menuKey, [{ id: 9 }]);

    await invalidateModelProjections(client);

    expect(client.getQueryCache().find({ queryKey: partyKey })?.state.isInvalidated).toBe(true);
    expect(client.getQueryCache().find({ queryKey: patientKey })?.state.isInvalidated).toBe(true);
    expect(client.getQueryCache().find({ queryKey: menuKey })?.state.isInvalidated).toBe(false);
  });
});
