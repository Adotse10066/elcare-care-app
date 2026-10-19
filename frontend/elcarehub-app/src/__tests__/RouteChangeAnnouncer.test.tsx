import React from "react";
import { render, screen } from "@testing-library/react";
import { RouteChangeAnnouncer } from "@/components/a11y/RouteChangeAnnouncer";

let mockPathname = "/marketplace";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("RouteChangeAnnouncer", () => {
  beforeEach(() => {
    mockPathname = "/marketplace";
  });

  it("announces the new page heading once when the pathname changes", () => {
    const { rerender } = render(
      <>
        <RouteChangeAnnouncer />
        <main id="main-content"><h1>Marketplace</h1></main>
      </>,
    );

    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    mockPathname = "/settings";
    rerender(
      <>
        <RouteChangeAnnouncer />
        <main id="main-content"><h1>Settings</h1></main>
      </>,
    );

    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Settings");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("does not announce query-only changes", () => {
    const { rerender } = render(
      <>
        <RouteChangeAnnouncer />
        <main id="main-content"><h1>Marketplace</h1></main>
      </>,
    );

    mockPathname = "/settings";
    rerender(
      <>
        <RouteChangeAnnouncer />
        <main id="main-content"><h1>Settings</h1></main>
      </>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Settings");

    rerender(
      <>
        <RouteChangeAnnouncer />
        <main id="main-content"><h1>Filtered settings</h1></main>
      </>,
    );

    expect(status).toHaveTextContent("Settings");
  });
});