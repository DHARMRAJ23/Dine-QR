import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MainMenu from './MainMenu';
import { CartProvider } from '../../context/CartContext';

describe('MainMenu Component & Routing validations', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const renderComponent = (initialRoute: string) => {
    return render(
      <CartProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/menu/:tableId" element={<MainMenu />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    );
  };

  it('renders correctly for valid table ID (e.g. 5)', () => {
    renderComponent('/menu/5');
    expect(screen.getByText('Table 5')).toBeDefined();
    expect(screen.getByText('Zest & Fire')).toBeDefined();
  });

  it('displays error screen for invalid table ID (> 100)', () => {
    renderComponent('/menu/105');
    expect(screen.getByText('Invalid Table QR Code')).toBeDefined();
    expect(screen.getByText(/scanned table code/i)).toBeDefined();
  });

  it('displays error screen for non-numeric table ID', () => {
    renderComponent('/menu/abc');
    expect(screen.getByText('Invalid Table QR Code')).toBeDefined();
  });

  it('displays error screen for 0 as table ID', () => {
    renderComponent('/menu/0');
    expect(screen.getByText('Invalid Table QR Code')).toBeDefined();
  });
});
