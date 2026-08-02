import { describe, expect, it } from "vitest";
import { beginButtonFlight, finishButtonFlight } from "./buttonFlight";

describe("model button single-flight", () => {
  it("rejects duplicate requests until the active RPC releases its slot", () => {
    const flight = { current: null as string | null };

    expect(beginButtonFlight(flight, "prescription:7:create")).toBe(true);
    expect(beginButtonFlight(flight, "prescription:7:create")).toBe(false);
    expect(beginButtonFlight(flight, "vaccination:8:sign")).toBe(false);
    expect(finishButtonFlight(flight, "vaccination:8:sign")).toBe(false);
    expect(flight.current).toBe("prescription:7:create");
    expect(finishButtonFlight(flight, "prescription:7:create")).toBe(true);
    expect(beginButtonFlight(flight, "vaccination:8:sign")).toBe(true);
  });
});
