import { describe, expect, it, vi } from "vitest";
import { EpitonClient } from "./index";
import { executeReport } from "./reports";

function clientWithReport(result: unknown) {
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    expect(request.method).toBe("report.patient.card.execute");
    expect(request.params).toEqual([
      [17],
      { action_id: 31, model: "gnuhealth.patient" },
      { language: "es", active_id: 17 },
    ]);
    return new Response(JSON.stringify({ id: request.id, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new EpitonClient({
    baseUrl: "http://localhost:8000",
    database: "epiton_lab",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  client.setSession({ login: "admin", userId: 1, session: "tok" });
  return client;
}

describe("report helpers", () => {
  it("uses Tryton 8 report params and decodes its extended bytes envelope", async () => {
    const client = clientWithReport([
      "pdf",
      { __class__: "bytes", base64: "JVBERi0=" },
      false,
      "Carnet de Identidad",
    ]);

    await expect(
      executeReport(client, "patient.card", [17], {
        actionId: 31,
        model: "gnuhealth.patient",
        context: { language: "es", active_id: 17 },
      }),
    ).resolves.toEqual({
      extension: "pdf",
      payloadBase64: "JVBERi0=",
      directPrint: false,
      filename: "Carnet de Identidad",
    });
  });

  it("keeps compatibility with legacy base64 string payloads", async () => {
    const client = clientWithReport(["odt", "UEsDBA==", true, "Patient card"]);
    await expect(
      executeReport(client, "patient.card", [17], {
        actionId: 31,
        model: "gnuhealth.patient",
        context: { language: "es", active_id: 17 },
      }),
    ).resolves.toMatchObject({ extension: "odt", payloadBase64: "UEsDBA==", directPrint: true });
  });

  it("rejects malformed report results", async () => {
    const client = clientWithReport(["pdf", null, false, "Patient card"]);
    await expect(
      executeReport(client, "patient.card", [17], {
        actionId: 31,
        model: "gnuhealth.patient",
        context: { language: "es", active_id: 17 },
      }),
    ).rejects.toThrow("invalid report parts");
  });

  it("rejects invalid technical names and record ids before RPC", async () => {
    const client = clientWithReport(["pdf", "JVBERi0=", false, "Patient card"]);

    await expect(executeReport(client, "patient.card/../../admin", [17])).rejects.toThrow(
      "technical name is invalid",
    );
    await expect(executeReport(client, "patient.card", [0])).rejects.toThrow(
      "valid report record id",
    );
  });
});
