/* eslint-disable react/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import type { FoodItem, Order } from "../types";
import { supabase } from "../lib/supabase";

import { readStorage, writeStorage, isCartItemArray } from "../utils/storage";

export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 20;

export interface CartItem {
  item: FoodItem;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  /** Friendly table number (e.g. "3") — for display only */
  tableId: string | null;
  /** Secure opaque QR token (e.g. "tbl_8F3KQ9ZP") — sent to server for validation */
  tableToken: string | null;
  guestName: string;
  specialInstructions: string;
  menuItems: FoodItem[];
  orders: Order[];
  isLoadingData: boolean;
  toast: { message: string; type: "success" | "error" | "info" } | null;

  showToast: (message: string, type?: "success" | "error" | "info") => void;
  /** Call with (friendlyNumber, qrToken) after token validation in MainMenu */
  setTableId: (id: string | null, token?: string | null) => void;
  setGuestName: (name: string) => void;
  setSpecialInstructions: (notes: string) => void;
  addToCart: (item: FoodItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  placeOrder: () => Promise<Order | null>;

  updateOrderStatus: (
    orderId: string,
    status: Order["status"],
  ) => Promise<void>;
  toggleItemAvailability: (itemId: string) => Promise<void>;
  addMenuItem: (item: Omit<FoodItem, "id">) => Promise<void>;
  updateMenuItem: (item: FoodItem) => Promise<void>;
  deleteMenuItem: (itemId: string) => Promise<void>;

  resetMenuToDefaults: () => Promise<void>;
  clearAllOrders: () => Promise<void>;
  resetCompleteDemo: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => setToast({ message, type });

  const [menuItems, setMenuItems] = useState<FoodItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [cart, setCart] = useState<CartItem[]>(() => {
    return readStorage(sessionStorage, "dine_in_cart", [], isCartItemArray);
  });

  const [tableId, setTableIdState] = useState<string | null>(() => {
    return readStorage(
      sessionStorage,
      "dine_in_table_id",
      null,
      (v): v is string => typeof v === "string",
    );
  });

  // The opaque QR token — e.g. "tbl_8F3KQ9ZP" — only this is sent to the server
  const [tableToken, setTableTokenState] = useState<string | null>(() => {
    return readStorage(
      sessionStorage,
      "dine_in_table_token",
      null,
      (v): v is string => typeof v === "string",
    );
  });

  const [guestName, setGuestNameState] = useState<string>(() => {
    return readStorage(
      sessionStorage,
      "dine_in_guest_name",
      "",
      (v): v is string => typeof v === "string",
    );
  });

  const [specialInstructions, setSpecialInstructionsState] = useState<string>(
    () => {
      return readStorage(
        sessionStorage,
        "dine_in_special_instructions",
        "",
        (v): v is string => typeof v === "string",
      );
    },
  );

  const placingOrderRef = useRef(false);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  /** Store the friendly number AND the secure token together */
  const setTableId = (id: string | null, token?: string | null) => {
    setTableIdState(id);
    if (id) writeStorage(sessionStorage, "dine_in_table_id", id);
    else sessionStorage.removeItem("dine_in_table_id");

    if (token !== undefined) {
      setTableTokenState(token);
      if (token) writeStorage(sessionStorage, "dine_in_table_token", token);
      else sessionStorage.removeItem("dine_in_table_token");
    }
  };

  const setGuestName = (name: string) => {
    const trimmed = name.slice(0, 60);
    setGuestNameState(trimmed);
    writeStorage(sessionStorage, "dine_in_guest_name", trimmed);
  };

  const setSpecialInstructions = (notes: string) => {
    const truncated = notes.slice(0, 500);
    setSpecialInstructionsState(truncated);
    writeStorage(sessionStorage, "dine_in_special_instructions", truncated);
  };

  useEffect(() => {
    writeStorage(sessionStorage, "dine_in_cart", cart);
  }, [cart]);

  // Initial Fetch from Supabase
  const loadData = async () => {
    // Fetch menu
    const { data: menuData } = await supabase
      .from("menu_items")
      .select("*")
      .order("name");
    if (menuData) {
      const mappedMenu = menuData.map((row) => ({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        description: row.description || "",
        category: row.category,
        image: row.image_url || "",
        isVeg: true,
        isAvailable: row.in_stock,
      }));
      setMenuItems(mappedMenu);
    }

    // Fetch orders
    const { data: ordersData } = await supabase
      .from("orders")
      .select(
        `
        *,
        restaurant_tables(table_number),
        order_items(
          menu_item_id,
          quantity,
          price_at_order,
          menu_items(name)
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (ordersData) {
      const mappedOrders = ordersData.map((orderRow) => ({
        id: orderRow.id,
        orderNumber: orderRow.order_number,
        tableId: orderRow.restaurant_tables?.table_number?.toString() || "1",
        guestName: orderRow.guest_name || "Guest",
        status: orderRow.status as Order["status"],
        subtotal: Number(orderRow.subtotal),
        tax: Number(orderRow.tax),
        serviceCharge: Number(orderRow.service_charge),
        grandTotal: Number(orderRow.total),
        specialInstructions: orderRow.notes || undefined,
        placedAt: orderRow.created_at,
        items: orderRow.order_items.map((itemRow: any) => ({
          itemId: itemRow.menu_item_id,
          name: itemRow.menu_items?.name || "Item",
          price: Number(itemRow.price_at_order),
          quantity: itemRow.quantity,
          isVeg: true,
        })),
      }));
      setOrders(mappedOrders);
    }
    setIsLoadingData(false);
  };

  useEffect(() => {
    loadData();

    // Setup Supabase Realtime
    const channel = supabase
      .channel("public_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        () => {
          loadData(); // Re-fetch all for simplicity
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          loadData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addToCart = (item: FoodItem) => {
    const dbItem = menuItems.find((i) => i.id === item.id);
    if (!dbItem || !dbItem.isAvailable) {
      showToast(`Sorry, "${item.name}" is currently out of stock!`, "error");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        if (existing.quantity >= MAX_ITEM_QUANTITY) {
          showToast(
            `Maximum quantity of ${MAX_ITEM_QUANTITY} reached!`,
            "info",
          );
          return prev;
        }
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { item: dbItem, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    if (quantity < MIN_ITEM_QUANTITY || quantity > MAX_ITEM_QUANTITY) return;

    setCart((prev) =>
      prev.map((i) => (i.item.id === itemId ? { ...i, quantity } : i)),
    );
  };

  const clearCart = () => {
    setCart([]);
    setSpecialInstructionsState("");
    sessionStorage.removeItem("dine_in_cart");
    sessionStorage.removeItem("dine_in_special_instructions");
  };

  const placeOrder = async (): Promise<Order | null> => {
    if (placingOrderRef.current) return null;
    if (cart.length === 0 || !tableId || !guestName.trim()) {
      throw new Error("Missing guest details, table number or empty cart.");
    }

    const unavailableItems = cart.filter((ci) => {
      const dbItem = menuItems.find((m) => m.id === ci.item.id);
      return !dbItem || !dbItem.isAvailable;
    });

    if (unavailableItems.length > 0) {
      throw new Error("Some items in your cart are currently out of stock.");
    }

    placingOrderRef.current = true;

    try {
      // Ensure the token was validated at menu-load time
      if (!tableToken) {
        throw new Error(
          "No valid table token. Please scan the QR code on your table.",
        );
      }

      // Format items array for the RPC call
      const orderItems = cart.map((ci) => ({
        menu_item_id: ci.item.id,
        quantity: ci.quantity,
      }));

      // Call the secure server-side function — token is resolved server-side
      const { data: result, error: rpcError } = await supabase.rpc(
        "place_order",
        {
          p_table_token: tableToken,
          p_guest_name: guestName.trim(),
          p_notes: specialInstructions.trim() || "",
          p_items: orderItems,
        },
      );

      if (rpcError) throw rpcError;
      if (!result || !result.success)
        throw new Error("Failed to create order on server");

      const newOrderId = result.order_id;
      const pinCode = result.pin_code;

      // Save the PIN to allow the customer to view the Live Tracker
      sessionStorage.setItem(`order_pin_${newOrderId}`, pinCode);

      clearCart();
      await loadData(); // Optimistic refetch, or wait for realtime

      // Construct local object since we might navigate immediately
      return {
        id: newOrderId,
        orderNumber: result.order_number,
        tableId: tableId,
        guestName: guestName.trim(),
        status: "placed",
        subtotal: 0, // Mocked for immediate return
        tax: 0,
        serviceCharge: 0,
        grandTotal: result.total_charged,
        placedAt: new Date().toISOString(),
        items: cart.map((ci) => ({
          itemId: ci.item.id,
          name: ci.item.name,
          price: ci.item.price,
          quantity: ci.quantity,
          isVeg: ci.item.isVeg,
        })),
      };
    } finally {
      placingOrderRef.current = false;
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    status: Order["status"],
  ) => {
    const { error } = await supabase.rpc("update_order_status", {
      p_order_id: orderId,
      p_status: status,
    });
    if (!error) {
      loadData();
    } else {
      showToast("Failed to update status: " + error.message, "error");
    }
  };

  const toggleItemAvailability = async (itemId: string) => {
    const item = menuItems.find((i) => i.id === itemId);
    if (!item) return;

    const { error } = await supabase.rpc("toggle_item_availability", {
      p_item_id: itemId,
    });

    if (!error) {
      loadData();
    } else {
      showToast(
        "Failed to toggle item availability: " + error.message,
        "error",
      );
    }
  };

  const addMenuItem = async (item: Omit<FoodItem, "id">) => {
    const { error } = await supabase.rpc("add_menu_item", {
      p_restaurant_id: "11111111-1111-1111-1111-111111111111",
      p_name: item.name,
      p_description: item.description,
      p_price: item.price,
      p_category: item.category,
      p_image_url: item.image,
      p_in_stock: item.isAvailable,
    });
    if (!error) {
      loadData();
    } else {
      showToast("Failed to add menu item: " + error.message, "error");
    }
  };

  const updateMenuItem = async (item: FoodItem) => {
    const { error } = await supabase.rpc("update_menu_item", {
      p_item_id: item.id,
      p_name: item.name,
      p_description: item.description,
      p_price: item.price,
      p_category: item.category,
      p_image_url: item.image,
      p_in_stock: item.isAvailable,
    });
    if (!error) {
      loadData();
    } else {
      showToast("Failed to update menu item: " + error.message, "error");
    }
  };

  const deleteMenuItem = async (itemId: string) => {
    const { error } = await supabase.rpc("delete_menu_item", {
      p_item_id: itemId,
    });
    if (!error) {
      loadData();
    } else {
      showToast("Failed to delete menu item: " + error.message, "error");
    }
  };

  const resetMenuToDefaults = async () => {
    // No-op for now as Supabase manages state
    showToast("Menu reset managed via Supabase directly now.", "info");
  };

  const clearAllOrders = async () => {
    // Destructive action via secure RPC
    const { error } = await supabase.rpc("clear_all_orders");
    if (!error) {
      setOrders([]);
      showToast("All orders cleared from database!", "success");
    } else {
      showToast("Failed to clear orders: " + error.message, "error");
    }
  };

  const resetCompleteDemo = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        tableId,
        tableToken,
        guestName,
        specialInstructions,
        menuItems,
        orders,
        toast,
        isLoadingData,
        showToast,
        setTableId,
        setGuestName,
        setSpecialInstructions,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        placeOrder,
        updateOrderStatus,
        toggleItemAvailability,
        addMenuItem,
        updateMenuItem,
        deleteMenuItem,
        resetMenuToDefaults,
        clearAllOrders,
        resetCompleteDemo,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context)
    throw new Error("[useCart] Hook must be used within a <CartProvider>.");
  return context;
};
