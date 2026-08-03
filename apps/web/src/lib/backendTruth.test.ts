import { describe, expect, it } from "vitest";
import {
  backendRpcContextKey,
  backendSessionBoundaryChanged,
  backendSessionScopeKey,
  createBackendProjectionClient,
  discardBackendProjection,
  invalidateModelProjections,
} from "./backendTruth";

describe("backend truth projection", () => {
  it("scopes projections to Tryton authority without exposing unrelated preferences", () => {
    const first = backendSessionScopeKey({
      user: 7,
      company: 1,
      employee: 5,
      language: "es",
      groups: [4, 8],
      email: "private@example.test",
    });
    const sameAuthority = backendSessionScopeKey({
      user: 7,
      company: 1,
      employee: 5,
      language: "es",
      groups: [4, 8],
      email: "different@example.test",
    });

    expect(first).toBe(sameAuthority);
    expect(first).not.toContain("private@example.test");
    expect(backendSessionScopeKey({ user: 7, company: 2 })).not.toBe(
      backendSessionScopeKey({ user: 7, company: 1 }),
    );
    expect(backendSessionScopeKey({ user: 7, employee: 9 })).not.toBe(
      backendSessionScopeKey({ user: 7, employee: 5 }),
    );
    expect(
      backendSessionBoundaryChanged(
        { user: 7, company: 1, email: "first@example.test" },
        { user: 7, company: 1, email: "second@example.test" },
      ),
    ).toBe(false);
    expect(backendSessionBoundaryChanged({ user: 7, company: 1 }, { user: 7, company: 2 })).toBe(
      true,
    );
  });

  it("fingerprints the complete RPC context without embedding its values", () => {
    const first = backendRpcContextKey({
      company: 2,
      active_id: 19,
      email: "private@example.test",
    });
    const same = backendRpcContextKey({ email: "private@example.test", active_id: 19, company: 2 });
    const differentAction = backendRpcContextKey({
      company: 2,
      active_id: 20,
      email: "private@example.test",
    });

    expect(first).toBe(same);
    expect(first).not.toBe(differentAction);
    expect(first).not.toContain("private@example.test");
  });

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
