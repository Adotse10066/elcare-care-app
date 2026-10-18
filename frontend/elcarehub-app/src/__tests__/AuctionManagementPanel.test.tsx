import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCancel = jest.fn();

jest.mock("@/hooks/useAuctions", () => ({
  useCancelAuction: () => ({ cancel: mockCancel, isCancelling: false }),
  useEditAuctionBeforeFirstBid: () => ({
    save: jest.fn(),
    isSaving: false,
    progress: null,
    error: null,
  }),
  useRefundLosingBid: () => ({ refund: jest.fn(), isRefunding: false }),
}));

jest.mock("@/lib/contract", () => ({
  stroopsToXlm: (value: bigint) => String(Number(value) / 10_000_000),
}));

jest.mock("@/lib/indexer", () => ({
  getAuctionBidHistory: jest.fn(),
}));

jest.mock("@/config/tokens", () => ({
  DEFAULT_TOKEN: { address: "CTOKEN", decimals: 7, symbol: "XLM" },
}));

jest.mock("@/lib/validation", () => ({
  isValidStellarAddress: jest.fn(() => true),
}));

jest.mock("@/components/WalletGuard", () => ({
  GuardButton: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("lucide-react", () =>
  Object.fromEntries(
    ["AlertCircle", "Ban", "CheckCircle2", "Info", "Pencil", "Plus", "RefreshCw", "Trash2", "Wallet", "X"]
      .map((name) => [name, () => <span />])
  )
);

import { AuctionManagementPanel } from "@/components/AuctionManagementPanel";

function renderPanel(onChanged = jest.fn()) {
  const auction = {
    auction_id: 42,
    creator: "GCREATOR",
    artist: "GARTIST",
    metadata_cid: "Qm",
    collection: "CCOLLECTION",
    token_id: 1,
    token: "CTOKEN",
    created_at: 100,
    recipients: [],
    reserve_price: 10_000_000n,
    highest_bid: 0n,
    highest_bidder: null,
    end_time: 3_700,
    status: "Active" as const,
  } as React.ComponentProps<typeof AuctionManagementPanel>["auction"];

  render(
    <AuctionManagementPanel
      auction={auction}
      publicKey="GCREATOR"
      isExpired={false}
      isStale={false}
      onChanged={onChanged}
    />
  );

  return { onChanged };
}

describe("AuctionManagementPanel cancellation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("names the auction and dismisses without submitting a transaction", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId("cancel-auction-btn"));
    expect(screen.getByRole("heading", { name: "Cancel auction #42?" })).toBeInTheDocument();
    expect(screen.getByText(/cancel auction #42.*if the transaction confirms/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep auction" }));

    expect(mockCancel).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-cancel-auction-btn")).not.toBeInTheDocument();
  });

  it("waits for confirmed cancellation before reporting a change", async () => {
    let resolveCancel!: (success: boolean) => void;
    mockCancel.mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveCancel = resolve; })
    );
    const user = userEvent.setup();
    const { onChanged } = renderPanel();

    await user.click(screen.getByTestId("cancel-auction-btn"));
    await user.click(screen.getByTestId("confirm-cancel-auction-btn"));

    expect(mockCancel).toHaveBeenCalledWith(42);
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-cancel-auction-btn")).toBeInTheDocument();

    await act(async () => resolveCancel(true));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("admin-confirmation-modal")).not.toBeInTheDocument();
  });
});