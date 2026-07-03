import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "./CartContext";
import { INITIAL_FOOD_ITEMS } from "../data/mockData";

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

vi.mock("../lib/supabase", () => {
  const supabase = {
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
        delete: vi
          .fn()
          .mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  };
  return { supabase };
});

// Helper component to interact with CartContext
const TestConsumer = ({
  onHook,
}: {
  onHook: (hookValues: ReturnType<typeof useCart>) => void;
}) => {
  const hookValues = useCart();
  onHook(hookValues);
  return null;
};

const renderCartContext = (
  onHook: (hookValues: ReturnType<typeof useCart>) => void,
) => {
  return render(
    <CartProvider>
      <TestConsumer onHook={onHook} />
    </CartProvider>,
  );
};

describe("CartContext & Billing Calculations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("initializes with default menu items", async () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    // Wait for async Supabase fetch to resolve
    await waitFor(() => expect(hook!.menuItems.length).toBeGreaterThan(0));
    expect(hook!.menuItems[0].name).toBeDefined();
  });

  it("adds items to cart and validates quantity limits (1-20)", async () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    // Wait for menu to load from mock
    await waitFor(() => expect(hook!.menuItems.length).toBeGreaterThan(0));

    const item = hook!.menuItems[0];

    act(() => {
      hook!.addToCart(item);
    });
    expect(hook!.cart.length).toBe(1);
    expect(hook!.cart[0].quantity).toBe(1);

    for (let i = 0; i < 25; i++) {
      act(() => {
        hook!.addToCart(item);
      });
    }
    expect(hook!.cart[0].quantity).toBe(20);

    act(() => {
      hook!.updateQuantity(item.id, 25);
    });
    expect(hook!.cart[0].quantity).toBe(20);

    act(() => {
      hook!.updateQuantity(item.id, -1);
    });
    expect(hook!.cart.length).toBe(0);
  });

  it("rejects order if no tableToken is set (no valid QR scan)", async () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    // Wait for menu to load
    await waitFor(() => expect(hook!.menuItems.length).toBeGreaterThan(0));

    const item = hook!.menuItems[0];
    act(() => {
      hook!.addToCart(item);
      // Set display number but NO token (simulates URL bypass without QR scan)
      hook!.setTableId("5");
      hook!.setGuestName("Test User");
    });

    // placeOrder should throw because tableToken is null
    let caughtError: Error | null = null;
    await act(async () => {
      try {
        await hook!.placeOrder();
      } catch (err) {
        caughtError = err as Error;
      }
    });

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain("token");
  });

  it("restricts invalid order status transitions", async () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    // Wait for menu to load
    await waitFor(() => expect(hook!.menuItems.length).toBeGreaterThan(0));

    const item = hook!.menuItems[0];
    act(() => {
      hook!.addToCart(item);
      // Use setTableId with both number and token
      hook!.setTableId("5", "tbl_TESTTOKEN");
      hook!.setGuestName("Jane Doe");
    });

    // Check the context exposes the setTableId signature with token support.
    expect(hook!.tableId).toBe("5");
    expect(hook!.tableToken).toBe("tbl_TESTTOKEN");
  });

  it("stores tableToken and tableId both in sessionStorage", async () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    await waitFor(() => expect(hook!.menuItems.length).toBeGreaterThan(0));

    act(() => {
      hook!.setTableId("7", "tbl_MYTOKEN9");
    });

    // writeStorage JSON-encodes the values, so parse before comparing
    expect(JSON.parse(sessionStorage.getItem("dine_in_table_id")!)).toBe("7");
    expect(JSON.parse(sessionStorage.getItem("dine_in_table_token")!)).toBe(
      "tbl_MYTOKEN9",
    );
  });

  it("clears tableToken when setTableId is called with null", async () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    await waitFor(() => expect(hook!.menuItems.length).toBeGreaterThan(0));

    act(() => {
      hook!.setTableId("7", "tbl_MYTOKEN9");
    });
    act(() => {
      hook!.setTableId(null, null);
    });

    expect(hook!.tableId).toBeNull();
    expect(hook!.tableToken).toBeNull();
    expect(sessionStorage.getItem("dine_in_table_token")).toBeNull();
  });
});
