import { describe, expect, it } from "vitest";

import { autoDayIcon } from "./muscles";

describe("autoDayIcon", () => {
  it("partia z największą liczbą ćwiczeń", () => {
    expect(autoDayIcon(["biceps", "triceps", "chest"])).toBe("arms");
    expect(autoDayIcon(["quads", "hamstrings", null])).toBe("legs");
  });
  it("góra bez nóg to nie całe ciało", () => {
    expect(autoDayIcon(["chest", "lats", "side_delts", "biceps", "triceps"])).toBe("arms");
  });
  it("nogi i góra bez przewagi: całe ciało", () => {
    expect(autoDayIcon(["quads", "chest", "lats", "abs"])).toBe("full");
  });
  it("bez ćwiczeń: brak", () => {
    expect(autoDayIcon([])).toBeNull();
    expect(autoDayIcon(["unknown"])).toBeNull();
  });
});
