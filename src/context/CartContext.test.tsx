import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { CartProvider, useCart } from './CartContext';
import { INITIAL_FOOD_ITEMS } from '../data/mockData';

// Helper component to interact with CartContext
const TestConsumer = ({ onHook }: { onHook: (hookValues: ReturnType<typeof useCart>) => void }) => {
  const hookValues = useCart();
  onHook(hookValues);
  return null;
};

const renderCartContext = (onHook: (hookValues: ReturnType<typeof useCart>) => void) => {
  return render(
    <CartProvider>
      <TestConsumer onHook={onHook} />
    </CartProvider>
  );
};

describe('CartContext & Billing Calculations', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('initializes with default menu items', () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    expect(hook!.menuItems).toBeDefined();
    expect(hook!.menuItems.length).toBeGreaterThan(0);
    expect(hook!.menuItems[0].name).toBe(INITIAL_FOOD_ITEMS[0].name);
  });

  it('adds items to cart and validates quantity limits (1-20)', () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    const item = hook!.menuItems[0];

    // Add first item
    act(() => {
      hook!.addToCart(item);
    });
    expect(hook!.cart.length).toBe(1);
    expect(hook!.cart[0].quantity).toBe(1);

    // Increase quantity up to limit
    for (let i = 0; i < 25; i++) {
      act(() => {
        hook!.addToCart(item);
      });
    }
    // Limit is 20
    expect(hook!.cart[0].quantity).toBe(20);

    // Try manual update above limit
    act(() => {
      hook!.updateQuantity(item.id, 25);
    });
    // Should clamp / ignore invalid bounds
    expect(hook!.cart[0].quantity).toBe(20);

    // Try update below 0
    act(() => {
      hook!.updateQuantity(item.id, -1);
    });
    // Less than or equal to 0 removes from cart
    expect(hook!.cart.length).toBe(0);
  });

  it('calculates billing correctly based on BILLING_CONFIG tax rates', () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    const item = hook!.menuItems[0];

    act(() => {
      hook!.addToCart(item);
      hook!.setTableId('5');
      hook!.setGuestName('John Doe');
    });

    let order: any = null;
    act(() => {
      order = hook!.placeOrder();
    });

    expect(order).not.toBeNull();
    if (order) {
      const expectedSubtotal = item.price;
      const expectedTax = Math.round(expectedSubtotal * 0.05);
      const expectedServiceCharge = 20;
      const expectedTotal = expectedSubtotal + expectedTax + expectedServiceCharge;

      expect(order.subtotal).toBe(expectedSubtotal);
      expect(order.tax).toBe(expectedTax);
      expect(order.serviceCharge).toBe(expectedServiceCharge);
      expect(order.grandTotal).toBe(expectedTotal);
    }
  });

  it('restricts order transitions correctly', () => {
    let hook: ReturnType<typeof useCart> | null = null;
    renderCartContext((h) => {
      hook = h;
    });

    const item = hook!.menuItems[0];
    act(() => {
      hook!.addToCart(item);
      hook!.setTableId('12');
      hook!.setGuestName('Jane Doe');
    });

    let order: any = null;
    act(() => {
      order = hook!.placeOrder();
    });

    expect(order.status).toBe('placed');

    // Invalid transition directly to preparing (must go to accepted first)
    act(() => {
      hook!.updateOrderStatus(order.id, 'preparing');
    });
    expect(hook!.orders.find(o => o.id === order.id)?.status).toBe('placed');

    // Valid transition placed -> accepted
    act(() => {
      hook!.updateOrderStatus(order.id, 'accepted');
    });
    expect(hook!.orders.find(o => o.id === order.id)?.status).toBe('accepted');

    // Valid transition accepted -> preparing
    act(() => {
      hook!.updateOrderStatus(order.id, 'preparing');
    });
    expect(hook!.orders.find(o => o.id === order.id)?.status).toBe('preparing');

    // Valid transition preparing -> served
    act(() => {
      hook!.updateOrderStatus(order.id, 'served');
    });
    expect(hook!.orders.find(o => o.id === order.id)?.status).toBe('served');
  });
});
