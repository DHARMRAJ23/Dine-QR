/**
 * @fileoverview Billing configuration for the Dine-in QR Menu system.
 *
 * Centralises all financial constants so they can be updated from one place
 * and automatically reflected across: CartContext (order calculation),
 * CartPage (bill breakdown UI), and LiveTracker (receipt display).
 *
 * ⚠️  Any changes here affect all existing and future orders rendered in the UI.
 *      Do NOT change these values in production without updating existing order records.
 */

/**
 * Global billing settings used throughout the ordering and checkout flow.
 *
 * @example
 * // Computing order totals:
 * const tax = Math.round(subtotal * BILLING_CONFIG.taxRate);
 * const grandTotal = subtotal + tax + BILLING_CONFIG.serviceCharge;
 */
export const BILLING_CONFIG = {
  /** Indian GST rate (5%). Applied to item subtotal; rounded to the nearest rupee. */
  taxRate: 0.05,

  /** Flat per-order service charge in ₹ (Indian Rupees). Added after tax. */
  serviceCharge: 20,
};
