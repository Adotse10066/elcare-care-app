/**
 * offerWithdrawReason.test.tsx — Issue #891
 *
 * Verifies that:
 *   1. Non-withdrawable offers (Accepted, Rejected, Withdrawn) display a
 *      concise status explanation derived from offer state — not an action button.
 *   2. Pending offers still show the Withdraw button.
 *   3. Expired offers still show the Reclaim button.
 *   4. The explanation text does NOT imply an off-chain action can override
 *      contract state.
 *
 * Uses unit-level rendering of the OffersPage component with minimal mocks.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@/context/WalletContext", () => ({
  useWalletContext: () => ({
    publicKey: "GPUBKEY",
    isConnected: true,
    isWrongNetwork: false,
    status: "connected",
    connect: jest.fn(),
    disconnect: jest.fn(),
    refresh: jest.fn(),
    isInstalled: true,
    isConnecting: false,
    error: null,
    networkPassphrase: null,
  }),
}));

jest.mock("@/components/WalletGuard", () => ({
  WalletGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/ConnectWalletModal", () => ({
  ConnectWalletModal: () => null,
}));

jest.mock("@/components/PageStates", () => ({
  ResourceState: ({ isEmpty, empty, children }: any) => {
    if (isEmpty && empty) return <div>{empty.title}</div>;
    return <>{children}</>;
  },
}));

jest.mock("@/lib/pageState", () => ({
  categorizePageError: (_: unknown) => ({ message: String(_) }),
}));

jest.mock("@/config/tokens", () => ({
  SUPPORTED_TOKENS: [
    { symbol: "XLM", name: "Stellar Lumens", address: "CTOKEN_XLM", decimals: 7 },
  ],
}));

jest.mock("clsx", () => ({
  clsx: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

jest.mock("lucide-react", () => {
  const icon =
    (name: string) =>
    (props: Record<string, unknown>) =>
      <span data-testid={`icon-${name}`} />;
  return {
    ShoppingBag: icon("ShoppingBag"),
    Clock: icon("Clock"),
    CheckCircle: icon("CheckCircle"),
    XCircle: icon("XCircle"),
    ArrowUpRight: icon("ArrowUpRight"),
    History: icon("History"),
    Activity: icon("Activity"),
    TrendingUp: icon("TrendingUp"),
    Loader2: icon("Loader2"),
    Inbox: icon("Inbox"),
    CalendarClock: icon("CalendarClock"),
    Timer: icon("Timer"),
    Coins: icon("Coins"),
    AlertTriangle: icon("AlertTriangle"),
    X: icon("X"),
    ExternalLink: icon("ExternalLink"),
    AlertOctagon: icon("AlertOctagon"),
    AlertCircle: icon("AlertCircle"),
    RefreshCw: icon("RefreshCw"),
    Package: icon("Package"),
    SearchX: icon("SearchX"),
    ShieldAlert: icon("ShieldAlert"),
    FileQuestion: icon("FileQuestion"),
    ServerCrash: icon("ServerCrash"),
  };
});

// useOffers mock — use the `mock`-prefixed naming so jest.mock hoisting allows it.
const mockWithdraw = jest.fn();
const mockReclaim = jest.fn();
const mockRefresh = jest.fn();
const mockAddOfferMutation = jest.fn().mockReturnValue("pending-id");
const mockGetOfferState = jest.fn().mockReturnValue({ data: null });
const mockResolveMutation = jest.fn();
const mockRejectMutation = jest.fn();

// Mutable offers array — accessed via the mockGetReconciliationOffers getter.
// jest.mock hoisting only allows `mock`-prefixed names in the factory body.
const mockCurrentOffers: any[] = [];

jest.mock("@/hooks/useOffers", () => ({
  useOffersWithReconciliation: () => ({
    offers: mockCurrentOffers,
    isLoading: false,
    error: null,
    refresh: mockRefresh,
    addOfferMutation: mockAddOfferMutation,
    getOfferState: mockGetOfferState,
    resolveMutation: mockResolveMutation,
    rejectMutation: mockRejectMutation,
  }),
  useWithdrawOffer: () => ({
    withdraw: mockWithdraw,
    isWithdrawing: false,
    error: null,
  }),
  useReclaimOffer: () => ({
    reclaim: mockReclaim,
    isReclaiming: false,
  }),
}));

// Contract mock: deriveOfferUIStatus is a pure function — replicate the real
// logic with minimal dependencies so no full contract module is needed.
jest.mock("@/lib/contract", () => ({
  stroopsToXlm: (s: bigint) => String(Number(s) / 10_000_000),
  deriveOfferUIStatus: (offer: any, nowMs = Date.now()) => {
    if (
      offer.status === "Pending" &&
      offer.expires_at != null &&
      offer.expires_at * 1000 <= nowMs
    ) {
      return "Expired";
    }
    return offer.status;
  },
}));

import OffersPage from "@/app/offers/page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOffer(id: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    offer_id: id,
    listing_id: 1,
    offerer: "GOFFERER",
    amount: 5_000_000n,
    token: "CTOKEN_XLM",
    status,
    created_at: 1_700_000_000,
    ...extra,
  };
}

function setup(offers: any[]) {
  // Splice into the shared mock array (mutating it so the mock factory picks up
  // the new value on the next render).
  mockCurrentOffers.length = 0;
  mockCurrentOffers.push(...offers);
  jest.clearAllMocks();
  mockAddOfferMutation.mockReturnValue("pending-id");
  mockGetOfferState.mockReturnValue({ data: null });
  render(<OffersPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OffersPage — offer status explanation (issue #891)", () => {
  afterEach(() => {
    mockCurrentOffers.length = 0;
  });

  // ── Pending: Withdraw button shown ────────────────────────────────────────

  it("shows Withdraw button for a Pending offer", () => {
    setup([makeOffer(10, "Pending")]);
    expect(screen.getByTestId("withdraw-btn-10")).toBeInTheDocument();
    expect(screen.queryByTestId("offer-status-reason-10")).not.toBeInTheDocument();
  });

  // ── Expired: Reclaim button shown ─────────────────────────────────────────

  it("shows Reclaim button for an Expired offer (past expires_at)", () => {
    setup([makeOffer(20, "Pending", { expires_at: 1 })]);
    expect(screen.getByTestId("reclaim-btn-20")).toBeInTheDocument();
    expect(screen.queryByTestId("offer-status-reason-20")).not.toBeInTheDocument();
  });

  // ── Terminal statuses: explanatory text shown instead of action button ────

  it("shows explanatory text for an Accepted offer and no action button", () => {
    setup([makeOffer(30, "Accepted")]);

    // No action button
    expect(screen.queryByTestId("withdraw-btn-30")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reclaim-btn-30")).not.toBeInTheDocument();

    // Explanatory text present and non-empty
    const reason = screen.getByTestId("offer-status-reason-30");
    expect(reason).toBeInTheDocument();
    expect(reason.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("shows explanatory text for a Rejected offer and no action button", () => {
    setup([makeOffer(40, "Rejected")]);

    expect(screen.queryByTestId("withdraw-btn-40")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reclaim-btn-40")).not.toBeInTheDocument();

    const reason = screen.getByTestId("offer-status-reason-40");
    expect(reason).toBeInTheDocument();
    expect(reason.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("shows explanatory text for a Withdrawn offer and no action button", () => {
    setup([makeOffer(50, "Withdrawn")]);

    expect(screen.queryByTestId("withdraw-btn-50")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reclaim-btn-50")).not.toBeInTheDocument();

    const reason = screen.getByTestId("offer-status-reason-50");
    expect(reason).toBeInTheDocument();
    expect(reason.textContent?.trim().length).toBeGreaterThan(0);
  });

  // ── Explanation content does NOT suggest overriding contract state ────────

  it("Accepted explanation does not say 'cancel', 'undo', or 'override'", () => {
    setup([makeOffer(60, "Accepted")]);
    const text = screen.getByTestId("offer-status-reason-60").textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/cancel|undo|override/);
  });

  it("Rejected explanation does not say 'cancel', 'undo', or 'override'", () => {
    setup([makeOffer(70, "Rejected")]);
    const text = screen.getByTestId("offer-status-reason-70").textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/cancel|undo|override/);
  });

  it("Withdrawn explanation does not say 'cancel', 'undo', or 'override'", () => {
    setup([makeOffer(80, "Withdrawn")]);
    const text = screen.getByTestId("offer-status-reason-80").textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/cancel|undo|override/);
  });

  // ── All four terminal statuses together ───────────────────────────────────

  it("renders correct action UI for each status in a mixed list", () => {
    setup([
      makeOffer(91, "Pending"),
      makeOffer(92, "Accepted"),
      makeOffer(93, "Rejected"),
      makeOffer(94, "Withdrawn"),
      makeOffer(95, "Pending", { expires_at: 1 }), // expired
    ]);

    // Pending → Withdraw button
    expect(screen.getByTestId("withdraw-btn-91")).toBeInTheDocument();

    // Accepted → explanation
    expect(screen.getByTestId("offer-status-reason-92")).toBeInTheDocument();

    // Rejected → explanation
    expect(screen.getByTestId("offer-status-reason-93")).toBeInTheDocument();

    // Withdrawn → explanation
    expect(screen.getByTestId("offer-status-reason-94")).toBeInTheDocument();

    // Expired → Reclaim
    expect(screen.getByTestId("reclaim-btn-95")).toBeInTheDocument();
  });
});
