import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MainContent } from "@/components/a11y/MainContent";

describe("MainContent", () => {
  it("provides a keyboard-visible skip link to the single stable main landmark", async () => {
    const user = userEvent.setup();
    render(
      <MainContent>
        <h1>Marketplace</h1>
      </MainContent>,
    );

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    const main = screen.getByRole("main");

    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("main")).toHaveLength(1);

    await user.tab();

    expect(skipLink).toHaveFocus();
    expect(skipLink.className).toContain("focus-visible:not-sr-only");

    await user.keyboard("{Enter}");

    expect(window.location.hash).toBe("#main-content");
  });
});