import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LiveTracker from "./LiveTracker";
import { CartProvider } from "../../context/CartContext";

// ── Mock Supabase so the PIN screen can be tested deterministically ───────────
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

const ORDER_ID = "ord-test123";
const CORRECT_PIN = "4892";

const MOCK_ORDER_RESPONSE = {
  success: true,
  order: {
    id: ORDER_ID,
    guestName: "Asha",
    status: "placed",
    tableNumber: 4,
    subtotal: 180,
    tax: 9,
    serviceCharge: 0,
    grandTotal: 189,
    placedAt: new Date().toISOString(),
    items: [
      {
        itemId: "hd-1",
        name: "Vanilla Bean Latte",
        price: 180,
        quantity: 1,
        isVeg: true,
      },
    ],
  },
};

const renderTracker = (orderId: string) =>
  render(
    <CartProvider>
      <MemoryRouter initialEntries={[`/status/${orderId}`]}>
        <Routes>
          <Route path="/status/:orderId" element={<LiveTracker />} />
        </Routes>
      </MemoryRouter>
    </CartProvider>,
  );

describe("LiveTracker", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows PIN entry screen when no PIN is in sessionStorage", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { valid: false },
      error: null,
    });
    renderTracker(ORDER_ID);
    await waitFor(() =>
      expect(screen.getByText("Order Protected")).toBeDefined(),
    );
    expect(screen.getByPlaceholderText("Enter 6-Digit PIN")).toBeDefined();
  });

  it("shows order details when correct PIN is in sessionStorage", async () => {
    sessionStorage.setItem(`order_pin_${ORDER_ID}`, CORRECT_PIN);
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: MOCK_ORDER_RESPONSE,
      error: null,
    });

    renderTracker(ORDER_ID);
    await waitFor(() => expect(screen.getByText(/Asha/)).toBeDefined());
  });

  it("shows Order Protected and error if wrong PIN is entered", async () => {
    // No PIN in session, and the RPC returns failure for a wrong PIN
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: false, error: "Invalid Order ID or PIN Code" },
      error: null,
    });

    sessionStorage.setItem(`order_pin_${ORDER_ID}`, "9999"); // wrong PIN
    renderTracker(ORDER_ID);

    await waitFor(() =>
      expect(screen.getByText("Invalid Order ID or PIN Code")).toBeDefined(),
    );
  });
});
