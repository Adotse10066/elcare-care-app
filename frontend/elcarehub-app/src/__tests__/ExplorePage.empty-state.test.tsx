import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExplorePage from "@/app/explore/page";
import { fetchListings, getCollections } from "@/lib/indexer";
import { getAllListings } from "@/lib/contract";

jest.mock("@/lib/indexer", () => ({
  fetchListings: jest.fn(),
  getCollections: jest.fn().mockResolvedValue({ collections: [] }),
}));

jest.mock("@/lib/contract", () => ({
  getAllListings: jest.fn().mockResolvedValue([]),
  stroopsToXlm: (s: bigint) => "1",
}));

let mockFilters = {
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

describe("ExplorePage Empty State", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFilters = {
      search: "",
      status: "All",
      collection: [],
      minPrice: "",
      maxPrice: "",
      artist: "",
      sort: "newest",
    };
  });

  it("shows unfiltered empty marketplace state when no listings and no active filters", async () => {
    (fetchListings as jest.Mock).mockResolvedValueOnce({ listings: [], total: 0 });
    (getAllListings as jest.Mock).mockResolvedValueOnce([]);

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText("No artworks yet")).toBeInTheDocument();
      expect(
        screen.getByText(/The marketplace doesn't have any listings yet/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Clear all filters/i })).not.toBeInTheDocument();
    });
  });

  it("shows filtered empty state and allows clearing filters when search/filters are active", async () => {
    const user = userEvent.setup();
    mockFilters = {
      search: "rare-painting",
      status: "All",
      collection: [],
      minPrice: "",
      maxPrice: "",
      artist: "",
      sort: "newest",
    };

    (fetchListings as jest.Mock).mockResolvedValue({ listings: [], total: 0 });
    (getAllListings as jest.Mock).mockResolvedValue([]);

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText("No matching artworks")).toBeInTheDocument();
      expect(
        screen.getByText(/No listings match your current filters or search terms/i)
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Clear all filters/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Clear all filters/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by title/i)).toHaveValue("");
    });
  });
});
