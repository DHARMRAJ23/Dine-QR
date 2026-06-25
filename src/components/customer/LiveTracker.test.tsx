import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LiveTracker from './LiveTracker';
import { CartProvider, useCart } from '../../context/CartContext';

let cartApi: ReturnType<typeof useCart> | null = null;

const CaptureCart = ({ children }: { children: React.ReactNode }) => {
  cartApi = useCart();
  return children;
};

describe('LiveTracker', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cartApi = null;
  });

  it('shows Order Not Found after the tracked order is cleared', () => {
    const order = {
      id: 'ord-test123',
      tableId: '4',
      guestName: 'Asha',
      items: [
        {
          itemId: 'hd-1',
          name: 'Vanilla Bean Latte',
          price: 180,
          quantity: 1,
          isVeg: true,
        },
      ],
      subtotal: 180,
      tax: 9,
      serviceCharge: 20,
      grandTotal: 209,
      status: 'placed' as const,
      placedAt: new Date().toISOString(),
    };

    localStorage.setItem('dine_in_orders', JSON.stringify([order]));

    render(
      <CartProvider>
        <CaptureCart>
          <MemoryRouter initialEntries={['/status/ord-test123']}>
            <Routes>
              <Route path="/status/:orderId" element={<LiveTracker />} />
            </Routes>
          </MemoryRouter>
        </CaptureCart>
      </CartProvider>
    );

    expect(screen.getByText('Order Placed Successfully!')).toBeDefined();

    act(() => {
      cartApi!.clearAllOrders();
    });

    expect(screen.getByText('Order Not Found')).toBeDefined();
  });
});
