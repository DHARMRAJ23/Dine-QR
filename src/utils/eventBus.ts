/**
 * @fileoverview Cross-tab event bus using a simulated WebSocket pattern.
 *
 * ARCHITECTURE
 * ────────────
 * This is a fully client-side, serverless "pub/sub" bus. It synchronises
 * real-time events between:
 *  - Customer tab  (places orders, sees live status)
 *  - Admin tab     (manages orders, updates menu)
 *
 * It achieves cross-tab communication in two steps:
 *  1. LOCAL  dispatch  — calls all registered listeners in the same JS context
 *                        immediately (zero delay, zero latency).
 *  2. CROSS-TAB sync   — writes the payload to `localStorage['dine_in_socket_event']`.
 *                        Other browser tabs detect this via the native `storage`
 *                        event and dispatch the event locally in their own context.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Customer Tab                      Admin Tab                        │
 * │  ─────────────                     ──────────                       │
 * │  socketBus.emit('new_order', o) ──► localStorage change ──► storage │
 * │         │                                                   event   │
 * │         ▼                                                     │     │
 * │  Local listeners fire                               Local listeners │
 * │  immediately (same tab)                             fire in admin   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * LIMITATIONS
 * ───────────
 * - Events are NOT persisted — they use a single overwriting key, so an event
 *   fired while all tabs are closed will never be received.
 * - This is a demo/prototype pattern. In a production system, replace this
 *   with real WebSockets (e.g. Socket.IO) or Server-Sent Events.
 * - The `storage` event does NOT fire in the same tab that wrote the value,
 *   so local dispatch is handled separately (step 1 above).
 */

import type { FoodItem, Order } from '../types';
import { isFoodItemArray, isOrder } from './storage';

// ─────────────────────────────────────────────────────────────────────────────
// Event Map — typed event names and their payload shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed map of all events that can be emitted/listened to on the socketBus.
 * Adding a new event? Add its key and payload type here first.
 */
export interface SocketEvents {
  /** Fired when a customer successfully places a new order. */
  new_order: Order;

  /** Fired when the admin moves an order to the next status stage. */
  order_status_updated: {
    orderId: string;
    status: Order['status'];
  };

  /** Fired when the admin adds, edits, deletes or toggles a menu item. */
  menu_updated: FoodItem[];
}

/** Generic callback type — infers the payload type from the event name. */
type EventCallback<K extends keyof SocketEvents> = (data: SocketEvents[K]) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Runtime payload validators for cross-tab deserialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates an `order_status_updated` payload received from another tab's
 * localStorage event. Rejects invalid status strings to prevent state corruption.
 */
function validateOrderStatusUpdate(
  data: unknown
): data is { orderId: string; status: Order['status'] } {
  if (typeof data !== 'object' || data === null) return false;
  const value = data as Record<string, unknown>;
  return (
    typeof value.orderId === 'string' &&
    value.orderId.length > 0 &&
    typeof value.status === 'string' &&
    ['placed', 'accepted', 'preparing', 'served'].includes(value.status)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SimulatedSocketBus class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A singleton pub/sub event bus that mimics a WebSocket connection using
 * only the browser's localStorage and the `storage` event.
 *
 * @example
 * // Listening (in admin dashboard):
 * const unsub = socketBus.on('new_order', (order) => {
 *   setOrders(prev => [order, ...prev]);
 * });
 * // Remember to unsubscribe on component unmount:
 * return () => unsub();
 *
 * @example
 * // Emitting (in customer cart):
 * socketBus.emit('new_order', placedOrder);
 */
class SimulatedSocketBus {
  /** Map of event names to sets of registered callbacks. */
  private listeners: Map<keyof SocketEvents, Set<EventCallback<any>>> = new Map();

  constructor() {
    // Listen for cross-tab localStorage changes
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorageEvent);
    }
  }

  /**
   * Emits an event to all local listeners AND cross-tab via localStorage.
   *
   * @param event - The event name (key of `SocketEvents`)
   * @param data  - The typed payload for this event
   */
  emit<K extends keyof SocketEvents>(event: K, data: SocketEvents[K]) {
    const payload = { event, data, timestamp: Date.now() };

    // 1. Dispatch to all listeners in THIS tab immediately
    this.dispatchLocal(event, data);

    // 2. Write to localStorage so OTHER tabs pick it up via `storage` event
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('dine_in_socket_event', JSON.stringify(payload));
      } catch (error) {
        console.error('[socketBus] Unable to dispatch cross-tab event:', error);
      }
    }
  }

  /**
   * Registers a listener callback for a specific event.
   *
   * @param event    - The event name to listen for
   * @param callback - Function called with the event payload when it fires
   * @returns        An **unsubscribe function** — call it in `useEffect` cleanup
   *
   * @example
   * useEffect(() => {
   *   const unsub = socketBus.on('menu_updated', handleMenuUpdate);
   *   return () => unsub();
   * }, []);
   */
  on<K extends keyof SocketEvents>(event: K, callback: EventCallback<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return an unsubscribe / cleanup function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
        // Remove the event key entirely when no listeners remain (memory cleanup)
        if (callbacks.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Dispatches an event to all listeners registered within THIS JavaScript context.
   * Each listener is called in a try/catch so one failing callback cannot
   * prevent others from receiving the event.
   */
  private dispatchLocal<K extends keyof SocketEvents>(event: K, data: SocketEvents[K]) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[socketBus] Error in listener for "${event}":`, err);
        }
      });
    }
  }

  /**
   * Handles the native browser `storage` event to receive cross-tab events.
   *
   * Only processes events written to `dine_in_socket_event` by THIS application.
   * Each payload is validated against its schema before being dispatched locally
   * to prevent malformed data from corrupting application state.
   *
   * NOTE: This handler does NOT fire in the tab that wrote the value — that is
   * why `emit()` also calls `dispatchLocal()` directly.
   */
  private handleStorageEvent = (e: StorageEvent) => {
    if (e.key === 'dine_in_socket_event' && e.newValue) {
      try {
        const { event, data } = JSON.parse(e.newValue);

        // Validate each event type before dispatching
        if (event === 'new_order' && isOrder(data)) {
          this.dispatchLocal('new_order', data);
        } else if (event === 'order_status_updated' && validateOrderStatusUpdate(data)) {
          this.dispatchLocal('order_status_updated', data);
        } else if (event === 'menu_updated' && isFoodItemArray(data)) {
          this.dispatchLocal('menu_updated', data);
        } else {
          console.warn('[socketBus] Received unknown or malformed cross-tab event:', { event });
        }
      } catch (err) {
        console.error('[socketBus] Failed to parse cross-tab event payload:', err);
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Application-wide singleton event bus instance.
 * Import this in any component or context that needs to emit or subscribe to events.
 *
 * @example
 * import { socketBus } from '../utils/eventBus';
 */
export const socketBus = new SimulatedSocketBus();
export default socketBus;
