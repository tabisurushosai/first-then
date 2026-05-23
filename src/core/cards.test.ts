import { describe, expect, it } from "vitest";

import { completeNowCard, createInitialPopupState } from "./cards";

describe("cards core state", () => {
  it("creates a popup state with the first two cards selected", () => {
    const state = createInitialPopupState([
      { id: "first", emoji: "1", label: "First" },
      { id: "second", emoji: "2", label: "Second" },
      { id: "third", emoji: "3", label: "Third" },
    ]);

    expect(state.now.id).toBe("first");
    expect(state.next.id).toBe("second");
    expect(state.sequence.map((card) => card.id)).toEqual(["first", "second"]);
    expect(state.pool.map((card) => card.id)).toEqual(["first", "second", "third"]);
  });

  it("moves the next card into now when the current card is completed", () => {
    const state = createInitialPopupState([
      { id: "first", emoji: "1", label: "First" },
      { id: "second", emoji: "2", label: "Second" },
      { id: "third", emoji: "3", label: "Third" },
    ]);
    const advanced = completeNowCard({
      ...state,
      sequence: [state.pool[0], state.pool[1], state.pool[2]],
    });

    expect(advanced.now.id).toBe("second");
    expect(advanced.next.id).toBe("third");
    expect(advanced.sequence.map((card) => card.id)).toEqual(["second", "third"]);
  });
});
