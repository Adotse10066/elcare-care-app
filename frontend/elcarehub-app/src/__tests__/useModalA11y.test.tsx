import React from "react";
import { render, screen } from "@testing-library/react";
import { useModalA11y } from "@/hooks/useModalA11y";

function ModalHarness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { dialogRef } = useModalA11y(isOpen, onClose);

  return (
    <>
      <button type="button">Open wallet</button>
      {isOpen && (
        <div ref={dialogRef} role="dialog" tabIndex={-1}>
          <button type="button">Connect</button>
        </div>
      )}
    </>
  );
}

describe("useModalA11y focus behavior", () => {
  it("focuses the dialog on open and returns focus to the opener on close", () => {
    const { rerender } = render(<ModalHarness isOpen={false} onClose={jest.fn()} />);
    const openButton = screen.getByRole("button", { name: "Open wallet" });
    openButton.focus();

    rerender(<ModalHarness isOpen onClose={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();

    rerender(<ModalHarness isOpen onClose={jest.fn()} />);
    expect(dialog).toHaveFocus();

    rerender(<ModalHarness isOpen={false} onClose={jest.fn()} />);
    expect(openButton).toHaveFocus();
  });
});