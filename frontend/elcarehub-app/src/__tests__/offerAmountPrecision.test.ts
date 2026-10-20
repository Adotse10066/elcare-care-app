/**
 * offerAmountPrecision.test.ts — Issue #890
 *
 * Verifies that the offer (and counter-offer) amount path from user input to
 * contract invocation preserves integer base-unit precision, and that
 * invalid precision is caught with a field-level message.
 *
 * The path under test (MakeOfferModal in OfferPanel.tsx):
 *
 *   user string input
 *     → validateAmountInput(amount, token)        [rejects bad format / excess precision]
 *     → result.baseUnits (bigint)                 [exact, no float]
 *     → Number(baseToDisplay(result.baseUnits, token))  [boundary: only here is float used]
 *     → onSubmit(amountNum, tokenAddress, ...)
 *     → makeOffer(..., amountXlm: number, ...)
 *     → xlmToStroops(amountXlm)                   [string-based, recovers exact bigint]
 *
 * Tests confirm that:
 *   1. Fractional display amounts convert to the expected exact base units.
 *   2. Large amounts survive the round-trip without precision loss.
 *   3. Excess decimal places are rejected before any arithmetic.
 *   4. The xlmToStroops helper recovers the exact bigint from the
 *      Number-boundary re-expression for all amounts within safe range.
 */

import {
  validateAmountInput,
  baseToDisplay,
  decimalStringToBase,
  baseToDecimalString,
  MAX_I128,
} from "@/lib/amount";
import { xlmToStroops } from "@/lib/contract";
import type { TokenConfig } from "@/config/tokens";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const XLM: TokenConfig = {
  symbol: "XLM",
  name: "Stellar Lumens",
  address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  decimals: 7,
};

// Simulates the exact path the MakeOfferModal/offer form takes:
// input string → validate → bigint base units → display number → stroops
function simulateOfferAmountPath(
  input: string
): { baseUnits: bigint; amountNum: number; stroops: bigint } | { error: string } {
  const result = validateAmountInput(input, XLM);
  if (!result.valid || result.baseUnits === null) {
    return { error: result.message ?? "invalid" };
  }
  const amountNum = Number(baseToDisplay(result.baseUnits, XLM));
  const stroops = xlmToStroops(amountNum);
  return { baseUnits: result.baseUnits, amountNum, stroops };
}

// ── Fractional display amount → exact base units ──────────────────────────────

describe("offer amount precision — fractional inputs", () => {
  it("0.0000001 XLM (minimum stroop) converts to exactly 1n base unit", () => {
    const out = simulateOfferAmountPath("0.0000001");
    expect("error" in out).toBe(false);
    if ("baseUnits" in out) {
      expect(out.baseUnits).toBe(1n);
      expect(out.stroops).toBe(1n);
    }
  });

  it("1.55 XLM converts to exactly 15_500_000n base units", () => {
    const out = simulateOfferAmountPath("1.55");
    expect("error" in out).toBe(false);
    if ("baseUnits" in out) {
      expect(out.baseUnits).toBe(15_500_000n);
      expect(out.stroops).toBe(15_500_000n);
    }
  });

  it("0.1234567 XLM converts to exactly 1_234_567n base units", () => {
    const out = simulateOfferAmountPath("0.1234567");
    expect("error" in out).toBe(false);
    if ("baseUnits" in out) {
      expect(out.baseUnits).toBe(1_234_567n);
      expect(out.stroops).toBe(1_234_567n);
    }
  });

  it("50 XLM (whole number, no fraction) converts to 500_000_000n", () => {
    const out = simulateOfferAmountPath("50");
    expect("error" in out).toBe(false);
    if ("baseUnits" in out) {
      expect(out.baseUnits).toBe(500_000_000n);
      expect(out.stroops).toBe(500_000_000n);
    }
  });

  it("round-trips correctly for several representative fractional values", () => {
    const cases: [string, bigint][] = [
      ["0.5",       5_000_000n],
      ["1.0000001", 10_000_001n],
      ["99.9999999",999_999_999n],
      ["100",       1_000_000_000n],
    ];

    for (const [input, expectedBase] of cases) {
      const out = simulateOfferAmountPath(input);
      expect("error" in out).toBe(false);
      if ("baseUnits" in out) {
        expect(out.baseUnits).toBe(expectedBase);
        expect(out.stroops).toBe(expectedBase);
      }
    }
  });
});

// ── Large base-unit values ────────────────────────────────────────────────────

describe("offer amount precision — large values", () => {
  it("1_000_000 XLM (1M XLM) preserves exact base units through the path", () => {
    const out = simulateOfferAmountPath("1000000");
    expect("error" in out).toBe(false);
    if ("baseUnits" in out) {
      expect(out.baseUnits).toBe(10_000_000_000_000n);
      expect(out.stroops).toBe(10_000_000_000_000n);
    }
  });

  it("baseToDecimalString round-trips a large amount without precision loss", () => {
    // 100_000_000 XLM = 1e15 base units (within Number.MAX_SAFE_INTEGER = ~9e15)
    const base = 1_000_000_000_000_000n; // 100_000_000 XLM
    const display = baseToDecimalString(base, 7);
    expect(display).toBe("100000000");
    const back = decimalStringToBase(display, 7);
    expect(back).toBe(base);
  });

  it("xlmToStroops is stable for amounts that trigger FP drift in naive multiply", () => {
    // 0.1 * 10_000_000 = 999999.9999999 in naive float math.
    // xlmToStroops should produce exactly 1_000_000n.
    expect(xlmToStroops(0.1)).toBe(1_000_000n);
  });

  it("xlmToStroops is stable for 0.2 XLM (classic binary FP edge case)", () => {
    // 0.2 * 10_000_000 = 2000000.0000000004 in float.
    expect(xlmToStroops(0.2)).toBe(2_000_000n);
  });

  it("xlmToStroops is stable for 0.3 XLM (0.1 + 0.2 = 0.30000000000000004 in float)", () => {
    expect(xlmToStroops(0.3)).toBe(3_000_000n);
  });
});

// ── Invalid precision rejection ──────────────────────────────────────────────

describe("offer amount precision — invalid precision rejected", () => {
  it("rejects 8 decimal places for a 7-decimal token", () => {
    const result = validateAmountInput("1.00000001", XLM);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("TOO_MANY_DECIMALS");
  });

  it("rejected input carries a field-level explanation message", () => {
    const result = validateAmountInput("1.00000001", XLM);
    expect(typeof result.message).toBe("string");
    expect(result.message!.length).toBeGreaterThan(0);
    // Message should mention the supported number of decimal places.
    expect(result.message).toMatch(/7/);
  });

  it("rejects exponent notation (1e7) even though it is numerically valid", () => {
    const result = validateAmountInput("1e7", XLM);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("INVALID_FORMAT");
  });

  it("rejects negative amounts", () => {
    const result = validateAmountInput("-1", XLM);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("NEGATIVE");
  });

  it("rejects amounts above MAX_I128", () => {
    // Build a display string slightly above MAX_I128 in base units.
    const overMax = baseToDecimalString(MAX_I128 + 10_000_000n, 7);
    const result = validateAmountInput(overMax, XLM);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("OVERFLOW");
  });

  it("accepts exactly 7 decimal places", () => {
    const result = validateAmountInput("1.0000001", XLM);
    expect(result.valid).toBe(true);
    expect(result.baseUnits).toBe(10_000_001n);
  });
});

// ── decimalStringToBase boundary ─────────────────────────────────────────────

describe("decimalStringToBase — boundary", () => {
  it("parses the minimum stroop (0.0000001) without floating-point", () => {
    expect(decimalStringToBase("0.0000001", 7)).toBe(1n);
  });

  it("parses a trailing dot as zero fraction (1. → 10_000_000n)", () => {
    expect(decimalStringToBase("1.", 7)).toBe(10_000_000n);
  });

  it("rejects a value with more fraction digits than the token supports", () => {
    expect(decimalStringToBase("1.00000001", 7)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(decimalStringToBase("", 7)).toBeNull();
  });

  it("returns null for alphabetic input", () => {
    expect(decimalStringToBase("abc", 7)).toBeNull();
  });
});
