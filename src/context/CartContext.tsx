/**
 * @fileoverview Global application state via React Context — the single
 * source of truth for menu, cart, orders, and admin management actions.
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * `CartProvider` wraps the entire app in App.tsx. Every screen (customer and
 * admin) reads from and writes to this single shared context instance.
 *
 * DATA FLOW
 * ─────────
 *   localStorage   ──► CartProvider initial state
 *   CartProvider   ──► socketBus.emit() ──► Other tabs via `storage` event
 *   CartProvider   ──► localStorage (write on every mutation)
 *   socketBus.on() ──► setOrders/setMenuItems (same-tab real-time sync)
 *
 * PERSISTENCE STRATEGY
 * ────────────────────
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Data               Storage          Key                           │
 * │  ─────────────────  ───────────────  ─────────────────────────────  │
 * │  Menu items         localStorage    dine_in_menu                   │
 * │  All orders         localStorage    dine_in_orders                 │
 * │  Active cart        sessionStorage  dine_in_cart                   │
 * │  Table ID           sessionStorage  dine_in_table_id               │
 * │  Guest name         sessionStorage  dine_in_guest_name             │
 * │  Special notes      sessionStorage  dine_in_special_instructions   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * `localStorage` persists across tabs and browser restarts.
 * `sessionStorage` is per-tab and cleared when the tab is closed —
 *  intentional so a new customer at the same table starts fresh.
 */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { FoodItem, Order, OrderItem } from '../types';
import { INITIAL_FOOD_ITEMS } from '../data/mockData';
import { socketBus } from '../utils/eventBus';
import { BILLING_CONFIG } from '../config/billing';
import { 
  readStorage, 
  writeStorage, 
  isFoodItemArray, 
  isOrderArray, 
  isCartItemArray 
} from '../utils/storage';

/** Minimum quantity a customer can select for any single item in their cart. */
export const MIN_ITEM_QUANTITY = 1;

/** Maximum quantity a customer can select for any single item in their cart. */
export const MAX_ITEM_QUANTITY = 20;

/**
 * Validates whether a proposed order status transition is permitted.
 *
 * The order lifecycle is a strict one-directional state machine:
 *   placed → accepted → preparing → served
 *
 * This prevents regressions (e.g., marking a served order as placed again)
 * and accidental skips (e.g., going from placed → served directly).
 *
 * @param current - The order's current status
 * @param target  - The proposed new status
 * @returns       `true` if the transition is allowed, `false` otherwise
 */
const isValidOrderTransition = (
  current: Order['status'],
  target: Order['status']
) => {
  // Each status maps to the only valid next status it can move to
  const transitions: Record<Order['status'], Order['status'][]> = {
    placed:    ['accepted'],   // Admin accepts an incoming order
    accepted:  ['preparing'], // Kitchen starts cooking
    preparing: ['served'],    // Food has been delivered to the table
    served:    [],            // Terminal state — no further transitions allowed
  };
  return transitions[current]?.includes(target) ?? false;
};

/**
 * A menu item paired with the quantity the customer wants.
 * Stored in sessionStorage so the cart persists through page refreshes
 * within the same browser tab.
 */
export interface CartItem {
  /** The full FoodItem object (kept live — updates when admin edits menu). */
  item: FoodItem;
  /** Number of this item selected (always within MIN_ITEM_QUANTITY–MAX_ITEM_QUANTITY). */
  quantity: number;
}

/**
 * Complete public API of the CartContext.
 * Every value and method below is accessible via `useCart()`.
 */
interface CartContextType {
  // ── Customer-facing state ───────────────────────────────────────────────

  /** Current items in the customer's cart for this session. */
  cart: CartItem[];

  /** Table number scanned from the QR code (e.g. "5"). Null before QR scan. */
  tableId: string | null;

  /** Customer's self-entered display name used on the order card. */
  guestName: string;

  /** Optional kitchen notes entered by the customer before checkout. */
  specialInstructions: string;

  // ── Shared state ────────────────────────────────────────────────────────

  /** Live menu, kept in sync across tabs via socketBus + localStorage. */
  menuItems: FoodItem[];

  /** All orders ever placed in this session (persisted in localStorage). */
  orders: Order[];

  /** Currently active toast notification, or null if none is showing. */
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;

  // ── Customer Actions ─────────────────────────────────────────────────────

  /** Displays a sliding toast notification for 3 seconds. */
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;

  /** Sets the table ID (called from MainMenu after reading the URL param). */
  setTableId: (id: string | null) => void;

  /** Updates the guest name (called from CartPage checkout form). */
  setGuestName: (name: string) => void;

  /** Updates the optional kitchen notes (called from CartPage). */
  setSpecialInstructions: (notes: string) => void;

  /** Adds a FoodItem to the cart (increments quantity if already present). */
  addToCart: (item: FoodItem) => void;

  /** Removes a FoodItem entirely from the cart. */
  removeFromCart: (itemId: string) => void;

  /** Sets the exact quantity for a given cart item; validates range. */
  updateQuantity: (itemId: string, quantity: number) => void;

  /** Empties the cart and clears sessionStorage. */
  clearCart: () => void;

  /**
   * Validates and submits the cart as a new Order.
   * Saves to localStorage, emits via socketBus, then clears the cart.
   * @returns The newly created Order on success, or null if locked.
   * @throws Error if the cart is empty, table/name is missing, or items are unavailable.
   */
  placeOrder: () => Order | null;

  // ── Admin Actions ─────────────────────────────────────────────────────────

  /** Advances an order to its next status (enforces the state machine). */
  updateOrderStatus: (orderId: string, status: Order['status']) => void;

  /** Flips an item's isAvailable flag and syncs across tabs. */
  toggleItemAvailability: (itemId: string) => void;

  /** Creates a new menu item with an auto-generated ID. */
  addMenuItem: (item: Omit<FoodItem, 'id'>) => void;

  /** Replaces an existing menu item by matching ID. */
  updateMenuItem: (item: FoodItem) => void;

  /** Removes a menu item by ID (does not affect existing orders). */
  deleteMenuItem: (itemId: string) => void;

  // ── Demo / Admin Reset Actions ────────────────────────────────────────────

  /** Restores the menu to the original `mockData.ts` items. */
  resetMenuToDefaults: () => void;

  /** Clears all order history from state and localStorage. */
  clearAllOrders: () => void;

  /** Full factory reset — clears all storage keys and reloads the page. */
  resetCompleteDemo: () => void;
}

/** Internal React Context — do not consume directly; use `useCart()` instead. */
const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Top-level state provider for the entire Dine-in QR Menu application.
 *
 * Wrap your app's root with this component so that every page —
 * customer menu, cart, order tracker, and all admin screens —
 * can access the same live data.
 *
 * @example
 * // In main.tsx or App.tsx:
 * <CartProvider>
 *   <AuthProvider>
 *     <AppContent />
 *   </AuthProvider>
 * </CartProvider>
 */
export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ── Toast notification state ──────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  /**
   * Displays a sliding toast message to the user for 3 seconds.
   * The toast UI is rendered in App.tsx as a global overlay.
   *
   * @param message - Human-readable text to display
   * @param type    - Controls the colour: success (green), error (red), info (white)
   */
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  /**
   * Wraps `writeStorage` to automatically show the user a toast if the write
   * fails (e.g. browser storage quota exceeded — common when many base64
   * images are uploaded as menu item photos).
   *
   * @param storage - `localStorage` or `sessionStorage`
   * @param key     - Storage key
   * @param value   - JSON-serialisable value to store
   * @returns `true` if write succeeded, `false` if it failed
   */
  const saveToStorage = (storage: Storage, key: string, value: unknown) => {
    const success = writeStorage(storage, key, value);
    if (!success) {
      showToast('Browser storage is full. Remove uploaded images or reset demo data.', 'error');
    }
    return success;
  };

  // ── State Initialisation ─────────────────────────────────────────────────
  //
  // All state is lazily initialised from persistent storage on first render.
  // `readStorage` handles missing/corrupted data by returning the fallback.

  /**
   * The live menu catalogue. On first load, seeds localStorage from mockData
   * if no previous menu has been saved. Stays in sync across tabs via socketBus.
   */
  const [menuItems, setMenuItems] = useState<FoodItem[]>(() => {
    const stored = readStorage(localStorage, 'dine_in_menu', INITIAL_FOOD_ITEMS, isFoodItemArray);
    // Seed localStorage on first run so other tabs can read the menu
    if (!localStorage.getItem('dine_in_menu')) {
      writeStorage(localStorage, 'dine_in_menu', INITIAL_FOOD_ITEMS);
    }
    return stored;
  });

  /**
   * All orders placed during the lifetime of the app.
   * Stored in localStorage so admin tabs can read them even after a page refresh.
   * Empty array on first use (no previous orders).
   */
  const [orders, setOrders] = useState<Order[]>(() => {
    return readStorage(localStorage, 'dine_in_orders', [], isOrderArray);
  });

  /**
   * The active cart for the current customer session.
   * sessionStorage is intentional — it resets when the tab closes so the
   * next customer at the same table starts with an empty cart.
   */
  const [cart, setCart] = useState<CartItem[]>(() => {
    return readStorage(sessionStorage, 'dine_in_cart', [], isCartItemArray);
  });

  /**
   * The current table number, extracted from the QR code URL parameter.
   * e.g. `/#/menu/5` → tableId = "5"
   * Persisted in sessionStorage so it survives page refreshes within the tab.
   */
  const [tableId, setTableIdState] = useState<string | null>(() => {
    return readStorage(sessionStorage, 'dine_in_table_id', null, (v): v is string => typeof v === 'string');
  });

  /**
   * Customer-provided name entered on the CartPage checkout form.
   * Persisted in sessionStorage so it survives page refreshes.
   */
  const [guestName, setGuestNameState] = useState<string>(() => {
    return readStorage(sessionStorage, 'dine_in_guest_name', '', (v): v is string => typeof v === 'string');
  });

  /**
   * Optional kitchen instructions entered by the customer before checkout.
   * Examples: "No onions", "Extra spicy", "Gluten-free plate please".
   */
  const [specialInstructions, setSpecialInstructionsState] = useState<string>(() => {
    return readStorage(sessionStorage, 'dine_in_special_instructions', '', (v): v is string => typeof v === 'string');
  });

  /**
   * Prevents duplicate order submissions from double-taps or rapid button clicks.
   * Using a ref instead of state avoids triggering a re-render during the lock period.
   * Set to `true` at the start of `placeOrder()` and reset to `false` in the
   * `finally` block, even if an error occurs.
   */
  const placingOrderRef = useRef(false);

  // Clear toast automatically after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const setTableId = (id: string | null) => {
    setTableIdState(id);
    if (id) {
      saveToStorage(sessionStorage, 'dine_in_table_id', id);
    } else {
      sessionStorage.removeItem('dine_in_table_id');
    }
  };

  const setGuestName = (name: string) => {
    const trimmed = name.slice(0, 60);
    setGuestNameState(trimmed);
    saveToStorage(sessionStorage, 'dine_in_guest_name', trimmed);
  };

  const setSpecialInstructions = (notes: string) => {
    const truncated = notes.slice(0, 500);
    setSpecialInstructionsState(truncated);
    saveToStorage(sessionStorage, 'dine_in_special_instructions', truncated);
  };

  // Sync cart state changes to sessionStorage
  useEffect(() => {
    saveToStorage(sessionStorage, 'dine_in_cart', cart);
  }, [cart]);

  // Sync state if menu database updates
  useEffect(() => {
    setCart((prevCart) => {
      if (prevCart.length === 0) return prevCart;

      let changed = false;
      const updatedCart = prevCart.map((cartItem) => {
        const dbItem = menuItems.find((m) => m.id === cartItem.item.id);
        if (!dbItem) {
          changed = true;
          return null;
        }
        if (
          dbItem.price !== cartItem.item.price ||
          dbItem.name !== cartItem.item.name ||
          dbItem.isVeg !== cartItem.item.isVeg ||
          dbItem.image !== cartItem.item.image
        ) {
          changed = true;
          return { ...cartItem, item: dbItem };
        }
        return cartItem;
      }).filter(Boolean) as CartItem[];

      return changed ? updatedCart : prevCart;
    });
  }, [menuItems]);

  // Synchronize state with socketBus and browser storage updates
  useEffect(() => {
    const unsubscribeStatus = socketBus.on('order_status_updated', ({ orderId, status }: { orderId: string; status: Order['status'] }) => {
      setOrders((prev) => {
        const updated = prev.map((order) => {
          if (order.id !== orderId) return order;
          return isValidOrderTransition(order.status, status)
            ? { ...order, status }
            : order;
        });
        saveToStorage(localStorage, 'dine_in_orders', updated);
        return updated;
      });
    });

    const unsubscribeNewOrder = socketBus.on('new_order', (newOrder: Order) => {
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        const updated = [newOrder, ...prev];
        saveToStorage(localStorage, 'dine_in_orders', updated);
        return updated;
      });
    });

    const unsubscribeMenu = socketBus.on('menu_updated', (updatedMenu: FoodItem[]) => {
      setMenuItems(updatedMenu);
      saveToStorage(localStorage, 'dine_in_menu', updatedMenu);
    });

    // Listen to direct localstorage changes from other tabs
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'dine_in_menu' && e.newValue) {
        const parsed = readStorage(localStorage, 'dine_in_menu', INITIAL_FOOD_ITEMS, isFoodItemArray);
        setMenuItems(parsed);
      }
      if (e.key === 'dine_in_orders' && e.newValue) {
        const parsed = readStorage(localStorage, 'dine_in_orders', [], isOrderArray);
        setOrders(parsed);
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      unsubscribeStatus();
      unsubscribeNewOrder();
      unsubscribeMenu();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  // Cart operations
  const addToCart = (item: FoodItem) => {
    const dbItem = menuItems.find((i) => i.id === item.id);
    if (!dbItem || !dbItem.isAvailable) {
      showToast(`Sorry, "${item.name}" is currently out of stock!`, 'error');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        if (existing.quantity >= MAX_ITEM_QUANTITY) {
          showToast(`Maximum quantity of ${MAX_ITEM_QUANTITY} reached for "${item.name}"!`, 'info');
          return prev;
        }
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
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

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < MIN_ITEM_QUANTITY ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      return;
    }

    const dbItem = menuItems.find((i) => i.id === itemId);
    if (!dbItem || !dbItem.isAvailable) {
      console.warn(`Cannot modify quantity of unavailable item.`);
      return;
    }

    setCart((prev) =>
      prev.map((i) => (i.item.id === itemId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => {
    setCart([]);
    setSpecialInstructionsState('');
    sessionStorage.removeItem('dine_in_cart');
    sessionStorage.removeItem('dine_in_special_instructions');
  };

  const placeOrder = (): Order | null => {
    if (placingOrderRef.current) {
      console.warn('Submit operations locked.');
      return null;
    }

    if (cart.length === 0 || !tableId || !guestName.trim()) {
      throw new Error('Missing guest details, table number or empty cart.');
    }

    const unavailableItems = cart.filter(ci => {
      const dbItem = menuItems.find(m => m.id === ci.item.id);
      return !dbItem || !dbItem.isAvailable;
    });

    if (unavailableItems.length > 0) {
      const namesList = unavailableItems.map(ui => ui.item.name).join(', ');
      throw new Error(`The following items in your cart are currently out of stock: ${namesList}`);
    }

    placingOrderRef.current = true;

    try {
      const orderItems: OrderItem[] = cart.map((ci) => ({
        itemId: ci.item.id,
        name: ci.item.name,
        price: ci.item.price,
        quantity: ci.quantity,
        isVeg: ci.item.isVeg,
      }));

      const subtotal = cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);
      const tax = Math.round(subtotal * BILLING_CONFIG.taxRate);
      const serviceCharge = BILLING_CONFIG.serviceCharge;
      const grandTotal = subtotal + tax + serviceCharge;

      const generateUUID = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };

      // Unique ID check
      let orderId = `ord-${generateUUID().slice(0, 8)}`;
      let tries = 0;
      while (orders.some(o => o.id === orderId) && tries < 10) {
        orderId = `ord-${generateUUID().slice(0, 8)}`;
        tries++;
      }

      const newOrder: Order = {
        id: orderId,
        tableId,
        guestName: guestName.trim().slice(0, 60),
        items: orderItems,
        specialInstructions: specialInstructions.trim().slice(0, 500) || undefined,
        subtotal,
        tax,
        serviceCharge,
        grandTotal,
        status: 'placed',
        placedAt: new Date().toISOString(),
      };

      setOrders((prev) => {
        const updated = [newOrder, ...prev];
        saveToStorage(localStorage, 'dine_in_orders', updated);
        return updated;
      });

      socketBus.emit('new_order', newOrder);
      clearCart();
      return newOrder;
    } finally {
      placingOrderRef.current = false;
    }
  };

  // Admin Actions
  const updateOrderStatus = (orderId: string, status: Order['status']) => {
    let transitionAllowed = true;
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        if (!isValidOrderTransition(o.status, status)) {
          console.warn(`Invalid order transition from ${o.status} to ${status} rejected.`);
          transitionAllowed = false;
          return o;
        }
        return { ...o, status };
      }
      return o;
    });

    if (!transitionAllowed) return;

    setOrders(updated);
    saveToStorage(localStorage, 'dine_in_orders', updated);
    socketBus.emit('order_status_updated', { orderId, status });
  };

  // ── Admin: Menu Management Actions ───────────────────────────────────────

  /**
   * Toggles a menu item's availability on/off.
   * When `isAvailable = false`, the item is hidden from customers and
   * cannot be added to the cart. Syncs across tabs via socketBus.
   *
   * @param itemId - ID of the FoodItem to toggle
   */
  const toggleItemAvailability = (itemId: string) => {
    const updated = menuItems.map((item) =>
      item.id === itemId ? { ...item, isAvailable: !item.isAvailable } : item
    );
    setMenuItems(updated);
    saveToStorage(localStorage, 'dine_in_menu', updated);
    socketBus.emit('menu_updated', updated);
  };

  /**
   * Adds a new item to the menu with an auto-generated timestamp-based ID.
   * The new item appears at the bottom of its category.
   *
   * @param item - All FoodItem fields except `id` (generated here)
   */
  const addMenuItem = (item: Omit<FoodItem, 'id'>) => {
    const newItem: FoodItem = {
      ...item,
      id: `item-${Date.now()}`, // Unique enough for this demo app
    };
    const updated = [...menuItems, newItem];
    setMenuItems(updated);
    saveToStorage(localStorage, 'dine_in_menu', updated);
    socketBus.emit('menu_updated', updated);
  };

  /**
   * Replaces an existing menu item (matched by `id`) with updated fields.
   * Any active cart items pointing to this menu item will reflect the
   * updated data on the next `menuItems` sync (see reconciliation effect below).
   *
   * @param updatedItem - The full FoodItem with updated fields
   */
  const updateMenuItem = (updatedItem: FoodItem) => {
    const updated = menuItems.map((item) => (item.id === updatedItem.id ? updatedItem : item));
    setMenuItems(updated);
    saveToStorage(localStorage, 'dine_in_menu', updated);
    socketBus.emit('menu_updated', updated);
  };

  /**
   * Permanently removes a menu item by ID.
   * Existing orders are NOT affected — they store snapshotted OrderItem data,
   * not live references to FoodItems.
   *
   * @param itemId - ID of the FoodItem to delete
   */
  const deleteMenuItem = (itemId: string) => {
    const updated = menuItems.filter((item) => item.id !== itemId);
    setMenuItems(updated);
    saveToStorage(localStorage, 'dine_in_menu', updated);
    socketBus.emit('menu_updated', updated);
  };

  // ── Admin: Demo Reset Actions ─────────────────────────────────────────────

  /**
   * Restores the menu to the original items from `mockData.ts`.
   * All admin-added/edited items are overwritten. Order history is preserved.
   */
  const resetMenuToDefaults = () => {
    setMenuItems(INITIAL_FOOD_ITEMS);
    saveToStorage(localStorage, 'dine_in_menu', INITIAL_FOOD_ITEMS);
    socketBus.emit('menu_updated', INITIAL_FOOD_ITEMS);
    showToast('Menu reset to defaults!', 'success');
  };

  /**
   * Deletes all order records from state and localStorage.
   * The menu is preserved. Used in the admin settings panel.
   */
  const clearAllOrders = () => {
    setOrders([]);
    saveToStorage(localStorage, 'dine_in_orders', []);
    // Emit a dummy event to signal cross-tab listeners to refresh
    socketBus.emit('order_status_updated', { orderId: '_reload_', status: 'served' });
    showToast('All orders cleared!', 'success');
  };

  /**
   * Performs a full factory reset of the demo:
   *  - Restores menu to defaults
   *  - Clears all orders and the active cart
   *  - Removes the admin session token (forces re-login)
   *  - Removes all app-owned storage keys
   *  - Reloads the page to return to a pristine state
   *
   * ⚠️  This is irreversible. Always show a confirmation dialog before calling.
   */
  const resetCompleteDemo = () => {
    // Reset all in-memory state
    setMenuItems(INITIAL_FOOD_ITEMS);
    setOrders([]);
    setCart([]);
    setTableIdState('1');
    setGuestNameState('');
    setSpecialInstructionsState('');

    // Remove all app-owned localStorage keys
    localStorage.removeItem('dine_in_menu');
    localStorage.removeItem('dine_in_orders');
    // Remove all app-owned sessionStorage keys
    sessionStorage.removeItem('dine_in_cart');
    sessionStorage.removeItem('dine_in_table_id');
    sessionStorage.removeItem('dine_in_guest_name');
    sessionStorage.removeItem('dine_in_special_instructions');
    // Also remove the admin session so the login page appears fresh
    localStorage.removeItem('demo_admin_session');

    showToast('Complete demo reset!', 'success');
    window.location.reload(); // Hard reload to clear any React state not covered above
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        tableId,
        guestName,
        specialInstructions,
        menuItems,
        orders,
        toast,
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

/**
 * Custom hook that provides access to the full CartContext API.
 *
 * Must be used inside a `<CartProvider>` subtree. Throws a clear error
 * if called outside of it so developers get immediate feedback.
 *
 * @returns The full `CartContextType` object
 * @throws  Error if called outside a `<CartProvider>`
 *
 * @example
 * const { cart, addToCart, placeOrder } = useCart();
 */
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('[useCart] Hook must be used within a <CartProvider>.');
  }
  return context;
};
