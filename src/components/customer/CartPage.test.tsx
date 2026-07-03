import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CartPage from "./CartPage";
import { CartProvider, useCart } from "../../context/CartContext";
import { INITIAL_FOOD_ITEMS } from "../../data/mockData";

// ── Mock Supabase so tests run without a real DB ──────────────────────────────
const MOCK_MENU_ROWS = INITIAL_FOOD_ITEMS.map((item) => ({
  id: item.id,
  name: item.name,
  price: item.price,
  description: item.description,
  category: item.category,
  image_url: item.image,
  in_stock: item.isAvailable,
}));

vi.mock("../../lib/supabase", () => {
  const supabase = {
    rpc: vi.fn(),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "menu_items") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi
              .fn()
              .mockResolvedValue({ data: MOCK_MENU_ROWS, error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        update: vi
          .fn()
          .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
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

// Helper to add items to cart and set table context programmatically
const AddItemAndRender = ({ children }: { children: React.ReactNode }) => {
  const { addToCart, menuItems, setTableId } = useCart();
  const added = React.useRef(false);
  React.useEffect(() => {
    if (!added.current && menuItems.length > 0) {
      added.current = true;
      // Set BOTH display number and secure token
      setTableId("3", "tbl_TESTTOKEN");
      addToCart(menuItems[0]);
    }
  }, [addToCart, menuItems, setTableId]);
  return <>{children}</>;
};

describe("CartPage Component & Form Validations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("displays empty cart message when cart is empty", () => {
    render(
      <CartProvider>
        <MemoryRouter initialEntries={["/cart"]}>
          <Routes>
            <Route path="/cart" element={<CartPage />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>,
    );

    expect(screen.getByText("Your Cart is Empty")).toBeDefined();
    expect(screen.getByText("Browse Menu")).toBeDefined();
  });

  it("requires guest name to place an order", async () => {
    render(
      <CartProvider>
        <AddItemAndRender>
          <MemoryRouter initialEntries={["/cart"]}>
            <Routes>
              <Route path="/cart" element={<CartPage />} />
            </Routes>
          </MemoryRouter>
        </AddItemAndRender>
      </CartProvider>,
    );

    // Wait for cart to appear
    await waitFor(() => screen.getByRole("button", { name: /Place Order/i }));
    const placeOrderBtn = screen.getByRole("button", { name: /Place Order/i });
    fireEvent.click(placeOrderBtn);

    expect(
      screen.getByText(
        /Your name is required so the waitstaff can identify you/i,
      ),
    ).toBeDefined();
  });

  it("successfully places order and navigates when validation passes", async () => {
    // Mock successful RPC call returning order_id + pin_code
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        order_id: "new-order-uuid",
        pin_code: "1234",
        total_charged: 200,
        table_number: 3,
      },
      error: null,
    });

    render(
      <CartProvider>
        <AddItemAndRender>
          <MemoryRouter initialEntries={["/cart"]}>
            <Routes>
              <Route path="/cart" element={<CartPage />} />
              <Route
                path="/status/:orderId"
                element={<div data-testid="status-page">Status Page</div>}
              />
            </Routes>
          </MemoryRouter>
        </AddItemAndRender>
      </CartProvider>,
    );

    // Wait for cart to load
    await waitFor(() => screen.getByPlaceholderText("Enter your name"));

    const guestInput = screen.getByPlaceholderText("Enter your name");
    fireEvent.change(guestInput, { target: { value: "Alice" } });

    const placeOrderBtn = screen.getByRole("button", { name: /Place Order/i });
    fireEvent.click(placeOrderBtn);

    await waitFor(() => screen.getByTestId("status-page"));
    expect(screen.getByTestId("status-page")).toBeDefined();
  });
});
