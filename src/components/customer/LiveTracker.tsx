/**
 * @fileoverview Customer live order tracking / receipt page.
 *
 * ROUTE: `/#/status/:orderId`
 *
 * PURPOSE
 * ───────
 * After a customer places an order, they are redirected here. This page
 * shows a live receipt with the order status indicator that updates in
 * real-time when the admin moves the order through the Kanban board.
 *
 * STATUS INDICATOR
 * ────────────────
 * A horizontal progress stepper:
 *   [1] Order Placed → [2] Accepted → [3] Preparing → [4] Served
 *
 * The current step is highlighted. When status = 'served', a celebratory
 * animation plays and the page shows a "Thank you, enjoy your meal!" message.
 *
 * REAL-TIME UPDATES
 * ─────────────────
 * This page subscribes to the `order_status_updated` event from socketBus.
 * When the admin advances an order on the Order Board, the event fires and
 * the status indicator updates immediately — no polling or page refresh needed.
 *
 * ORDER NOT FOUND
 * ───────────────
 * If the orderId in the URL doesn't match any order in localStorage
 * (e.g. after a full demo reset), a friendly "Order not found" screen
 * is shown with a link to return to the menu.
 *
 * RECEIPT DETAILS
 * ───────────────
 * Displays: table number, guest name, all ordered items with quantities and prices,
 * subtotal, GST, service charge, and grand total.
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// removed useCart
import { supabase } from "../../lib/supabase";

import { BILLING_CONFIG } from "../../config/billing";
import {
  ClipboardCheck,
  ChefHat,
  Flame,
  Sparkles,
  Home,
  Check,
  ShoppingBag,
  Lock,
  Loader2,
} from "lucide-react";

interface TrackingStep {
  key: "placed" | "accepted" | "preparing" | "served";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
}

const TRACKING_STEPS: TrackingStep[] = [
  {
    key: "placed",
    title: "Order Placed",
    description: "We have received your order details.",
    icon: ClipboardCheck,
    color: "border-orange-500 text-orange-500 bg-orange-50",
  },
  {
    key: "accepted",
    title: "Accepted by Kitchen",
    description: "The kitchen staff has received your order.",
    icon: ChefHat,
    color: "border-blue-500 text-blue-500 bg-blue-50",
  },
  {
    key: "preparing",
    title: "Preparing Food",
    description: "Our culinary artists are cooking your food.",
    icon: Flame,
    color: "border-amber-500 text-amber-500 bg-amber-50",
  },
  {
    key: "served",
    title: "Served & Completed",
    description: "Enjoy your hot meal fresh at your table!",
    icon: Sparkles,
    color: "border-green-500 text-green-500 bg-green-50",
  },
];

export const LiveTracker: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // PIN State
  const [pin, setPin] = useState(
    sessionStorage.getItem(`order_pin_${orderId}`) || "",
  );
  const [isPinValid, setIsPinValid] = useState(false);
  const [pinError, setPinError] = useState("");

  // Fetch table token from sessionStorage to navigate back to menu safely
  const getMenuPath = () => {
    try {
      const storedToken = sessionStorage.getItem("dine_in_table_token");
      if (storedToken) {
        return JSON.parse(storedToken);
      }
    } catch (e) {
      console.error("Error reading table token:", e);
    }
    return "invalid";
  };

  // Fetch Order Securely via RPC
  const fetchOrder = async (pinToUse: string) => {
    if (!orderId) return;
    setIsLoading(true);
    setPinError("");

    try {
      const { data, error } = await supabase.rpc("get_order_by_pin", {
        p_order_id: orderId,
        p_pin_code: pinToUse,
      });

      if (error) throw error;
      if (!data || !data.success) {
        setPinError(data?.error || "Invalid PIN Code");
        setIsPinValid(false);
        setCurrentOrder(null);
      } else {
        setIsPinValid(true);
        setCurrentOrder(data.order);
        sessionStorage.setItem(`order_pin_${orderId}`, pinToUse);
      }
    } catch (err) {
      console.error(err);
      setPinError("Failed to verify PIN. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (pin) {
      fetchOrder(pin);
    } else {
      setIsLoading(false);
    }
  }, [orderId]);

  // Handle Realtime updates securely
  useEffect(() => {
    if (!isPinValid || !orderId) return;

    // Subscribe to UPDATE events. Even if RLS blocks the payload, we get the notification
    // and can securely refetch the updated data using our RPC function.
    const channel = supabase
      .channel(`order_${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        () => {
          fetchOrder(pin);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPinValid, orderId, pin]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  // If PIN is missing or invalid, show the PIN entry screen
  if (!isPinValid) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 flex flex-col items-center justify-center text-center w-full">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-500 mb-6 shadow-sm border border-orange-200">
          <Lock size={28} />
        </div>
        <h2 className="font-display font-bold text-2xl text-slate-800 mb-2">
          Order Protected
        </h2>
        <p className="text-sm text-slate-500 max-w-xs mb-8">
          To protect guest privacy, please enter the 6-digit PIN associated with
          this order.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchOrder(pin);
          }}
          className="w-full max-w-xs space-y-4"
        >
          <div>
            <input
              type="text"
              maxLength={6}
              placeholder="Enter 6-Digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-2xl tracking-widest font-mono p-4 rounded-2xl border-2 border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/20 transition-all outline-none bg-white shadow-sm"
              required
            />
            {pinError && (
              <p className="text-red-500 text-xs font-semibold mt-2">
                {pinError}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="w-full py-4 bg-orange-600 text-white font-bold text-sm rounded-xl hover:bg-orange-700 active:scale-95 transition-all uppercase tracking-wider shadow-md shadow-orange-600/20"
          >
            View Order
          </button>
        </form>
      </div>
    );
  }

  if (!currentOrder) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 flex flex-col items-center justify-center text-center w-full">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 border border-red-100/50">
          <ShoppingBag size={28} />
        </div>
        <h3 className="font-bold text-slate-800 text-lg">Order Not Found</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
          We couldn't locate details for this order. It might be archived or
          deleted.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 px-6 py-2 bg-orange-600 text-white font-semibold text-xs rounded-xl hover:bg-orange-700 active:scale-95 transition-all uppercase tracking-wider"
        >
          Go Back Home
        </button>
      </div>
    );
  }

  // Get active step index based on current status
  const getActiveStepIndex = () => {
    const statusMap = {
      placed: 0,
      accepted: 1,
      preparing: 2,
      served: 3,
    };
    return statusMap[currentOrder.status as keyof typeof statusMap] ?? 0;
  };

  const activeIndex = getActiveStepIndex();

  // Legacy order calculations fallbacks
  const subtotal =
    currentOrder.subtotal ?? (currentOrder as any).totalAmount ?? 0;
  const tax = currentOrder.tax ?? Math.round(subtotal * BILLING_CONFIG.taxRate);
  const serviceCharge =
    currentOrder.serviceCharge ?? BILLING_CONFIG.serviceCharge;
  const grandTotal = currentOrder.grandTotal ?? subtotal + tax + serviceCharge;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 relative w-full flex flex-col">
      {/* Top Header */}
      <header className="p-4 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Live Tracker
        </span>
        <button
          onClick={() => navigate(`/menu/${getMenuPath()}`)}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <Home size={14} />
          <span>Menu</span>
        </button>
      </header>

      <div className="flex-1 p-5 space-y-6 overflow-y-auto">
        {/* Animated Green Checkmark and Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
          {/* Animated SVG Checkmark */}
          <div className="w-16 h-16 bg-green-50 border border-green-200 rounded-full flex items-center justify-center text-green-600 shadow-inner mb-4">
            <svg
              className="w-8 h-8 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline className="animate-draw" points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 className="font-display font-bold text-xl text-slate-900 leading-tight">
            {currentOrder.status === "placed" && "Order Placed Successfully!"}
            {currentOrder.status === "accepted" && "Order Accepted!"}
            {currentOrder.status === "preparing" && "Cooking Your Meal!"}
            {currentOrder.status === "served" && "Order Served!"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {currentOrder.status === "placed" &&
              `Thank you, ${currentOrder.guestName}. We've sent your order to the kitchen.`}
            {currentOrder.status === "accepted" &&
              `The kitchen staff has approved your order, ${currentOrder.guestName}.`}
            {currentOrder.status === "preparing" &&
              `Chef is preparing your fresh meal now!`}
            {currentOrder.status === "served" &&
              `Enjoy your hot meal at Table ${currentOrder.tableNumber ?? currentOrder.tableId}!`}
          </p>

          {/* Quick Summary Badges */}
          <div className="grid grid-cols-2 gap-3 w-full mt-5 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Order ID
              </span>
              <span
                className="text-sm font-bold text-slate-800 tabular-nums"
                title={`Full Order ID: ${currentOrder.id}`}
              >
                #
                {currentOrder.orderNumber ||
                  currentOrder.id.slice(-4).toUpperCase()}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Table No.
              </span>
              <span className="text-sm font-bold text-orange-600">
                Table {currentOrder.tableNumber ?? currentOrder.tableId}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Progress Timeline */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-1">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-6">
            Kitchen Progress
          </h3>

          <div className="relative">
            {TRACKING_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isCompleted = idx < activeIndex;
              const isActive = idx === activeIndex;
              const isUpcoming = idx > activeIndex;

              return (
                <div
                  key={step.key}
                  className="flex gap-4 relative pb-8 last:pb-2"
                >
                  {/* Step Connector Line */}
                  {idx < TRACKING_STEPS.length - 1 && (
                    <div
                      className={`absolute left-5 top-10 bottom-0 w-0.5 -translate-x-1/2 transition-colors duration-500 ${
                        isCompleted ? "bg-orange-500" : "bg-slate-200"
                      }`}
                    ></div>
                  )}

                  {/* Step Node Icon container */}
                  <div
                    className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                      isCompleted
                        ? "bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-600/10"
                        : isActive
                          ? `${step.color} scale-110 shadow-lg border-current ring-4 ring-orange-100`
                          : "bg-white border-slate-200 text-slate-300"
                    }`}
                  >
                    {isCompleted ? (
                      <Check size={16} className="stroke-[3]" />
                    ) : (
                      <StepIcon size={18} />
                    )}
                  </div>

                  {/* Step Info Text */}
                  <div className="flex-1 pt-1.5">
                    <h4
                      className={`text-xs font-bold transition-colors duration-500 ${
                        isActive
                          ? "text-orange-600 text-[13px]"
                          : isUpcoming
                            ? "text-slate-400"
                            : "text-slate-900"
                      }`}
                    >
                      {step.title}
                    </h4>
                    <p
                      className={`text-[10px] mt-0.5 transition-colors duration-500 ${
                        isActive ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Items Breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">
            Items Ordered
          </h3>
          <div className="divide-y divide-slate-100">
            {currentOrder.items?.map((item: any) => (
              <div
                key={item.itemId}
                className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 border flex items-center justify-center rounded-sm ${
                      item.isVeg ? "border-green-600" : "border-red-600"
                    }`}
                  >
                    <span
                      className={`w-1 h-1 rounded-full ${
                        item.isVeg ? "bg-green-600" : "bg-red-600"
                      }`}
                    ></span>
                  </span>
                  <span className="font-medium text-slate-800">
                    {item.name}
                  </span>
                  <span className="text-slate-400 font-bold ml-1">
                    x{item.quantity}
                  </span>
                </div>
                <span className="font-bold text-slate-900 tabular-nums">
                  ₹{item.price * item.quantity}
                </span>
              </div>
            ))}
          </div>

          {currentOrder.specialInstructions && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] mt-3">
              <span className="font-bold text-slate-500 block mb-0.5">
                Special Instructions:
              </span>
              <p className="text-slate-600 italic">
                "{currentOrder.specialInstructions}"
              </p>
            </div>
          )}
          <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[11px] text-slate-500 mt-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%)</span>
              <span>₹{tax}</span>
            </div>
            <div className="flex justify-between">
              <span>Service Charge</span>
              <span>₹{serviceCharge}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-900 pt-1.5 border-t border-slate-100/50">
              <span>Grand Total</span>
              <span className="text-orange-600">₹{grandTotal}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Return to Menu Footer */}
      <div className="fixed bottom-0 left-0 right-0 max-w-3xl mx-auto p-4 z-40 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
        <button
          onClick={() => navigate(`/menu/${getMenuPath()}`)}
          className="w-full bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs shadow-md hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider"
        >
          <span>Order More Food</span>
        </button>
      </div>
    </div>
  );
};
export default LiveTracker;
