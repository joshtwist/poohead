import { describe, expect, it } from "vitest";
import type { Rank } from "./types.ts";
import type { Play, Requirement } from "./rules.ts";
import {
  RULE_SETS,
  canPlayRank,
  formatRequirement,
  hasFourOfAKindOnTop,
  isWild,
  requirementAt,
} from "./rules.ts";
import { c, cs } from "../server/testkit.ts";

/** Build plays from codes, e.g. plays("Kh", "7s", "8d 8c"). */
function plays(...groups: string[]): Play[] {
  return groups.map((g) => {
    const cards = cs(g);
    return { rank: cards[0].rank, cards };
  });
}

const standard = RULE_SETS.standard;
const ukpub = RULE_SETS.ukpub;
const millybims = RULE_SETS.millybims;

const ALL_RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function legal(req: Requirement, rules = millybims): Rank[] {
  return ALL_RANKS.filter((r) => canPlayRank(r, req, rules));
}

describe("isWild", () => {
  it("2 and 10 are wild everywhere", () => {
    for (const rules of [standard, ukpub, millybims]) {
      expect(isWild("2", rules)).toBe(true);
      expect(isWild("10", rules)).toBe(true);
      expect(isWild("9", rules)).toBe(false);
      expect(isWild("A", rules)).toBe(false);
    }
  });

  it("UK pub: 3 is wild (invisible); 7 and 8 are not", () => {
    expect(isWild("3", ukpub)).toBe(true);
    expect(isWild("7", ukpub)).toBe(false);
    expect(isWild("8", ukpub)).toBe(false);
  });

  it("Millybims: 7 and 8 are wild; 3 is not", () => {
    expect(isWild("7", millybims)).toBe(true);
    expect(isWild("8", millybims)).toBe(true);
    expect(isWild("3", millybims)).toBe(false);
  });
});

describe("requirementAt — common", () => {
  it("empty pile → anything", () => {
    expect(requirementAt([], standard)).toEqual({ kind: "any" });
  });

  it("plain card → min that rank", () => {
    expect(requirementAt(plays("9h"), standard)).toEqual({ kind: "min", rank: "9" });
    expect(requirementAt(plays("3c", "Kd"), standard)).toEqual({ kind: "min", rank: "K" });
  });

  it("2 on top → anything", () => {
    expect(requirementAt(plays("Kh", "2s"), standard)).toEqual({ kind: "any" });
  });

  it("standard: 7 is an ordinary card", () => {
    expect(requirementAt(plays("Kh", "7s"), standard)).toEqual({ kind: "min", rank: "7" });
  });

  it("standard: 3 and 8 are ordinary", () => {
    expect(requirementAt(plays("Kh", "3s"), standard)).toEqual({ kind: "min", rank: "3" });
    expect(requirementAt(plays("5h", "8s"), standard)).toEqual({ kind: "min", rank: "8" });
  });
});

describe("requirementAt — UK pub", () => {
  it("7 → 7 or lower regardless of what's beneath", () => {
    expect(requirementAt(plays("Kh", "7s"), ukpub)).toEqual({ kind: "max", rank: "7" });
    expect(requirementAt(plays("7s"), ukpub)).toEqual({ kind: "max", rank: "7" });
    expect(requirementAt(plays("4h", "7s"), ukpub)).toEqual({ kind: "max", rank: "7" });
  });

  it("3 is transparent: beat the card beneath", () => {
    expect(requirementAt(plays("Kh", "3s"), ukpub)).toEqual({ kind: "min", rank: "K" });
    expect(requirementAt(plays("3s"), ukpub)).toEqual({ kind: "any" });
    expect(requirementAt(plays("3s", "3d"), ukpub)).toEqual({ kind: "any" });
  });

  it("3 on a 7 keeps the 7's restriction", () => {
    expect(requirementAt(plays("Kh", "7s", "3d"), ukpub)).toEqual({ kind: "max", rank: "7" });
  });

  it("8 is not transparent in UK pub", () => {
    expect(requirementAt(plays("5h", "8s"), ukpub)).toEqual({ kind: "min", rank: "8" });
  });
});

describe("requirementAt — Millybims", () => {
  it("K then 7 → K or lower", () => {
    expect(requirementAt(plays("Kh", "7s"), millybims)).toEqual({ kind: "max", rank: "K" });
  });

  it("K, 7, 7 (played separately) → 7 or lower", () => {
    expect(requirementAt(plays("Kh", "7s", "7d"), millybims)).toEqual({ kind: "max", rank: "7" });
  });

  it("two 7s played together on a K → K or lower", () => {
    expect(requirementAt(plays("Kh", "7s 7d"), millybims)).toEqual({ kind: "max", rank: "K" });
  });

  it("7 on an empty pile → 7 or lower", () => {
    expect(requirementAt(plays("7s"), millybims)).toEqual({ kind: "max", rank: "7" });
  });

  it("7 on a 2 → anything", () => {
    expect(requirementAt(plays("2h", "7s"), millybims)).toEqual({ kind: "any" });
  });

  it("7 on a 4 → 4 or lower", () => {
    expect(requirementAt(plays("4h", "7s"), millybims)).toEqual({ kind: "max", rank: "4" });
  });

  it("K, 8 (invisible), 7 → K or lower", () => {
    expect(requirementAt(plays("Kh", "8c", "7s"), millybims)).toEqual({ kind: "max", rank: "K" });
  });

  it("K, 7, 8 → the 8 passes the 7's restriction through", () => {
    expect(requirementAt(plays("Kh", "7s", "8c"), millybims)).toEqual({ kind: "max", rank: "K" });
  });

  it("K, 7, 4 → 4 or higher (normal play resumes)", () => {
    expect(requirementAt(plays("Kh", "7s", "4c"), millybims)).toEqual({ kind: "min", rank: "4" });
  });

  it("only 8s on the pile → anything", () => {
    expect(requirementAt(plays("8c", "8d"), millybims)).toEqual({ kind: "any" });
  });

  it("7 on top of only 8s → 7 or lower", () => {
    expect(requirementAt(plays("8c", "7s"), millybims)).toEqual({ kind: "max", rank: "7" });
  });

  it("3 is an ordinary card in Millybims", () => {
    expect(requirementAt(plays("Kh", "3s"), millybims)).toEqual({ kind: "min", rank: "3" });
  });
});

describe("canPlayRank", () => {
  it("min requirement: equal or higher, plus wilds", () => {
    expect(legal({ kind: "min", rank: "J" }, standard)).toEqual(["2", "10", "J", "Q", "K", "A"]);
  });

  it("max requirement: equal or lower, plus wilds", () => {
    expect(legal({ kind: "max", rank: "7" }, ukpub)).toEqual(["2", "3", "4", "5", "6", "7", "10"]);
  });

  it("UK pub: 8 must obey a max-7 (it is not wild)", () => {
    expect(canPlayRank("8", { kind: "max", rank: "7" }, ukpub)).toBe(false);
  });

  it("Millybims: 7 and 8 ignore any requirement", () => {
    expect(canPlayRank("7", { kind: "min", rank: "K" }, millybims)).toBe(true);
    expect(canPlayRank("8", { kind: "max", rank: "3" }, millybims)).toBe(true);
    expect(canPlayRank("9", { kind: "max", rank: "3" }, millybims)).toBe(false);
  });

  it("any requirement: everything", () => {
    expect(legal({ kind: "any" }, standard)).toEqual(ALL_RANKS);
  });

  it("equal rank satisfies min", () => {
    expect(canPlayRank("9", { kind: "min", rank: "9" }, standard)).toBe(true);
  });
});

describe("hasFourOfAKindOnTop", () => {
  it("four played together", () => {
    expect(hasFourOfAKindOnTop(plays("Kh", "9s 9d 9c 9h"))).toBe(true);
  });

  it("completed across plays", () => {
    expect(hasFourOfAKindOnTop(plays("9s", "9d 9c", "9h"))).toBe(true);
  });

  it("three is not enough", () => {
    expect(hasFourOfAKindOnTop(plays("9s", "9d 9c"))).toBe(false);
  });

  it("a different rank in between breaks the run", () => {
    expect(hasFourOfAKindOnTop(plays("9s 9d", "8c", "9c 9h"))).toBe(false);
  });

  it("four 2s or four 8s count too", () => {
    expect(hasFourOfAKindOnTop(plays("2s 2d 2c 2h"))).toBe(true);
    expect(hasFourOfAKindOnTop(plays("Kh", "8s 8d", "8c 8h"))).toBe(true);
  });

  it("fewer than four cards", () => {
    expect(hasFourOfAKindOnTop([])).toBe(false);
    expect(hasFourOfAKindOnTop(plays("Kh"))).toBe(false);
  });
});

describe("formatRequirement", () => {
  it("labels", () => {
    expect(formatRequirement({ kind: "any" })).toBe("Anything goes");
    expect(formatRequirement({ kind: "min", rank: "9" })).toBe("Play 9 or higher");
    expect(formatRequirement({ kind: "max", rank: "K" })).toBe("Play King or lower");
  });
});

describe("testkit card codes", () => {
  it("parses ranks and suits", () => {
    expect(c("10h")).toEqual({ suit: "hearts", rank: "10" });
    expect(c("As")).toEqual({ suit: "spades", rank: "A" });
  });
});
