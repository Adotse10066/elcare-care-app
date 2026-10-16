/**
 * Tests for ProvenanceTimeline (Issue #99, Issue #908).
 *
 * Covers:
 * - Loading state
 * - Error state
 * - Empty history
 * - Rendering multiple event types with correct labels
 * - Actor profile links
 * - Transaction explorer links (present for real hashes, absent for ledger_ ids)
 * - Chronological ordering
 * - Load more / pagination
 * - Accessibility: event label availability and decorative icon semantics (Issue #908)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProvenanceTimeline, ProvenanceTimelineProps } from "@/components/ProvenanceTimeline";
import { ActivityEvent } from "@/lib/indexer";

// ── Mock Next.js Link ─────────────────────────────────────────────────────────
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

// ── Mock config for explorer URL ──────────────────────────────────────────────
jest.mock("@/lib/config", () => ({
  config: { network: "testnet", contractId: "CONTRACT123" },
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const ADDR_A = "GABC1234567890123456789012345678901234567890123456789012";
const ADDR_B = "GXYZ1234567890123456789012345678901234567890123456789012";

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "evt_1",
    type: "LISTED",
    listing_id: 1,
    title: "Test Artwork",
    price: "100",
    timestamp: 1_700_000_000_000,
    from: ADDR_A,
    to: ADDR_B,
    tx_hash: "abc123txhash",
    ...overrides,
  };
}

const defaultProps: ProvenanceTimelineProps = {
  events: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  hasMore: false,
  onLoadMore: jest.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ProvenanceTimeline", () => {
  describe("loading state", () => {
    it("renders a loading indicator when isLoading is true", () => {
      render(<ProvenanceTimeline {...defaultProps} isLoading />);
      expect(screen.getByTestId("timeline-loading")).toBeInTheDocument();
      expect(screen.queryByTestId("timeline-root")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders the error message when error is provided", () => {
      render(
        <ProvenanceTimeline {...defaultProps} error="Failed to fetch history" />
      );
      expect(screen.getByTestId("timeline-error")).toBeInTheDocument();
      expect(screen.getByText("Failed to fetch history")).toBeInTheDocument();
    });
  });

  describe("empty history", () => {
    it("renders the empty state when events is an empty array", () => {
      render(<ProvenanceTimeline {...defaultProps} events={[]} />);
      expect(screen.getByTestId("timeline-empty")).toBeInTheDocument();
      expect(
        screen.getByText(/no activity recorded yet/i)
      ).toBeInTheDocument();
    });
  });

  describe("event rendering", () => {
    const eventTypes: Array<[ActivityEvent["type"], string]> = [
      ["LISTED", "Created listing"],
      ["OFFER_SUBMITTED", "Submitted an offer"],
      ["OFFER_ACCEPTED", "Accepted an offer"],
      ["PURCHASE", "Purchased listing"],
      ["SALE", "Sold listing"],
      ["ROYALTY", "Royalty distributed"],
      ["CANCELLED", "Listing cancelled"],
      ["TRANSFER", "Transferred ownership"],
    ];

    it.each(eventTypes)(
      "renders %s event with label '%s'",
      (type, expectedLabel) => {
        render(
          <ProvenanceTimeline
            {...defaultProps}
            events={[makeEvent({ id: `evt_${type}`, type })]}
          />
        );
        expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      }
    );

    it("renders multiple events", () => {
      const events: ActivityEvent[] = [
        makeEvent({ id: "e1", type: "LISTED" }),
        makeEvent({ id: "e2", type: "OFFER_SUBMITTED" }),
        makeEvent({ id: "e3", type: "PURCHASE" }),
      ];
      render(<ProvenanceTimeline {...defaultProps} events={events} />);
      expect(screen.getByText("Created listing")).toBeInTheDocument();
      expect(screen.getByText("Submitted an offer")).toBeInTheDocument();
      expect(screen.getByText("Purchased listing")).toBeInTheDocument();
    });

    it("renders events in the order provided (chronological)", () => {
      const events: ActivityEvent[] = [
        makeEvent({ id: "e1", type: "LISTED", timestamp: 1_000_000 }),
        makeEvent({ id: "e2", type: "OFFER_SUBMITTED", timestamp: 2_000_000 }),
        makeEvent({ id: "e3", type: "PURCHASE", timestamp: 3_000_000 }),
      ];
      render(<ProvenanceTimeline {...defaultProps} events={events} />);

      const items = screen.getAllByRole("listitem");
      expect(items[0]).toHaveAttribute(
        "data-testid",
        "timeline-event-LISTED"
      );
      expect(items[1]).toHaveAttribute(
        "data-testid",
        "timeline-event-OFFER_SUBMITTED"
      );
      expect(items[2]).toHaveAttribute(
        "data-testid",
        "timeline-event-PURCHASE"
      );
    });
  });

  describe("actor profile links", () => {
    it("renders a link to the from actor's profile page", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ from: ADDR_A, to: "—" })]}
        />
      );
      const links = screen.getAllByTestId("actor-link");
      expect(links[0]).toHaveAttribute("href", `/profile/${ADDR_A}`);
    });

    it("renders links for both from and to when they differ", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ from: ADDR_A, to: ADDR_B })]}
        />
      );
      const links = screen.getAllByTestId("actor-link");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", `/profile/${ADDR_A}`);
      expect(links[1]).toHaveAttribute("href", `/profile/${ADDR_B}`);
    });

    it("renders '—' text when actor address is missing", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ from: "—", to: "—" })]}
        />
      );
      // No actor links rendered
      expect(screen.queryByTestId("actor-link")).not.toBeInTheDocument();
    });
  });

  describe("transaction explorer links", () => {
    it("renders an explorer link for a real tx hash", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ tx_hash: "realhash123" })]}
        />
      );
      const txLink = screen.getByTestId("tx-link");
      expect(txLink).toHaveAttribute(
        "href",
        "https://horizon-testnet.stellar.org/transactions/realhash123"
      );
      expect(txLink).toHaveAttribute("target", "_blank");
      expect(txLink).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("does not render an explorer link for ledger_ placeholder hashes", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ tx_hash: "ledger_123456" })]}
        />
      );
      expect(screen.queryByTestId("tx-link")).not.toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("renders 'Load more' button when hasMore is true", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent()]}
          hasMore
        />
      );
      expect(screen.getByTestId("load-more-button")).toBeInTheDocument();
    });

    it("does not render 'Load more' when hasMore is false", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent()]}
          hasMore={false}
        />
      );
      expect(screen.queryByTestId("load-more-button")).not.toBeInTheDocument();
    });

    it("calls onLoadMore when the button is clicked", () => {
      const onLoadMore = jest.fn();
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent()]}
          hasMore
          onLoadMore={onLoadMore}
        />
      );
      fireEvent.click(screen.getByTestId("load-more-button"));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it("disables the button and shows loading text while isLoadingMore", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent()]}
          hasMore
          isLoadingMore
        />
      );
      const btn = screen.getByTestId("load-more-button");
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent(/loading/i);
    });
  });

  // ── Issue #908 — accessibility: text alternatives & decorative icon semantics ──

  describe("accessibility (Issue #908)", () => {
    it("every timeline event has a readable text label visible in the DOM", () => {
      const events: ActivityEvent[] = [
        makeEvent({ id: "e1", type: "LISTED" }),
        makeEvent({ id: "e2", type: "OFFER_SUBMITTED" }),
        makeEvent({ id: "e3", type: "PURCHASE" }),
        makeEvent({ id: "e4", type: "TRANSFER" }),
        makeEvent({ id: "e5", type: "CANCELLED" }),
      ];
      render(<ProvenanceTimeline {...defaultProps} events={events} />);

      expect(screen.getByText("Created listing")).toBeInTheDocument();
      expect(screen.getByText("Submitted an offer")).toBeInTheDocument();
      expect(screen.getByText("Purchased listing")).toBeInTheDocument();
      expect(screen.getByText("Transferred ownership")).toBeInTheDocument();
      expect(screen.getByText("Listing cancelled")).toBeInTheDocument();
    });

    it("the event icon bubble is hidden from assistive technology", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ id: "e1", type: "LISTED" })]}
        />
      );
      // The icon bubble wrapper carries aria-hidden="true" so the SVG icon
      // inside is not announced — confirm the bubble is not reachable by role.
      const listitem = screen.getByTestId("timeline-event-LISTED");
      // aria-hidden elements must not appear in the accessibility tree.
      // We verify by querying all aria-hidden children of the list item.
      const hiddenBubble = listitem.querySelector('[aria-hidden="true"]');
      expect(hiddenBubble).not.toBeNull();
    });

    it("icon bubble does not expose an accessible name that duplicates the event label", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ id: "e1", type: "MINT" as any })]}
        />
      );
      const listitem = screen.getByTestId("timeline-event-MINT");
      // Confirm the event label text is present once as visible text
      expect(screen.getByText("Minted artwork")).toBeInTheDocument();
      // The icon bubble is aria-hidden — it must not carry an aria-label
      // that would re-announce the action.
      const bubble = listitem.querySelector('[aria-hidden="true"]');
      expect(bubble).not.toHaveAttribute("aria-label");
    });

    it("ConfirmationBadge 'Confirmed' label is readable and its icon is aria-hidden", () => {
      const event = { ...makeEvent(), confirmed: true } as any;
      render(
        <ProvenanceTimeline {...defaultProps} events={[event]} />
      );
      const badge = screen.getByTestId("badge-confirmed");
      // Visible text label is present
      expect(badge).toHaveTextContent("Confirmed");
      // The SVG icon inside the badge is aria-hidden
      const icon = badge.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("ConfirmationBadge 'Pending' label is readable and its icon is aria-hidden", () => {
      const event = { ...makeEvent(), confirmed: false } as any;
      render(
        <ProvenanceTimeline {...defaultProps} events={[event]} />
      );
      const badge = screen.getByTestId("badge-pending");
      expect(badge).toHaveTextContent("Pending");
      const icon = badge.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("TxLink external icon is aria-hidden so the link text is not duplicated", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent({ tx_hash: "realhash123" })]}
        />
      );
      const txLink = screen.getByTestId("tx-link");
      const icon = txLink.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("empty-state decorative icon is aria-hidden", () => {
      render(<ProvenanceTimeline {...defaultProps} events={[]} />);
      const emptyContainer = screen.getByTestId("timeline-empty");
      const icon = emptyContainer.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      // The descriptive text label is still present
      expect(screen.getByText(/no activity recorded yet/i)).toBeInTheDocument();
    });

    it("reorg banner icons are aria-hidden while the alert text is readable", () => {
      render(
        <ProvenanceTimeline
          {...defaultProps}
          events={[makeEvent()]}
          reorgDetected
          onRefresh={jest.fn()}
        />
      );
      const banner = screen.getByTestId("reorg-banner");
      // Both decorative SVGs inside the banner are aria-hidden
      const icons = banner.querySelectorAll("svg[aria-hidden='true']");
      expect(icons.length).toBeGreaterThanOrEqual(2);
      // The human-readable alert text is present
      expect(
        screen.getByText(/chain reorganization detected/i)
      ).toBeInTheDocument();
    });

    it("event ordering and content are unchanged after accessibility fix", () => {
      const events: ActivityEvent[] = [
        makeEvent({ id: "e1", type: "LISTED", timestamp: 1_000_000 }),
        makeEvent({ id: "e2", type: "OFFER_SUBMITTED", timestamp: 2_000_000 }),
        makeEvent({ id: "e3", type: "PURCHASE", timestamp: 3_000_000 }),
      ];
      render(<ProvenanceTimeline {...defaultProps} events={events} />);

      const items = screen.getAllByRole("listitem");
      expect(items[0]).toHaveAttribute("data-testid", "timeline-event-LISTED");
      expect(items[1]).toHaveAttribute("data-testid", "timeline-event-OFFER_SUBMITTED");
      expect(items[2]).toHaveAttribute("data-testid", "timeline-event-PURCHASE");

      // Labels are all still present
      expect(screen.getByText("Created listing")).toBeInTheDocument();
      expect(screen.getByText("Submitted an offer")).toBeInTheDocument();
      expect(screen.getByText("Purchased listing")).toBeInTheDocument();
    });
  });
});
