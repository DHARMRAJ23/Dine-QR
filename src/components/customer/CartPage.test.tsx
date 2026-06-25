import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CartPage from './CartPage';
import { CartProvider, useCart } from '../../context/CartContext';

// Helper to add items to cart programmatically
const AddItemAndRender = ({ children }: { children: React.ReactNode }) => {
  const { addToCart, menuItems, setTableId } = useCart();
  const added = React.useRef(false);
  React.useEffect(() => {
    if (!added.current && menuItems.length > 0) {
      added.current = true;
      setTableId('3');
      addToCart(menuItems[0]);
    }
  }, [addToCart, menuItems, setTableId]);
  return <>{children}</>;
};

describe('CartPage Component & Form Validations', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('displays empty cart message when cart is empty', () => {
    render(
      <CartProvider>
        <MemoryRouter initialEntries={['/cart']}>
          <Routes>
            <Route path="/cart" element={<CartPage />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    );

    expect(screen.getByText('Your Cart is Empty')).toBeDefined();
    expect(screen.getByText('Browse Menu')).toBeDefined();
  });

  it('requires guest name to place an order', () => {
    render(
      <CartProvider>
        <AddItemAndRender>
          <MemoryRouter initialEntries={['/cart']}>
            <Routes>
              <Route path="/cart" element={<CartPage />} />
            </Routes>
          </MemoryRouter>
        </AddItemAndRender>
      </CartProvider>
    );

    const placeOrderBtn = screen.getByRole('button', { name: /Place Order/i });
    expect(placeOrderBtn).toBeDefined();

    fireEvent.click(placeOrderBtn);

    expect(
      screen.getByText(/Your name is required so the waitstaff can identify you/i)
    ).toBeDefined();
  });

  it('successfully places order and navigates when validation passes', () => {
    render(
      <CartProvider>
        <AddItemAndRender>
          <MemoryRouter initialEntries={['/cart']}>
            <Routes>
              <Route path="/cart" element={<CartPage />} />
              <Route path="/status/:orderId" element={<div data-testid="status-page">Status Page</div>} />
            </Routes>
          </MemoryRouter>
        </AddItemAndRender>
      </CartProvider>
    );

    const guestInput = screen.getByPlaceholderText('Enter your name');
    fireEvent.change(guestInput, { target: { value: 'Alice' } });

    const placeOrderBtn = screen.getByRole('button', { name: /Place Order/i });
    fireEvent.click(placeOrderBtn);

    expect(screen.getByTestId('status-page')).toBeDefined();
  });
});
