/**
 * __tests__/ExplorePage.pagination.test.tsx
 *
 * Issue #010: Boundary coverage for the listing results pagination.
 * Covers first page, middle page, and final page without a live indexer.
 * Verifies Previous/Next availability and that navigation preserves filters.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExplorePage from "@/app/explore/page";
import { fetchListings, getCollections } from "@/lib/indexer";
import { getAllListings } from "@/lib/contract";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@/components/ListingCard", () => ({
  ListingCard: ({ listing }: { listing: { listing_id: number | string } }) => (
    <div data-testid="listing-card" data-id={String(listing.listing_id)} />
  ),
}));

jest.mock("@/lib/indexer", () => ({
  fetchListings: jest.fn(),
  getCollections: jest.fn().mockResolvedValue({ collections: [] }),
}));

jest.mock("@/lib/contract", () => ({
  getAllListings: jest.fn().mockResolvedValue([]),
}));

const mockFilters = {
  search: "",
  status: "All",
  collection: [],
  minPrice: "",
  maxPrice: "",
  artist: "",
  sort: "newest",
};

const mockSyncToUrl = jest.fn();

jest.mock("@/hooks/useFilterUrlSync", () => ({
  useFilterUrlSync: () => ({
    initialFilters: mockFilters,
    initialPage: 1,
    syncToUrl: mockSyncToUrl,
  }),
}));

// jsdom does not implement window.scrollTo; the explore page calls it on navigation.
(window as any).scrollTo = jest.fn();

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

function makeListings(count: number, start = 1): { listing_id: number }[] {
  return Array.from({ length: count }, (_, i) => ({ listing_id: start + i }));
}

describe("ExplorePage pagination boundaries", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncToUrl.mockClear();
  });

  it("first page: Previous unavailable, Next available", async () => {
    (fetchListings as jest.Mock).mockResolvedValue({
      listings: makeListings(PAGE_SIZE),
      total: 30,
      nextCursor: "100",
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(PAGE_SIZE);
    });

    const prev = screen.getByRole("button", { name: /previous page/i });
    const next = screen.getByRole("button", { name: /next page/i });

    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("middle page: Previous and Next both available", async () => {
    (fetchListings as jest.Mock).mockImplementation((opts) => {
      if (opts.cursor_ledger === 100) {
        return Promise.resolve({
          listings: makeListings(PAGE_SIZE, 13),
          total: 30,
          nextCursor: "200",
        });
      }
      return Promise.resolve({
        listings: makeListings(PAGE_SIZE),
        total: 30,
        nextCursor: "100",
      });
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(PAGE_SIZE);
    });

    // Navigate to page 2
    await user.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(PAGE_SIZE);
      expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    });

    const prev = screen.getByRole("button", { name: /previous page/i });
    const next = screen.getByRole("button", { name: /next page/i });

    expect(prev).not.toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it("final page: Previous available, Next unavailable", async () => {
    (fetchListings as jest.Mock).mockImplementation((opts) => {
      if (opts.cursor_ledger === 200) {
        // Final page: fewer than PAGE_SIZE items, no next cursor
        return Promise.resolve({ listings: makeListings(6, 25), total: 30, nextCursor: "" });
      }
      if (opts.cursor_ledger === 100) {
        return Promise.resolve({
          listings: makeListings(PAGE_SIZE, 13),
          total: 30,
          nextCursor: "200",
        });
      }
      return Promise.resolve({
        listings: makeListings(PAGE_SIZE),
        total: 30,
        nextCursor: "100",
      });
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(PAGE_SIZE);
    });

    // Navigate to page 2
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    });

    // Navigate to page 3 (final)
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(6);
      expect(screen.getByText(/Page 3 of 3/)).toBeInTheDocument();
    });

    const prev = screen.getByRole("button", { name: /previous page/i });
    const next = screen.getByRole("button", { name: /next page/i });

    expect(prev).not.toBeDisabled();
    expect(next).toBeDisabled();
  });

  it("navigation requests the expected page and preserves active filters", async () => {
    const searchTerm = "rare painting";
    (fetchListings as jest.Mock).mockImplementation((opts) => {
      if (opts.cursor_ledger === 100) {
        return Promise.resolve({
          listings: makeListings(PAGE_SIZE, 13),
          total: 30,
          nextCursor: "200",
        });
      }
      return Promise.resolve({
        listings: makeListings(PAGE_SIZE),
        total: 30,
        nextCursor: "100",
      });
    });

    render(<ExplorePage />);

    // Wait for initial page load
    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(PAGE_SIZE);
    });

    // Enter a search term (active filter)
    const searchInput = screen.getByPlaceholderText(/Search by title/i);
    await user.clear(searchInput);
    await user.type(searchInput, searchTerm);

    // Wait for the search to trigger a refetch with the filter
    await waitFor(() => {
      expect(fetchListings).toHaveBeenCalledWith(
        expect.objectContaining({ search: searchTerm })
      );
    });

    // Wait for listings to re-render with search results
    await waitFor(() => {
      expect(screen.getAllByTestId("listing-card")).toHaveLength(PAGE_SIZE);
    });

    // Click Next — filters should be preserved in the next fetch
    await user.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => {
      expect(fetchListings).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: searchTerm, cursor_ledger: 100 })
      );
    });
  });
});
