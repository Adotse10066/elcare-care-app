/**
 * OfferStatusBadge.test.tsx — Issue #889
 *
 * Verifies that every supported OfferUIStatus renders a non-empty visible
 * text label, that an unknown status falls back gracefully, and that the
 * existing status→colour mapping is not regressed.
 *
 * Tests are purely visual/DOM — no contract or wallet mocks needed.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  OfferStatusBadge,
  getOfferStatusBadgeClass,
  getOfferStatusExplanation,
} from "@/components/OfferStatusBadge";
import type { OfferUIStatus } from "@/lib/contract";

// All statuses the type currently enumerates, plus an unknown one for the
// fallback path.
const KNOWN_STATUSES: OfferUIStatus[] = [
  "Pending",
  "Accepted",
  "Rejected",
  "Withdrawn",
  "Expired",
  "Stale",
];

// ── Label rendering ───────────────────────────────────────────────────────────

describe("OfferStatusBadge — text label", () => {
  it.each(KNOWN_STATUSES)(
    'renders a non-empty visible text label for "%s"',
    (status) => {
      render(
        <OfferStatusBadge
          uiStatus={status}
          data-testid={`badge-${status}`}
        />
      );
      const badge = screen.getByTestId(`badge-${status}`);
      expect(badge.textContent?.trim()).not.toBe("");
      // The text content should be the status name (case-insensitive match).
      expect(badge.textContent?.trim().toLowerCase()).toBe(status.toLowerCase());
    }
  );

  it("renders a non-empty badge for an unknown/fallback status value", () => {
    // Cast to bypass TS so we can test the runtime default branch.
    const unknown = "Unknown" as OfferUIStatus;
    render(<OfferStatusBadge uiStatus={unknown} data-testid="badge-unknown" />);
    const badge = screen.getByTestId("badge-unknown");
    // The badge must render something — not blank.
    expect(badge).toBeInTheDocument();
    expect(badge.textContent?.trim()).not.toBe("");
  });
});

// ── a11y title attribute ──────────────────────────────────────────────────────

describe("OfferStatusBadge — title (tooltip / a11y explanation)", () => {
  it.each(KNOWN_STATUSES)(
    'sets a non-empty title attribute for "%s"',
    (status) => {
      render(
        <OfferStatusBadge
          uiStatus={status}
          data-testid={`badge-title-${status}`}
        />
      );
      const badge = screen.getByTestId(`badge-title-${status}`);
      const title = badge.getAttribute("title") ?? "";
      expect(title.trim()).not.toBe("");
    }
  );
});

// ── getOfferStatusExplanation ─────────────────────────────────────────────────

describe("getOfferStatusExplanation", () => {
  it.each(KNOWN_STATUSES)(
    'returns a non-empty explanation for "%s"',
    (status) => {
      const explanation = getOfferStatusExplanation(status);
      expect(typeof explanation).toBe("string");
      expect(explanation.trim().length).toBeGreaterThan(0);
    }
  );

  it("returns an empty string (not an error) for an unknown status", () => {
    const result = getOfferStatusExplanation("Unknown" as OfferUIStatus);
    // Default branch returns "" — callers treat it as no explanation available.
    expect(typeof result).toBe("string");
  });

  it("explanation for Accepted mentions listing or sale", () => {
    const text = getOfferStatusExplanation("Accepted").toLowerCase();
    expect(text).toMatch(/accept|sold|listing/);
  });

  it("explanation for Rejected mentions rejection or refund", () => {
    const text = getOfferStatusExplanation("Rejected").toLowerCase();
    expect(text).toMatch(/reject|refund/);
  });

  it("explanation for Withdrawn mentions withdrawal or reclaim", () => {
    const text = getOfferStatusExplanation("Withdrawn").toLowerCase();
    expect(text).toMatch(/withdraw|reclaim|escrow/);
  });

  it("explanation for Expired mentions expiry or reclaim", () => {
    const text = getOfferStatusExplanation("Expired").toLowerCase();
    expect(text).toMatch(/expir|reclaim/);
  });

  it("explanation for Pending mentions awaiting or response", () => {
    const text = getOfferStatusExplanation("Pending").toLowerCase();
    expect(text).toMatch(/await|response|owner/);
  });

  it("does NOT imply an off-chain action can override contract state for terminal statuses", () => {
    // Terminal statuses must not imply the user can do something to undo them.
    const terminal: OfferUIStatus[] = ["Accepted", "Rejected", "Withdrawn"];
    for (const s of terminal) {
      const text = getOfferStatusExplanation(s).toLowerCase();
      // Should not suggest "cancel", "undo", "override"
      expect(text).not.toMatch(/cancel|undo|override/);
    }
  });
});

// ── getOfferStatusBadgeClass — colour mapping preserved ──────────────────────

describe("getOfferStatusBadgeClass — colour mapping not regressed", () => {
  const expected: Record<OfferUIStatus, string[]> = {
    Pending:   ["brand-500"],
    Accepted:  ["mint-500"],
    Rejected:  ["terracotta-500"],
    Withdrawn: ["white/5"],
    Expired:   ["amber-500"],
    Stale:     ["yellow-500"],
  };

  it.each(Object.entries(expected) as [OfferUIStatus, string[]][])(
    'badge class for "%s" includes expected colour token',
    (status, tokens) => {
      const cls = getOfferStatusBadgeClass(status);
      for (const token of tokens) {
        expect(cls).toContain(token);
      }
    }
  );

  it("unknown status falls back to the neutral/white class", () => {
    const cls = getOfferStatusBadgeClass("Unknown" as OfferUIStatus);
    expect(cls).toContain("white/5");
  });
});

// ── size variants ─────────────────────────────────────────────────────────────

describe("OfferStatusBadge — size variants", () => {
  it('size="lg" applies px-4 class', () => {
    render(
      <OfferStatusBadge
        uiStatus="Pending"
        size="lg"
        data-testid="badge-lg"
      />
    );
    const badge = screen.getByTestId("badge-lg");
    expect(badge.className).toContain("px-4");
  });

  it('size="sm" applies px-3 class', () => {
    render(
      <OfferStatusBadge
        uiStatus="Pending"
        size="sm"
        data-testid="badge-sm"
      />
    );
    const badge = screen.getByTestId("badge-sm");
    expect(badge.className).toContain("px-3");
  });

  it("defaults to size lg when size prop is omitted", () => {
    render(
      <OfferStatusBadge
        uiStatus="Accepted"
        data-testid="badge-default"
      />
    );
    const badge = screen.getByTestId("badge-default");
    expect(badge.className).toContain("px-4");
  });
});
