import { describe, expect, it } from "vitest";

import { autoDayIcon } from "./muscles";

describe("autoDayIcon", () => {
  it("split: partia z wyraźną przewagą", () => {
    expect(autoDayIcon(["biceps", "triceps", "chest"])).toBe("arms");
    expect(autoDayIcon(["quads", "hamstrings", null])).toBe("legs");
    expect(autoDayIcon(["chest", "chest", "chest", "triceps"])).toBe("chest");
  });
  it("push: klata, barki i triceps", () => {
    expect(autoDayIcon(["chest", "chest", "front_delts", "side_delts", "triceps", "triceps"])).toBe("push");
    expect(autoDayIcon(["chest", "chest", "side_delts", "triceps", "triceps", "rear_delts"])).toBe("push");
  });
  it("pull: plecy, tył barków i biceps", () => {
    expect(autoDayIcon(["lats", "upper_back", "rear_delts", "biceps", "biceps", "forearms"])).toBe("pull");
  });
  it("góra: push i pull razem, bez nóg", () => {
    expect(autoDayIcon(["chest", "lats", "side_delts", "biceps", "triceps"])).toBe("upper");
  });
  it("nogi i góra bez przewagi: całe ciało", () => {
    expect(autoDayIcon(["quads", "chest", "lats", "abs"])).toBe("full");
  });
  it("bez ćwiczeń: brak", () => {
    expect(autoDayIcon([])).toBeNull();
    expect(autoDayIcon(["unknown"])).toBeNull();
  });
});
