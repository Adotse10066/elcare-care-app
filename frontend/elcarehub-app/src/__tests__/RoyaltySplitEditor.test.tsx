import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  RecipientInput,
  RoyaltySplitEditor,
} from "@/components/RoyaltySplitEditor";

function ControlledRoyaltySplitEditor() {
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { address: "GARTIST", percentage: 100 },
  ]);

  return (
    <RoyaltySplitEditor recipients={recipients} onChange={setRecipients} />
  );
}

describe("RoyaltySplitEditor accessible labels", () => {
  it("names each field and keeps row label associations stable after removal", () => {
    render(<ControlledRoyaltySplitEditor />);

    const firstAddress = screen.getByRole("textbox", {
      name: "Recipient 1 address",
    });
    expect(
      screen.getByRole("spinbutton", { name: "Recipient 1 percentage" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add recipient/i }));
    const secondAddress = screen.getByRole("textbox", {
      name: "Recipient 2 address",
    });
    const secondAddressId = secondAddress.getAttribute("id");
    expect(
      screen.getByRole("spinbutton", { name: "Recipient 2 percentage" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove recipient 1" }));

    const remainingAddress = screen.getByRole("textbox", {
      name: "Recipient 1 address",
    });
    expect(remainingAddress).toHaveAttribute("id", secondAddressId);
    expect(
      screen.getByRole("spinbutton", { name: "Recipient 1 percentage" })
    ).toHaveAttribute("id", expect.stringMatching(/-percentage$/));
    expect(new Set(Array.from(document.querySelectorAll("input[id]"), (input) => input.id)).size)
      .toBe(2);
  });
});