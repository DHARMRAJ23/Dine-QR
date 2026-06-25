/**
 * @fileoverview Global TypeScript type definitions for the Dine-in QR Menu application.
 *
 * All shared interfaces used across components, contexts, and utilities are declared
 * here to ensure a single source of truth for the data model.
 */

// ---------------------------------------------------------------------------
// Menu / Food Catalog
// ---------------------------------------------------------------------------

/**
 * Represents a single item on the restaurant menu.
 *
 * @property id          - Unique identifier (e.g. "item-1704067200000")
 * @property name        - Display name shown to customers (max 80 chars)
 * @property price       - Price in Indian Rupees (₹1 – ₹100,000)
 * @property description - Short marketing description (max 500 chars)
 * @property image       - HTTPS URL or compressed base64 WebP data URL
 * @property category    - One of the category IDs defined in `mockData.ts`
 * @property isVeg       - true = vegetarian (green dot), false = non-veg (red dot)
 * @property isAvailable - When false, the item is hidden from customers and
 *                         cannot be added to the cart
 */
export interface FoodItem {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  category: string;
  isVeg: boolean;
  isAvailable: boolean;
}

/**
 * Represents a top-level menu category used for tab navigation on the customer view.
 *
 * @property id          - Slug used in CSS selectors and filter logic (e.g. "hot-drinks")
 * @property name        - Internal machine-readable name (matches `FoodItem.category`)
 * @property displayName - Human-readable label rendered in the UI
 */
export interface Category {
  id: string;
  name: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * A single line-item captured at the moment of order placement.
 * Prices are snapshotted here so historical orders remain accurate
 * even if the admin later changes menu prices.
 *
 * @property itemId   - References `FoodItem.id` (denormalized snapshot)
 * @property name     - Snapshotted item name at time of order
 * @property price    - Snapshotted unit price in ₹ at time of order
 * @property quantity - Number of this item ordered (1–20)
 * @property isVeg    - Snapshotted veg/non-veg status for kitchen display
 */
export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
}

/**
 * Represents a complete customer order.
 *
 * Orders flow through a strictly enforced one-way state machine:
 * `placed` → `accepted` → `preparing` → `served`
 *
 * All monetary values are in Indian Rupees (₹) as integers.
 *
 * @property id                  - Unique order ID (e.g. "ord-a1b2c3d4")
 * @property tableId             - Table number (validated 1–100 string)
 * @property guestName           - Customer's self-reported name (max 60 chars)
 * @property items               - Array of snapshotted `OrderItem` objects
 * @property specialInstructions - Optional kitchen notes from the guest (max 500 chars)
 * @property subtotal            - Sum of all (price × quantity) before fees
 * @property tax                 - 5% GST calculated from subtotal (rounded to ₹)
 * @property serviceCharge       - Flat ₹20 service charge
 * @property grandTotal          - subtotal + tax + serviceCharge
 * @property status              - Current position in the order state machine
 * @property placedAt            - ISO 8601 timestamp (e.g. "2024-01-15T10:30:00.000Z")
 */
export interface Order {
  id: string;
  tableId: string;
  guestName: string;
  items: OrderItem[];
  specialInstructions?: string;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  grandTotal: number;
  status: 'placed' | 'accepted' | 'preparing' | 'served';
  placedAt: string; // ISO 8601 string
}
