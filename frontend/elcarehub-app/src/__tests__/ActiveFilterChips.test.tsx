import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveFilterChips } from "@/components/ActiveFilterChips";
import type { Filters, FilterAction } from "@/components/FilterSidebar";

describe("ActiveFilterChips", () => {
  const initialFilters: Filters = {
    search: "painting",
    status: "Active",
    collection: ["CCOLLECTION1"],
    minPrice: "10",
    maxPrice: "100",
    artist: "GARTIST1234567890",
    sort: "price-low",
  };

  it("renders identifiable removal buttons for each active filter chip", () => {
    const dispatch = jest.fn();
    render(<ActiveFilterChips filters={initialFilters} dispatch={dispatch} />);

    expect(
      screen.getByRole("button", { name: 'Remove filter: Search: "painting"' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter: Status: Active" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Remove filter: Collection:/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter: Price: 10 – 100 XLM" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Remove filter: Artist:/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter: Sort: Price: Low to High" })
    ).toBeInTheDocument();
  });

  it("removing one chip dispatches an action for only that specific filter", async () => {
    const user = userEvent.setup();
    const dispatch = jest.fn();
    render(<ActiveFilterChips filters={initialFilters} dispatch={dispatch} />);

    // Click remove on search chip
    await user.click(
      screen.getByRole("button", { name: 'Remove filter: Search: "painting"' })
    );
    expect(dispatch).toHaveBeenCalledWith<[FilterAction]>({
      type: "SET_SEARCH",
      payload: "",
    });

    // Click remove on status chip
    await user.click(
      screen.getByRole("button", { name: "Remove filter: Status: Active" })
    );
    expect(dispatch).toHaveBeenCalledWith<[FilterAction]>({
      type: "SET_STATUS",
      payload: "All",
    });

    // Click remove on price chip
    await user.click(
      screen.getByRole("button", { name: "Remove filter: Price: 10 – 100 XLM" })
    );
    expect(dispatch).toHaveBeenCalledWith<[FilterAction]>({
      type: "SET_MIN_PRICE",
      payload: "",
    });
    expect(dispatch).toHaveBeenCalledWith<[FilterAction]>({
      type: "SET_MAX_PRICE",
      payload: "",
    });
  });

  it("clear-all action continues to clear every active filter", async () => {
    const user = userEvent.setup();
    const dispatch = jest.fn();
    render(<ActiveFilterChips filters={initialFilters} dispatch={dispatch} />);

    const clearAllBtn = screen.getByRole("button", { name: /clear all/i });
    expect(clearAllBtn).toBeInTheDocument();

    await user.click(clearAllBtn);
    expect(dispatch).toHaveBeenCalledWith<[FilterAction]>({ type: "CLEAR_ALL" });
  });
});
