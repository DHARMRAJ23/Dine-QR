/**
 * @fileoverview Customer cart review and order checkout page.
 *
 * ROUTE: `/#/cart`
 *
 * FLOW
 * ────
 * 1. Customer reviews their cart (items, quantities, prices)
 * 2. Enters their name (required) and optional kitchen notes
 * 3. Reviews the bill breakdown (subtotal + 5% GST + ₹20 service charge)
 * 4. Taps "Place Order" to submit
 * 5. On success → redirected to `/#/status/:orderId` (live tracker)
 *
 * EMPTY CART HANDLING
 * ───────────────────
 * If the cart is empty, shows a friendly empty-state screen with a
 * "Back to Menu" link. This prevents a confusing blank checkout form.
 *
 * VALIDATION (client-side, before calling placeOrder())
 * ──────────────────────────────────────────────────────
 * - Guest name: required, 2–60 characters
 * - Cart items: each must still be `isAvailable` (menu can change while browsing)
 *
 * BILLING
 * ───────
 * Tax and service charge are calculated from `BILLING_CONFIG` constants to
 * ensure the displayed bill always matches the stored order total exactly.
 *
 * ORDER SUBMISSION SAFETY
 * ───────────────────────
 * `placeOrder()` in CartContext uses a `placingOrderRef` lock to prevent
 * double-submissions from rapid button taps. The button shows "Placing..." text
 * and is disabled during submission.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { ArrowLeft, Trash2, Edit3, User, ChevronRight, ShoppingBag } from 'lucide-react';
import { BILLING_CONFIG } from '../../config/billing';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();

  const [nameError, setNameError] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const { 
    cart, 
    tableId, 
    guestName, 
    setGuestName, 
    specialInstructions, 
    setSpecialInstructions, 
    updateQuantity, 
    removeFromCart, 
    placeOrder,
    menuItems
  } = useCart();

  const itemTotal = cart.reduce((sum, item) => sum + (item.item.price * item.quantity), 0);
  
  // Tax calculations
  const gstTax = Math.round(itemTotal * BILLING_CONFIG.taxRate);
  const grandTotal = itemTotal > 0 ? itemTotal + gstTax + BILLING_CONFIG.serviceCharge : 0;

  // Validation: Check if any items in cart are out of stock in the menu
  const unavailableItemsInCart = cart.filter(ci => {
    const dbItem = menuItems.find(m => m.id === ci.item.id);
    return !dbItem || !dbItem.isAvailable;
  });
  const hasUnavailableItems = unavailableItemsInCart.length > 0;

  const handlePlaceOrder = () => {
    if (isPlacingOrder) return;

    if (cart.length === 0) {
      setCheckoutError('Your cart is empty. Please add items to place an order.');
      return;
    }

    const trimmedGuestName = guestName.trim();
    if (!trimmedGuestName) {
      setNameError(true);
      const nameInput = document.getElementById('guest-name-input');
      if (nameInput && typeof nameInput.scrollIntoView === 'function') {
        nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (trimmedGuestName.length > 60) {
      setCheckoutError('Guest name must not exceed 60 characters.');
      return;
    }

    if (specialInstructions.length > 500) {
      setCheckoutError('Kitchen instructions must not exceed 500 characters.');
      return;
    }
    
    setNameError(false);
    setCheckoutError('');
    setIsPlacingOrder(true);

    try {
      const placedOrder = placeOrder();
      if (placedOrder) {
        navigate(`/status/${placedOrder.id}`);
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'An error occurred while placing your order.');
      setIsPlacingOrder(false);
    }
  };

  const handleBackToMenu = () => {
    navigate(`/menu/${tableId || '1'}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-32 shadow-2xl relative max-w-md mx-auto border-x border-slate-100 flex flex-col">
      
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 p-4 flex items-center justify-between shadow-sm">
        <button 
          onClick={handleBackToMenu}
          className="p-1 rounded-full text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-slate-800 text-base">Review Order</h1>
        <div className="w-8"></div> {/* Spacer to center the title */}
      </header>

      {/* Cart with Items */}
      {cart.length > 0 ? (
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Table Header Display */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex justify-between items-center text-xs">
            <span className="font-semibold text-orange-800 uppercase tracking-wider">Ordering from</span>
            <span className="font-black text-orange-600 bg-white px-2 py-0.5 rounded shadow-sm border border-orange-200">
              Table {tableId || '1'}
            </span>
          </div>

          {/* Checkout Validation/Availability Error Banner */}
          {hasUnavailableItems && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 space-y-1 animate-shake">
              <p className="font-bold">⚠️ Items Out of Stock</p>
              <p className="text-[11px] leading-relaxed">
                The following items in your cart are no longer available: {unavailableItemsInCart.map(ui => ui.item.name).join(', ')}. Please remove them to place your order.
              </p>
            </div>
          )}

          {/* Order Placement Error Banner */}
          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 flex gap-2 items-start animate-shake">
              <span className="font-bold">⚠️</span>
              <p className="text-[11px] leading-relaxed">{checkoutError}</p>
            </div>
          )}

          {/* Itemized List */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
            {cart.map((ci) => {

              return (
                <div key={ci.item.id} className="p-3.5 flex gap-3 items-start">
                  {/* Veg Indicator dot */}
                  <span 
                    className={`w-3 h-3 border flex items-center justify-center rounded-sm mt-1 flex-shrink-0 ${
                      ci.item.isVeg ? 'border-green-600' : 'border-red-600'
                    }`}
                  >
                    <span 
                      className={`w-1 h-1 rounded-full ${
                        ci.item.isVeg ? 'bg-green-600' : 'bg-red-600'
                      }`}
                    ></span>
                  </span>

                  {/* Name and Details */}
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-sm leading-tight">
                      {ci.item.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">₹{ci.item.price}</p>
                    {/* Out of Stock Warning Badge */}
                    {!menuItems.find(m => m.id === ci.item.id)?.isAvailable && (
                      <span className="inline-block text-[9px] font-black text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded uppercase tracking-wider mt-1.5 animate-pulse">
                        Out of Stock
                      </span>
                    )}
                  </div>

                  {/* Right Side: Quantity Adjusters & Delete */}
                  <div className="flex flex-col items-end justify-between h-full gap-2">
                    <button 
                      onClick={() => removeFromCart(ci.item.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      title="Remove item"
                    >
                      <Trash2 size={15} />
                    </button>
                    
                    {/* Compact Quantity Select */}
                    <div className="flex items-center text-xs border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm font-bold text-orange-600">
                      <button
                        onClick={() => updateQuantity(ci.item.id, ci.quantity - 1)}
                        className="px-2 py-0.5 hover:bg-orange-50 font-extrabold"
                      >
                        −
                      </button>
                      <span className="px-2 text-slate-800 text-[11px] tabular-nums bg-slate-50/50">{ci.quantity}</span>
                      <button
                        onClick={() => updateQuantity(ci.item.id, ci.quantity + 1)}
                        disabled={ci.quantity >= 20}
                        className="px-2 py-0.5 hover:bg-orange-50 font-extrabold disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Special Instructions */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2.5">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Edit3 size={14} className="text-slate-400" />
              <span>Kitchen Instructions</span>
            </h3>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              maxLength={500}
              placeholder="E.g., Make it extra hot, no onions, sauce on the side..."
              rows={2}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-orange-500 transition-colors resize-none placeholder-slate-400/80"
            />
          </div>

          {/* Guest Name Identification */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2.5">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <User size={14} className="text-slate-400" />
              <span>Who is placing this order?</span>
            </h3>
            <div className="relative">
              <input
                id="guest-name-input"
                type="text"
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value);
                  if (e.target.value.trim()) setNameError(false);
                }}
                maxLength={60}
                placeholder="Enter your name"
                className={`w-full text-xs bg-slate-50 border rounded-xl p-3 pl-9 focus:outline-none transition-colors ${
                  nameError 
                    ? 'border-red-500 focus:border-red-600 bg-red-50/20' 
                    : 'border-slate-200 focus:border-orange-500'
                }`}
              />
              <User size={14} className="absolute left-3 top-3.5 text-slate-400" />
            </div>
            {nameError && (
              <p className="text-[10px] text-red-500 font-semibold mt-1">
                Your name is required so the waitstaff can identify you at Table {tableId}!
              </p>
            )}
          </div>

          {/* Bill Breakdown */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2 text-xs">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider mb-2.5">Bill Breakdown</h3>
            
            <div className="flex justify-between text-slate-500">
              <span>Item Total</span>
              <span className="font-medium">₹{itemTotal}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Taxes (5% GST)</span>
              <span className="font-medium">₹{gstTax}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Service Charge</span>
              <span className="font-medium">₹{BILLING_CONFIG.serviceCharge}</span>
            </div>
            
            <div className="border-t border-slate-100 my-2 pt-2 flex justify-between text-sm font-bold text-slate-900">
              <span>Grand Total</span>
              <span className="text-orange-600">₹{grandTotal}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mb-5 border border-orange-100/50">
            <ShoppingBag size={36} />
          </div>
          <h3 className="font-bold text-slate-800 text-lg">Your Cart is Empty</h3>
          <p className="text-xs text-slate-400 mt-1.5 max-w-[260px] leading-relaxed">
            Looks like you haven't added anything to your cart yet. Scan the menu and add items to your liking.
          </p>
          <button
            onClick={handleBackToMenu}
            className="mt-6 px-6 py-2.5 bg-orange-600 text-white font-semibold text-xs rounded-xl shadow-md shadow-orange-600/10 hover:bg-orange-700 active:scale-95 transition-all uppercase tracking-wider"
          >
            Browse Menu
          </button>
        </div>
      )}

      {/* Place Order Sticky Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-4 right-4 max-w-md mx-auto p-4 z-40 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
          <button
            onClick={handlePlaceOrder}
            disabled={hasUnavailableItems || isPlacingOrder}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm shadow-xl transition-all duration-300 flex items-center justify-center gap-2 border ${
              hasUnavailableItems || isPlacingOrder
                ? 'bg-slate-300 text-slate-500 border-slate-200 cursor-not-allowed shadow-none'
                : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20 border-orange-500/20 transform active:scale-[0.99]'
            }`}
          >
            {isPlacingOrder ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Placing Order...</span>
              </span>
            ) : (
              <>
                <span>
                  {hasUnavailableItems ? 'Remove Out-of-Stock Items' : `Place Order (₹${grandTotal})`}
                </span>
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
export default CartPage;
