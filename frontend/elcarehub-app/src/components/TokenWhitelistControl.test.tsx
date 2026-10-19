/**
 * TokenWhitelistControl.test.tsx — minimal test coverage
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TokenWhitelistControl from "./TokenWhitelistControl";

describe("TokenWhitelistControl", () => {
  const defaultProps = {
    marketplaceContractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    network: "testnet" as const,
  };
  const validAddress = `C${"A".repeat(55)}`;

  it("renders form with action selection", () => {
    render(<TokenWhitelistControl {...defaultProps} />);
    expect(screen.getByText("Token Whitelist Management")).toBeInTheDocument();
    expect(screen.getByLabelText("Add token")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove token")).toBeInTheDocument();
  });

  it("validates Stellar contract address format", async () => {
    render(<TokenWhitelistControl {...defaultProps} />);

    const addressInput = screen.getByPlaceholderText(
      /CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/
    );
    const symbolInput = screen.getByPlaceholderText("USDC");

    // Invalid address
    fireEvent.change(addressInput, { target: { value: "INVALID" } });
    fireEvent.change(symbolInput, { target: { value: "USDC" } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid Stellar contract address/)).toBeInTheDocument();
    });

    // Valid address
    fireEvent.change(addressInput, {
      target: { value: validAddress },
    });

    await waitFor(() => {
      expect(
        screen.queryByText(/Invalid Stellar contract address/)
      ).not.toBeInTheDocument();
    });
  });

  it("explains incomplete verification and blocks submission", async () => {
    render(<TokenWhitelistControl {...defaultProps} />);

    fireEvent.change(
      screen.getByPlaceholderText(
        /CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/
      ),
      {
        target: { value: validAddress },
      }
    );
    fireEvent.change(screen.getByPlaceholderText("USDC"), {
      target: { value: "USDC" },
    });
    const submitButton = screen.getByRole("button", {
      name: /Add Token/,
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    fireEvent.click(submitButton);

    expect(
      await screen.findByText("Complete all four verification checks before submitting.")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    // All checks must be complete before the submit handler proceeds.
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      fireEvent.click(checkbox);
    });
    expect(submitButton).not.toBeDisabled();
  });

  it("explains an invalid address and blocks the API request", async () => {
    render(<TokenWhitelistControl {...defaultProps} />);
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    fireEvent.change(
      screen.getByPlaceholderText(
        /CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/
      ),
      { target: { value: "INVALID" } }
    );
    fireEvent.change(screen.getByPlaceholderText("USDC"), {
      target: { value: "USDC" },
    });
    screen.getAllByRole("checkbox").forEach((checkbox) => {
      fireEvent.click(checkbox);
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Token/ }));

    expect(
      await screen.findByText(
        "Token contract address must be a valid Stellar address (C + 55 chars)."
      )
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns on non-standard decimals", async () => {
    render(<TokenWhitelistControl {...defaultProps} />);

    const decimalsInput = screen.getByDisplayValue("7");
    fireEvent.change(decimalsInput, { target: { value: "6" } });

    await waitFor(() => {
      expect(
        screen.getByText(/Non-standard decimals require engineering sign-off/)
      ).toBeInTheDocument();
    });
  });

  it("calls onTokenAdded callback on successful add", async () => {
    const onTokenAdded = jest.fn();
    render(
      <TokenWhitelistControl
        {...defaultProps}
        onTokenAdded={onTokenAdded}
      />
    );

    // Fill form
    const addressInput = screen.getByPlaceholderText(
      /CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/
    );
    const symbolInput = screen.getByPlaceholderText("USDC");

    fireEvent.change(addressInput, {
      target: { value: validAddress },
    });
    fireEvent.change(symbolInput, { target: { value: "USDC" } });

    // Check all verification items
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      fireEvent.click(checkbox);
    });

    // Mock fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            txHash: "0x123abc",
          }),
      })
    ) as jest.Mock;

    // Submit
    const submitButton = screen.getByRole("button", { name: /Add Token/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onTokenAdded).toHaveBeenCalledWith(
        validAddress
      );
    });
  });

  it("displays error on API failure", async () => {
    render(<TokenWhitelistControl {...defaultProps} />);

    // Fill form
    const addressInput = screen.getByPlaceholderText(
      /CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/
    );
    const symbolInput = screen.getByPlaceholderText("USDC");

    fireEvent.change(addressInput, {
      target: { value: validAddress },
    });
    fireEvent.change(symbolInput, { target: { value: "USDC" } });

    // Check all verification items
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      fireEvent.click(checkbox);
    });

    // Mock fetch failure
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            message: "Token already whitelisted",
          }),
      })
    ) as jest.Mock;

    // Submit
    const submitButton = screen.getByRole("button", { name: /Add Token/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Token already whitelisted/)
      ).toBeInTheDocument();
    });
  });

  it("toggles between add and remove actions", () => {
    render(<TokenWhitelistControl {...defaultProps} />);

    const removeRadio = screen.getByLabelText("Remove token");
    fireEvent.click(removeRadio);

    const submitButton = screen.getByRole("button", { name: /Remove Token/ });
    expect(submitButton).toBeInTheDocument();
  });
});
