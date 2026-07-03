/**
 * @fileoverview Customer-facing menu browsing page.
 *
 * ENTRY POINT
 * ───────────
 * Accessed via: `/#/menu/:tableId`
 * The `:tableId` URL parameter is validated on mount (must be 1–100).
 * An invalid table ID shows a full-screen error rather than a broken menu.
 *
 * FEATURES
 * ────────
 * - Category tab navigation (sticky, scrollable on mobile)
 * - Keyword search across item names and descriptions
 * - Veg/non-veg filter toggle
 * - Item cards with image, name, description, price, veg dot, and cart controls
 * - "Out of stock" badge on unavailable items (cannot be added to cart)
 * - Floating "View Cart" button showing total item count
 * - Category headers auto-scroll into view when a tab is tapped
 *
 * TABLE ID VALIDATION
 * ───────────────────
 * Accepts only whole integers 1–100. Values like "1abc", "0", "101" or negative
 * numbers are rejected and a clear error screen is shown, preventing accidental
 * orders being associated with invalid table numbers.
 *
 * DATA SOURCE
 * ───────────
 * Menu items are read from `CartContext.menuItems` which is kept in sync with
 * localStorage and the admin panel via socketBus. Only items with
 * `isAvailable = true` are shown to customers.
 */
import React, { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { MAX_ITEM_QUANTITY, useCart } from "../../context/CartContext";
import { supabase } from "../../lib/supabase";
import { CATEGORIES } from "../../data/mockData";
import { ShoppingBag, Sparkles, AlertCircle, Loader2 } from "lucide-react";

type TokenStatus = "validating" | "valid" | "invalid" | "network-error";

export const MainMenu: React.FC = () => {
  const { tableToken: urlTableToken } = useParams<{ tableToken: string }>();
  const {
    cart,
    tableId,
    setTableId,
    menuItems,
    isLoadingData,
    addToCart,
    updateQuantity,
  } = useCart();

  const [activeCategory, setActiveCategory] = useState("all");
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Token validation state
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("validating");
  const [retryCount, setRetryCount] = useState(0);

  // Validate table token against Supabase on mount / when token changes
  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      // If no token in URL, show invalid immediately
      if (!urlTableToken) {
        setTokenStatus("invalid");
        return;
      }

      // If we already have the same token validated in session, skip re-validation
      try {
        const rawToken = sessionStorage.getItem("dine_in_table_token");
        const rawId = sessionStorage.getItem("dine_in_table_id");
        // readStorage JSON-encodes all values, so we parse before comparing
        const storedToken = rawToken ? (JSON.parse(rawToken) as string) : null;
        const storedId = rawId ? (JSON.parse(rawId) as string) : null;
        if (storedToken === urlTableToken && storedId) {
          if (!cancelled) setTokenStatus("valid");
          return;
        }
      } catch {
        // If JSON parsing fails, proceed with full validation
      }

      setTokenStatus("validating");
      try {
        const { data, error } = await supabase.rpc("validate_table_token", {
          p_token: urlTableToken,
        });

        if (cancelled) return;

        if (error) {
          setTokenStatus("network-error");
        } else if (!data || !data.valid) {
          setTokenStatus("invalid");
        } else {
          // Store both the friendly display number and the secure token
          setTableId(data.table_number.toString(), urlTableToken);
          setTokenStatus("valid");
        }
      } catch {
        if (!cancelled) setTokenStatus("network-error");
      }
    };

    validate();
    return () => {
      cancelled = true;
    };
  }, [urlTableToken, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loading spinner while validating
  if (tokenStatus === "validating") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  // Error screen for network/server connection failure
  if (tokenStatus === "network-error") {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center w-full relative">
        <div className="w-16 h-16 bg-orange-950/40 border border-orange-900/30 rounded-full flex items-center justify-center text-orange-500 mb-4 shadow-lg animate-pulse">
          <AlertCircle size={28} />
        </div>
        <h2 className="font-display font-bold text-xl text-white">
          Connection Failed
        </h2>
        <p className="text-xs text-slate-400 mt-2 max-w-[260px] leading-relaxed">
          Could not connect to the menu server. The database may be waking up or
          your internet connection is unstable.
        </p>
        <button
          onClick={() => setRetryCount((prev) => prev + 1)}
          className="mt-6 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-orange-600/10 hover:shadow-orange-700/20 active:scale-95 transition-all uppercase tracking-wide cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Error screen for missing or invalid token
  if (tokenStatus === "invalid") {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center w-full relative">
        <div className="w-16 h-16 bg-red-950/40 border border-red-900/30 rounded-full flex items-center justify-center text-red-500 mb-4 shadow-lg">
          <AlertCircle size={28} />
        </div>
        <h2 className="font-display font-bold text-xl text-white">
          Invalid Table QR Code
        </h2>
        <p className="text-xs text-slate-400 mt-2 max-w-[260px] leading-relaxed">
          This QR code is invalid or has expired. Each table has a unique
          private code.
        </p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-[260px] leading-relaxed">
          Please ask the restaurant staff for assistance or scan the QR code
          located directly on your table.
        </p>
      </div>
    );
  }

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);

    if (categoryId === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const element = categoryRefs.current[categoryId];
    if (element) {
      const offset = 140; // Height of banner + category selector
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  // Group items by category for rendering
  const filteredMenuItems = menuItems.filter((item) => item.isAvailable);

  const getItemsByCategory = (categoryId: string) => {
    if (categoryId === "all") return filteredMenuItems;
    return filteredMenuItems.filter((item) => item.category === categoryId);
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.item.price * item.quantity,
    0,
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 relative w-full">
      {/* Top Banner Cover Image */}
      <div className="relative h-48 bg-slate-900 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1000"
          alt="Restaurant Cover"
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>

        {/* Overlay Info */}
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-wide flex items-center gap-1">
              Zest & Fire{" "}
              <Sparkles size={16} className="text-amber-400 fill-amber-400" />
            </h1>
            <p className="text-slate-300 text-xs mt-0.5 font-light">
              Gourmet Street Food & Craft Beverages
            </p>
          </div>

          <div className="bg-orange-600/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg backdrop-blur border border-orange-400/20">
            Table {tableId || "?"}
          </div>
        </div>
      </div>

      {/* Sticky Category Selector */}
      <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur-md border-b border-slate-200/80 p-3 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-none flex gap-2">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => handleCategoryClick(category.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 transform active:scale-95 ${
              activeCategory === category.id
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {category.displayName}
          </button>
        ))}
      </div>

      {/* Food Item Sections */}
      <div className="px-4 py-2 space-y-8 mt-2">
        {isLoadingData ? (
          // Skeleton Loader
          <div className="space-y-8">
            {[1, 2].map((categorySkeleton) => (
              <div key={categorySkeleton}>
                <div className="h-6 bg-slate-200 animate-pulse rounded w-32 mb-4"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map((itemSkeleton) => (
                    <div
                      key={itemSkeleton}
                      className="bg-white rounded-2xl p-3 border border-slate-100 flex gap-3 h-[130px]"
                    >
                      <div className="flex-1 flex flex-col justify-between py-0.5 space-y-2">
                        <div>
                          <div className="h-4 bg-slate-200 animate-pulse rounded w-3/4 mb-1.5"></div>
                          <div className="h-3 bg-slate-100 animate-pulse rounded w-1/2"></div>
                        </div>
                        <div className="h-5 bg-slate-200 animate-pulse rounded w-1/3"></div>
                      </div>
                      <div className="w-[110px] shrink-0 bg-slate-100 animate-pulse rounded-xl h-full"></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          CATEGORIES.filter(
            (cat) =>
              cat.id !== "all" &&
              (activeCategory === "all" || cat.id === activeCategory),
          ).map((category) => {
            const categoryItems = getItemsByCategory(category.id);

            // Hide category if empty in the database
            if (categoryItems.length === 0) return null;

            return (
              <div
                key={category.id}
                ref={(el) => {
                  categoryRefs.current[category.id] = el;
                }}
                className="scroll-mt-28"
              >
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                  <span>{category.name}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    {categoryItems.length}{" "}
                    {categoryItems.length === 1 ? "item" : "items"}
                  </span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {categoryItems.map((item) => {
                    const cartItem = cart.find((ci) => ci.item.id === item.id);
                    const quantity = cartItem ? cartItem.quantity : 0;

                    return (
                      <div
                        key={item.id}
                        className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex gap-3 hover:shadow-md transition-shadow duration-300"
                      >
                        {/* Left Side: Info */}
                        <div className="flex-1 flex flex-col justify-between py-0.5">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className={`w-3.5 h-3.5 border flex items-center justify-center rounded-sm ${
                                  item.isVeg
                                    ? "border-green-600"
                                    : "border-red-600"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    item.isVeg ? "bg-green-600" : "bg-red-600"
                                  }`}
                                ></span>
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {item.isVeg ? "Veg" : "Non-Veg"}
                              </span>
                            </div>

                            <h3 className="font-semibold text-slate-900 text-[15px] leading-tight">
                              {item.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                              {item.description}
                            </p>
                          </div>

                          <div className="text-sm font-bold text-slate-900 mt-2">
                            ₹{item.price}
                          </div>
                        </div>

                        {/* Right Side: Image & ADD Button */}
                        <div className="relative w-24 h-24 flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover rounded-xl border border-slate-100"
                            onError={(e) => {
                              e.currentTarget.src = "/food-placeholder.svg";
                            }}
                          />

                          {/* Interactive Counter / ADD Button */}
                          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-[84px] shadow-md rounded-lg overflow-hidden bg-white border border-slate-200/80">
                            {quantity === 0 ? (
                              <button
                                onClick={() => addToCart(item)}
                                className="w-full py-1 text-xs font-bold text-orange-600 text-center hover:bg-orange-50 active:bg-orange-100 transition-colors uppercase tracking-wider"
                              >
                                Add
                              </button>
                            ) : (
                              <div className="flex items-center justify-between text-xs font-bold text-orange-600 bg-orange-50/50">
                                <button
                                  onClick={() =>
                                    updateQuantity(item.id, quantity - 1)
                                  }
                                  className="px-2.5 py-1 text-center hover:bg-orange-100 font-extrabold text-sm leading-none"
                                >
                                  −
                                </button>
                                <span className="text-slate-800 text-[11px] tabular-nums">
                                  {quantity}
                                </span>
                                <button
                                  onClick={() =>
                                    updateQuantity(item.id, quantity + 1)
                                  }
                                  disabled={quantity >= MAX_ITEM_QUANTITY}
                                  className="px-2.5 py-1 text-center hover:bg-orange-100 font-extrabold text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Empty State if absolutely no food items available */}
      {!isLoadingData && filteredMenuItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
            <Sparkles size={28} />
          </div>
          <h3 className="font-semibold text-slate-800">Menu Unavailable</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
            The kitchen is caught up and updating the menu. Please check back in
            a few moments!
          </p>
        </div>
      )}

      {/* Floating Cart Summary Bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-4 right-4 md:right-8 z-40 animate-slide-up max-w-[calc(100vw-2rem)] md:max-w-sm ml-auto">
          <Link
            to="/cart"
            className="flex items-center justify-between bg-orange-600 text-white rounded-xl shadow-xl shadow-orange-600/30 p-4 transition-all hover:bg-orange-700 active:scale-[0.98] border border-orange-500/20"
          >
            <div className="flex items-center gap-3">
              <div className="bg-orange-700/80 px-2.5 py-1.5 rounded-lg flex items-center justify-center text-xs font-black tabular-nums border border-orange-500/10">
                {totalItems}
              </div>
              <div>
                <p className="text-[11px] text-orange-200 font-medium uppercase tracking-wider">
                  Item Added
                </p>
                <p className="font-bold text-sm leading-tight">₹{cartTotal}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 font-bold text-sm tracking-wide">
              <span>View Cart</span>
              <ShoppingBag size={15} className="ml-1" />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
};
export default MainMenu;
