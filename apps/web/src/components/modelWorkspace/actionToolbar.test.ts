import { describe, expect, it } from "vitest";
import {
  buttonRpcContext,
  isActionButton,
  listActionAvailability,
  recordActionAvailability,
} from "./actionToolbar";

describe("actionToolbar", () => {
  it("keeps list mutations disabled until their current prerequisites exist", () => {
    expect(
      listActionAvailability({
        clientAvailable: false,
        hasFocusedRecord: false,
        multiSelectedCount: 0,
        visibleRowCount: 0,
      }),
    ).toEqual({
      deleteDisabled: true,
      copyDisabled: true,
      exportDisabled: true,
      importDisabled: true,
    });

    expect(
      listActionAvailability({
        clientAvailable: true,
        hasFocusedRecord: false,
        multiSelectedCount: 0,
        visibleRowCount: 4,
      }),
    ).toMatchObject({
      deleteDisabled: true,
      copyDisabled: true,
      exportDisabled: false,
      importDisabled: false,
    });

    expect(
      listActionAvailability({
        clientAvailable: true,
        hasFocusedRecord: false,
        multiSelectedCount: 2,
        visibleRowCount: 0,
      }),
    ).toEqual({
      deleteDisabled: false,
      copyDisabled: false,
      exportDisabled: false,
      importDisabled: false,
    });
  });

  it("keeps selected-record actions and save readiness independent", () => {
    expect(
      recordActionAvailability({
        mode: "read",
        clientAvailable: true,
        hasFocusedRecord: false,
        canSave: true,
        savePending: false,
      }),
    ).toEqual({
      modeDisabled: false,
      saveDisabled: false,
      deleteDisabled: true,
      copyDisabled: true,
      historyDisabled: true,
      emailDisabled: true,
    });

    expect(
      recordActionAvailability({
        mode: "write",
        clientAvailable: true,
        hasFocusedRecord: true,
        canSave: true,
        savePending: true,
      }),
    ).toEqual({
      modeDisabled: true,
      saveDisabled: true,
      deleteDisabled: false,
      copyDisabled: false,
      historyDisabled: false,
      emailDisabled: false,
    });
  });

  it("waits for an existing record to hydrate before entering edit mode", () => {
    expect(
      recordActionAvailability({
        mode: "read",
        clientAvailable: true,
        hasFocusedRecord: true,
        canSave: false,
        savePending: false,
      }).modeDisabled,
    ).toBe(true);

    expect(
      recordActionAvailability({
        mode: "write",
        clientAvailable: true,
        hasFocusedRecord: true,
        canSave: false,
        savePending: false,
      }).modeDisabled,
    ).toBe(false);
  });

  it("recognizes Tryton action references without treating ordinary methods as actions", () => {
    expect(isActionButton("ignored", "ACTION")).toBe(true);
    expect(isActionButton("ir.action.act_window,12")).toBe(true);
    expect(isActionButton("act_open_party")).toBe(true);
    expect(isActionButton("wizard.party.merge")).toBe(true);
    expect(isActionButton("report.invoice")).toBe(true);
    expect(isActionButton("party.party,42")).toBe(true);
    expect(isActionButton("confirm_quote", "instance")).toBe(false);
  });

  it("overlays canonical active-record context while retaining action context", () => {
    const ids: [number, ...number[]] = [7, 11];
    expect(
      buttonRpcContext(
        {
          language: "es",
          active_id: 99,
          active_ids: [99],
          active_model: "old.model",
        },
        "party.party",
        ids,
      ),
    ).toEqual({
      language: "es",
      active_id: 7,
      active_ids: [7, 11],
      active_model: "party.party",
    });
  });
});
