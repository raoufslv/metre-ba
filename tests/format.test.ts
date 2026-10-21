import { describe, expect, it } from "vitest";
import { formatNumber, formatPlain, formatQty, roundTo } from "../src/lib/format";

describe("format", () => {
  it("arrondit sans produire -0", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-0.001, 2)).toBe(0);
    expect(roundTo(-1.235, 2)).toBe(-1.24);
  });

  it("formate à la française", () => {
    expect(formatNumber(1234.5, 2)).toBe("1\u202f234,50");
    expect(formatNumber(1234.5, 2, false)).toBe("1234,50");
    expect(formatNumber(Number.NaN, 2)).toBe("—");
    expect(formatQty(-33.6, "kg")).toBe("-34 kg");
    expect(formatQty(2, "u")).toBe("2 u");
  });

  it("formate pour les exports texte", () => {
    expect(formatPlain(5.4, 3, true)).toBe("5,400");
    expect(formatPlain(5.4, 2, false)).toBe("5.40");
  });
});
