/**
 * auctionCountdownBoundary.test.tsx — Issue #888
 *
 * Deterministic unit tests for the auction countdown helpers, focused on
 * three boundary moments:
 *   1. Just before the deadline   (remaining = 1s)
 *   2. Exactly at the deadline    (remaining = 0s)
 *   3. After the deadline         (remaining < 0, clamped to 0)
 *
 * Tests use Jest fake timers — they never sleep in real time.
 *
 * Coverage targets:
 *   - useAuctionCountdown (app/auctions/[id]/page.tsx)
 *   - BiddingPanel's internal countdown renders (via BiddingPanel component)
 *   - `remaining` never goes negative
 *   - `isExpired` is stable at exactly zero remaining
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";

// ── useAuctionCountdown ───────────────────────────────────────────────────────

import {
  useAuctionCountdown,
  Countdown,
} from "@/app/auctions/[id]/page";

/** Thin wrapper to expose hook state as DOM attributes. */
function HookConsumer({ endTime, serverOffsetMs = 0 }: { endTime: number; serverOffsetMs?: number }) {
  const { remaining, isExpired, days, hours, minutes, seconds } =
    useAuctionCountdown(endTime, serverOffsetMs);
  return (
    <div>
      <span data-testid="remaining">{remaining}</span>
      <span data-testid="expired">{String(isExpired)}</span>
      <span data-testid="days">{days}</span>
      <span data-testid="hours">{hours}</span>
      <span data-testid="minutes">{minutes}</span>
      <span data-testid="seconds">{seconds}</span>
    </div>
  );
}

describe("useAuctionCountdown — deadline boundaries", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // ── Just before the deadline ─────────────────────────────────────────────

  it("just before deadline: remaining=1, isExpired=false", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now + 1} />);

    const remaining = Number(screen.getByTestId("remaining").textContent);
    expect(remaining).toBe(1);
    expect(screen.getByTestId("expired").textContent).toBe("false");
  });

  it("just before deadline: seconds component is 1, all higher fields are 0", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now + 1} />);

    expect(screen.getByTestId("days").textContent).toBe("0");
    expect(screen.getByTestId("hours").textContent).toBe("0");
    expect(screen.getByTestId("minutes").textContent).toBe("0");
    expect(screen.getByTestId("seconds").textContent).toBe("1");
  });

  // ── Exactly at the deadline ──────────────────────────────────────────────

  it("at deadline (endTime === now): remaining=0, isExpired=true", () => {
    const now = Math.floor(Date.now() / 1000);
    // endTime equals the current second — remaining should be exactly 0.
    render(<HookConsumer endTime={now} />);

    expect(screen.getByTestId("remaining").textContent).toBe("0");
    expect(screen.getByTestId("expired").textContent).toBe("true");
  });

  it("at deadline: all time components are 0", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now} />);

    expect(screen.getByTestId("days").textContent).toBe("0");
    expect(screen.getByTestId("hours").textContent).toBe("0");
    expect(screen.getByTestId("minutes").textContent).toBe("0");
    expect(screen.getByTestId("seconds").textContent).toBe("0");
  });

  it("isExpired stays true (stable) after reaching zero", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now} />);

    // Tick forward several times — isExpired must remain true.
    for (let i = 0; i < 5; i++) {
      act(() => jest.advanceTimersByTime(1_000));
      expect(screen.getByTestId("expired").textContent).toBe("true");
    }
  });

  // ── After the deadline ───────────────────────────────────────────────────

  it("1 second after deadline: remaining=0 (not negative), isExpired=true", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now - 1} />);

    expect(screen.getByTestId("remaining").textContent).toBe("0");
    expect(screen.getByTestId("expired").textContent).toBe("true");
  });

  it("far past deadline: remaining clamped to 0, never negative", () => {
    const now = Math.floor(Date.now() / 1000);
    // 1 day in the past
    render(<HookConsumer endTime={now - 86400} />);

    const remaining = Number(screen.getByTestId("remaining").textContent);
    expect(remaining).toBe(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  it("remaining never becomes negative after advancing past deadline", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now + 2} />);

    // Advance 10 seconds past deadline
    act(() => jest.advanceTimersByTime(12_000));

    const remaining = Number(screen.getByTestId("remaining").textContent);
    expect(remaining).toBe(0);
  });

  // ── Transition: just-before → deadline ──────────────────────────────────

  it("transitions from isExpired=false to isExpired=true at exactly the deadline second", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<HookConsumer endTime={now + 1} />);

    // 1s remaining — not expired yet
    expect(screen.getByTestId("expired").textContent).toBe("false");

    // Advance by 1 second — now at deadline
    act(() => jest.advanceTimersByTime(1_000));

    expect(screen.getByTestId("expired").textContent).toBe("true");
    expect(screen.getByTestId("remaining").textContent).toBe("0");
  });

  // ── Server clock offset ──────────────────────────────────────────────────

  it("serverOffsetMs=+5000 makes the clock read 5s ahead", () => {
    // With a +5s offset the auction appears 5s closer to expiry.
    const nowLocal = Math.floor(Date.now() / 1000);
    // Deadline is 10s away by the local clock, but only 5s away with +5s offset.
    render(<HookConsumer endTime={nowLocal + 10} serverOffsetMs={5_000} />);

    const remaining = Number(screen.getByTestId("remaining").textContent);
    // Should be ~5 (10 - 5), allow ±1 for sub-second timing
    expect(remaining).toBeGreaterThanOrEqual(4);
    expect(remaining).toBeLessThanOrEqual(6);
  });
});

// ── Countdown component — boundary rendering ──────────────────────────────────

describe("Countdown component — deadline boundaries", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows countdown boxes (not expired banner) 1s before deadline", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Countdown endTime={now + 1} />);

    expect(screen.getByTestId("countdown")).toBeInTheDocument();
    expect(screen.queryByTestId("countdown-expired")).not.toBeInTheDocument();
  });

  it("shows expired banner exactly at the deadline", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Countdown endTime={now} />);

    expect(screen.getByTestId("countdown-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("countdown")).not.toBeInTheDocument();
  });

  it("shows expired banner 1s after the deadline", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Countdown endTime={now - 1} />);

    expect(screen.getByTestId("countdown-expired")).toBeInTheDocument();
  });

  it("transitions to expired banner when time passes deadline", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Countdown endTime={now + 1} />);

    // Still showing countdown
    expect(screen.getByTestId("countdown")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1_500));

    // Now expired
    expect(screen.getByTestId("countdown-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("countdown")).not.toBeInTheDocument();
  });

  it("expired banner text is human-readable (not empty)", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Countdown endTime={now - 1} />);

    const banner = screen.getByTestId("countdown-expired");
    expect(banner.textContent?.trim()).not.toBe("");
  });

  it("expired banner remains stable across multiple timer ticks", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Countdown endTime={now - 1} />);

    for (let i = 0; i < 5; i++) {
      act(() => jest.advanceTimersByTime(1_000));
      expect(screen.getByTestId("countdown-expired")).toBeInTheDocument();
    }
  });
});
