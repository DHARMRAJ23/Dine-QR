/**
 * @fileoverview Safe localStorage / sessionStorage read-write helpers with
 * JSON schema validation and type guards for every persistent data structure.
 *
 * WHY THIS MODULE EXISTS
 * ──────────────────────
 * localStorage can contain:
 *  1. Data saved by a different/older version of the app (schema mismatch).
 *  2. Data manually edited by the user (corruption).
 *  3. Partial writes from a previous crash (truncated JSON).
 *  4. Storage quota exceeded errors on write.
 *
 * All of these scenarios are handled here so every other file in the project
 * can use storage safely without try/catch boilerplate.
 *
 * USAGE
 * ─────
 * import { readStorage, writeStorage, isFoodItemArray } from './storage';
 *
 * const menu = readStorage(localStorage, 'dine_in_menu', [], isFoodItemArray);
 * const ok   = writeStorage(localStorage, 'dine_in_menu', updatedMenu);
 */

import type { FoodItem, Order, OrderItem } from "../types";
import type { CartItem } from "../context/CartContext";

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards — one per domain object
// Each guard returns `true` only if the runtime value satisfies the interface.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that `value` is a well-formed `FoodItem` object.
 *
 * Checks all required primitive fields. `image` is accepted as-is because it
 * can be a long base64 data URL (validated at upload time, not on read).
 */
export function isFoodItem(value: unknown): value is FoodItem {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.price === "number" &&
    Number.isFinite(o.price) &&
    o.price >= 0 &&
    typeof o.description === "string" &&
    typeof o.category === "string" &&
    typeof o.image === "string" &&
    typeof o.isVeg === "boolean" &&
    typeof o.isAvailable === "boolean"
  );
}

/**
 * Validates that `value` is an array where every element is a valid `FoodItem`.
 * An empty array `[]` is considered valid (menu can be intentionally cleared).
 */
export function isFoodItemArray(value: unknown): value is FoodItem[] {
  return Array.isArray(value) && value.every(isFoodItem);
}

/**
 * Validates that `value` is a well-formed `OrderItem` (a snapshot line-item).
 * This is used inside `isOrder` — not exported for direct external use.
 */
export function isOrderItem(value: unknown): value is OrderItem {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.itemId === "string" &&
    typeof o.name === "string" &&
    typeof o.price === "number" &&
    typeof o.quantity === "number" &&
    typeof o.isVeg === "boolean"
  );
}

/**
 * Validates that `value` is one of the four permitted order status strings.
 * Used to prevent invalid status values being loaded from storage or emitted
 * across tabs via the event bus.
 */
export function isOrderStatus(value: unknown): value is Order["status"] {
  return (
    typeof value === "string" &&
    ["placed", "accepted", "preparing", "served"].includes(value)
  );
}

/**
 * Validates that `value` is a complete, well-formed `Order` object.
 * Runs `isOrderItem` on every item in the `items` array.
 */
export function isOrder(value: unknown): value is Order {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  // Validate placedAt is a valid ISO 8601 date string
  const isValidDate =
    typeof o.placedAt === "string" &&
    !isNaN(Date.parse(o.placedAt)) &&
    /^\d{4}-\d{2}-\d{2}/.test(o.placedAt);
  return (
    typeof o.id === "string" &&
    typeof o.tableId === "string" &&
    typeof o.guestName === "string" &&
    Array.isArray(o.items) &&
    o.items.every(isOrderItem) &&
    typeof o.subtotal === "number" &&
    typeof o.tax === "number" &&
    typeof o.serviceCharge === "number" &&
    typeof o.grandTotal === "number" &&
    isOrderStatus(o.status) &&
    isValidDate
  );
}

/**
 * Validates that `value` is an array where every element is a valid `Order`.
 * An empty array `[]` is considered valid (order board can be intentionally cleared).
 */
export function isOrderArray(value: unknown): value is Order[] {
  return Array.isArray(value) && value.every(isOrder);
}

/**
 * Validates that `value` is a single `CartItem` (a menu item + quantity pair).
 * Runs `isFoodItem` on the nested `item` property.
 */
export function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    isFoodItem(o.item) &&
    typeof o.quantity === "number" &&
    Number.isInteger(o.quantity) &&
    o.quantity >= 1 &&
    o.quantity <= 20
  );
}

/**
 * Validates that `value` is an array where every element is a valid `CartItem`.
 * An empty array `[]` is considered valid (empty cart is a normal state).
 */
export function isCartItemArray(value: unknown): value is CartItem[] {
  return Array.isArray(value) && value.every(isCartItem);
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe Storage Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads and validates a value from browser storage.
 *
 * If the stored value is absent, fails JSON parsing, or fails the optional
 * `validator` type guard, the corrupted/invalid entry is **removed** and the
 * `fallback` is returned instead — ensuring the app always starts with
 * a known-good state rather than crashing.
 *
 * @param storage   - `localStorage` or `sessionStorage` (or null/undefined for SSR)
 * @param key       - Storage key to read from
 * @param fallback  - Value to return if the key is absent or invalid
 * @param validator - Optional type-guard function; if omitted, the raw parsed
 *                    JSON is returned without structural validation
 * @returns         The validated stored value, or `fallback`
 *
 * @example
 * const menu = readStorage(localStorage, 'dine_in_menu', [], isFoodItemArray);
 * const name = readStorage(sessionStorage, 'dine_in_guest_name', '',
 *                          (v): v is string => typeof v === 'string');
 */
export function readStorage<T>(
  storage: Storage | undefined | null,
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T,
): T {
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);

    // If a validator is provided, enforce it; otherwise return the parsed value
    if (validator) {
      if (validator(parsed)) {
        return parsed;
      } else {
        console.warn(
          `[storage] Validation failed for key "${key}". ` +
            `Removing corrupted value and returning fallback.`,
        );
        try {
          storage.removeItem(key);
        } catch {
          /* ignore */
        }
        return fallback;
      }
    }

    return parsed as T;
  } catch (err) {
    console.error(
      `[storage] Error reading key "${key}". Removing and returning fallback.`,
      err,
    );
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

/**
 * Serialises `value` to JSON and writes it to browser storage.
 *
 * Catches `QuotaExceededError` (and any other write errors) so callers never
 * need try/catch. Returns `false` on failure so the caller can show the user
 * a meaningful warning (e.g. "Storage is full. Remove uploaded images or reset data.").
 *
 * @param storage - `localStorage` or `sessionStorage` (or null/undefined for SSR)
 * @param key     - Storage key to write to
 * @param value   - Any JSON-serialisable value
 * @returns       `true` if the write succeeded, `false` if it failed
 *
 * @example
 * const ok = writeStorage(localStorage, 'dine_in_orders', orders);
 * if (!ok) showToast('Storage is full!', 'error');
 */
export function writeStorage(
  storage: Storage | undefined | null,
  key: string,
  value: unknown,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(
      `[storage] Quota or write error for key "${key}". Data NOT saved.`,
      err,
    );
    return false;
  }
}
