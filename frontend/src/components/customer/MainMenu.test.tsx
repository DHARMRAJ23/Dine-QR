import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MainMenu from "./MainMenu";
import { CartProvider } from "../../context/CartContext";

// ── Mock Supabase so tests run without a real DB ──────────────────────────────
vi.mock("../../lib/supabase", () => {
  const supabase = {
    rpc: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  };
  return { supabase };
});

import { supabase } from "../../lib/supabase";

const VALID_TOKEN = "tbl_VALIDTKN";
const INVALID_TOKEN = "tbl_BADTOKEN";

/** Helper: render MainMenu at a given path */
const renderMenu = (token: string) =>
  render(
    <CartProvider>
      <MemoryRouter initialEntries={[`/menu/${token}`]}>
        <Routes>
          <Route path="/menu/:tableToken" element={<MainMenu />} />
        </Routes>
      </MemoryRouter>
    </CartProvider>,
  );

describe("MainMenu Component — Secure Token Validations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows loading spinner while validating token", async () => {
    // Never resolves — stays in loading state
    (supabase.rpc as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    renderMenu(VALID_TOKEN);
    // The spinner doesn't have explicit text, but we verify the invalid screen is NOT shown yet
    expect(screen.queryByText("Invalid Table QR Code")).toBeNull();
    // Wait for the async database fetch in CartProvider to resolve to avoid state updates after test exits
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  });

  it("renders correctly when token is valid", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        valid: true,
        table_number: 3,
        table_id: "uuid-3",
        restaurant_id: "rest-id",
      },
      error: null,
    });
    renderMenu(VALID_TOKEN);
    await waitFor(() => expect(screen.getByText("Table 3")).toBeDefined());
    expect(screen.getByText("Zest & Fire")).toBeDefined();
  });

  it("displays error screen when token is invalid (not in DB)", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { valid: false },
      error: null,
    });
    renderMenu(INVALID_TOKEN);
    await waitFor(() =>
      expect(screen.getByText("Invalid Table QR Code")).toBeDefined(),
    );
  });

  it("displays error screen when Supabase returns an error", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "Network error" },
    });
    renderMenu(VALID_TOKEN);
    await waitFor(() =>
      expect(screen.getByText("Invalid Table QR Code")).toBeDefined(),
    );
  });

  it("displays error screen when token is missing (no URL param)", async () => {
    // Navigate to /menu/ with no param — router won't match, handled as invalid
    render(
      <CartProvider>
        <MemoryRouter initialEntries={["/menu/"]}>
          <Routes>
            <Route path="/menu/:tableToken" element={<MainMenu />} />
            <Route path="/menu/" element={<MainMenu />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Invalid Table QR Code")).toBeDefined(),
    );
  });

  it("does NOT call Supabase again if same token is already in sessionStorage", async () => {
    // These are the exact keys MainMenu reads via sessionStorage.getItem()
    // writeStorage JSON-encodes values, so we do the same here
    sessionStorage.setItem("dine_in_table_token", JSON.stringify(VALID_TOKEN));
    sessionStorage.setItem("dine_in_table_id", JSON.stringify("3"));

    renderMenu(VALID_TOKEN);
    // The component should skip validation and go straight to 'valid'
    // It should NOT show the invalid screen
    await waitFor(() =>
      expect(screen.queryByText("Invalid Table QR Code")).toBeNull(),
    );
    // RPC should NOT have been called for validate_table_token since token is already cached
    const rpcCalls = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls;
    const validateCalls = rpcCalls.filter(
      (call: unknown[]) => call[0] === "validate_table_token",
    );
    expect(validateCalls.length).toBe(0);
    // Wait for the async database fetch in CartProvider to resolve to avoid state updates after test exits
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
  });
});
