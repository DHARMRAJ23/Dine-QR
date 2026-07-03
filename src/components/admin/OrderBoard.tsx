/**
 * @fileoverview Admin Order Board — real-time Kanban view of all active orders.
 *
 * LAYOUT
 * ──────
 * Three columns arranged side-by-side:
 *  ┌──────────────┬─────────────────────┬──────────────┐
 *  │  Incoming    │  Preparing          │  Completed   │
 *  │  (placed)    │  (accepted +        │  (served)    │
 *  │              │   preparing)        │              │
 *  └──────────────┴─────────────────────┴──────────────┘
 *
 * Each order card shows: table number, guest name, item list,
 * bill breakdown, time elapsed since placement, and a "Move to Next" button.
 *
 * REAL-TIME UPDATES
 * ─────────────────
 * Orders are read directly from `CartContext.orders`, which is kept live by
 * the socketBus event listeners in CartProvider. When a customer places an
 * order (in any tab), the 'new_order' event updates the shared context and
 * this component re-renders automatically.
 *
 * AUDIO
 * ─────
 * When the `orders` array grows, a POS chime is played via `playNewOrderChime()`
 * if the new order has `status === 'placed'` (i.e., it's a fresh incoming order,
 * not just a status update).
 */
import React, { useEffect, useState } from "react";
import { useCart } from "../../context/CartContext";
import { AdminSidebar } from "./AdminSidebar";
import { playNewOrderChime } from "../../utils/audio";
import {
  Clock,
  User,
  ChevronRight,
  CheckCircle2,
  CookingPot,
  ClipboardCheck,
  Inbox,
  AlertTriangle,
} from "lucide-react";
import type { Order } from "../../types";

// Helper component to calculate relative time elapsed
const RelativeTime: React.FC<{ timestamp: string }> = ({ timestamp }) => {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const calculateTime = () => {
      const placed = new Date(timestamp).getTime();
      if (isNaN(placed)) {
        setElapsed("Placed recently");
        return;
      }
      const now = Date.now();
      const diffMinutes = Math.floor((now - placed) / 60000);

      if (diffMinutes < 1) {
        setElapsed("Placed just now");
      } else if (diffMinutes === 1) {
        setElapsed("Placed 1 min ago");
      } else {
        setElapsed(`Placed ${diffMinutes} mins ago`);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 15000); // Update every 15s

    return () => clearInterval(interval);
  }, [timestamp]);

  return <span>{elapsed}</span>;
};

export const OrderBoard: React.FC = () => {
  const { orders, isLoadingData, updateOrderStatus } = useCart();
  const [lastOrderCount, setLastOrderCount] = useState(orders.length);

  const OrderSkeleton = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse">
      <div className="flex justify-between mb-4">
        <div className="h-4 bg-slate-800 rounded w-16"></div>
        <div className="h-4 bg-slate-800 rounded w-24"></div>
      </div>
      <div className="space-y-3 mb-4">
        <div className="h-3 bg-slate-800 rounded w-full"></div>
        <div className="h-3 bg-slate-800 rounded w-3/4"></div>
      </div>
      <div className="flex justify-between items-end">
        <div className="h-3 bg-slate-800 rounded w-20"></div>
        <div className="h-8 bg-slate-800 rounded w-28"></div>
      </div>
    </div>
  );

  // Play chime when a new order is received
  useEffect(() => {
    if (orders.length > lastOrderCount) {
      // Check if the newly added order is in 'placed' status (i.e. incoming)
      const hasNewIncoming = orders.some((o) => o.status === "placed");
      if (hasNewIncoming) {
        playNewOrderChime();
      }
    }
    setLastOrderCount(orders.length);
  }, [orders, lastOrderCount]);

  // Filter orders by Kanban status
  const incomingOrders = orders.filter((o) => o.status === "placed");

  // We bundle 'accepted' and 'preparing' statuses into the Preparing column
  const preparingOrders = orders.filter(
    (o) => o.status === "accepted" || o.status === "preparing",
  );

  const completedOrders = orders.filter((o) => o.status === "served");

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Bar */}
        <header className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center flex-shrink-0">
          <div>
            <h1 className="font-display font-bold text-xl text-white">
              Order Board
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage live order lifecycle stages and coordinate kitchen tickets
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span>WebSocket Simulation Active</span>
            </span>
          </div>
        </header>

        {/* Three-Column Kanban Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden min-h-0 bg-slate-950">
          {/* Column 1: Incoming */}
          <div className="flex flex-col h-full bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 flex-shrink-0">
              <h2 className="text-sm font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
                <Inbox size={16} />
                <span>Incoming</span>
              </h2>
              <span className="bg-blue-950 text-blue-400 text-xs font-black px-2.5 py-0.5 rounded-full border border-blue-900/40">
                {incomingOrders.length}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none">
              {isLoadingData ? (
                <>
                  <OrderSkeleton />
                  <OrderSkeleton />
                </>
              ) : incomingOrders.length > 0 ? (
                incomingOrders.map((order) => (
                  <OrderTicketCard
                    key={order.id}
                    order={order}
                    actionLabel="Accept Order"
                    actionClass="bg-green-600 hover:bg-green-700 text-white border-green-500/20"
                    onAction={() => updateOrderStatus(order.id, "accepted")}
                  />
                ))
              ) : (
                <EmptyState
                  title="No Incoming Orders"
                  description="New table orders will pop up and sound a POS chime alert here."
                  icon={ClipboardCheck}
                />
              )}
            </div>
          </div>

          {/* Column 2: Preparing */}
          <div className="flex flex-col h-full bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 flex-shrink-0">
              <h2 className="text-sm font-bold tracking-wider uppercase text-amber-400 flex items-center gap-2">
                <CookingPot size={16} />
                <span>Preparing</span>
              </h2>
              <span className="bg-amber-950 text-amber-400 text-xs font-black px-2.5 py-0.5 rounded-full border border-amber-900/40">
                {preparingOrders.length}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none">
              {isLoadingData ? (
                <>
                  <OrderSkeleton />
                  <OrderSkeleton />
                </>
              ) : preparingOrders.length > 0 ? (
                preparingOrders.map((order) => (
                  <OrderTicketCard
                    key={order.id}
                    order={order}
                    actionLabel={
                      order.status === "accepted"
                        ? "Start Preparing"
                        : "Mark Served"
                    }
                    actionClass={
                      order.status === "accepted"
                        ? "bg-orange-600 hover:bg-orange-700 text-white"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }
                    onAction={() =>
                      updateOrderStatus(
                        order.id,
                        order.status === "accepted" ? "preparing" : "served",
                      )
                    }
                  />
                ))
              ) : (
                <EmptyState
                  title="No Active Kitchen Tickets"
                  description="Accepted orders requiring preparation will appear here."
                  icon={CookingPot}
                />
              )}
            </div>
          </div>

          {/* Column 3: Completed */}
          <div className="flex flex-col h-full bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 flex-shrink-0">
              <h2 className="text-sm font-bold tracking-wider uppercase text-green-400 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>Completed</span>
              </h2>
              <span className="bg-green-950 text-green-400 text-xs font-black px-2.5 py-0.5 rounded-full border border-green-900/40">
                {completedOrders.length}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none">
              {isLoadingData ? (
                <OrderSkeleton />
              ) : completedOrders.length > 0 ? (
                completedOrders.map((order) => (
                  <OrderTicketCard
                    key={order.id}
                    order={order}
                    actionLabel="Done"
                    actionClass="bg-slate-800 text-slate-500 opacity-50 cursor-not-allowed border-slate-700"
                    onAction={() => {}}
                  />
                ))
              ) : (
                <EmptyState
                  title="No Completed Orders"
                  description="Orders marked as served will stack here for the session."
                  icon={CheckCircle2}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

/* Sub-Component: Order Ticket Card */
interface OrderTicketCardProps {
  order: Order;
  actionLabel?: string;
  actionClass?: string;
  onAction?: () => void;
}

const OrderTicketCard: React.FC<OrderTicketCardProps> = ({
  order,
  actionLabel,
  actionClass = "",
  onAction,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 shadow-md space-y-3.5 transition-all duration-300">
      {/* Top Bar: Table and Timer */}
      <div className="flex justify-between items-start border-b border-slate-800 pb-2.5">
        <div>
          <span className="text-white text-base font-extrabold tracking-wide">
            Table {order.tableId}
          </span>
          <span
            className="block text-[10px] text-slate-500 font-medium tracking-wider uppercase mt-0.5"
            title={`Full Order ID: ${order.id}`}
          >
            Order #{order.orderNumber || order.id.slice(-4).toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg">
          <Clock size={11} className="text-slate-500" />
          <RelativeTime timestamp={order.placedAt} />
        </div>
      </div>

      {/* Guest Name */}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        <User size={13} className="text-slate-500" />
        <span>
          Guest:{" "}
          <strong className="text-white font-bold">{order.guestName}</strong>
        </span>
      </div>

      {/* Food Items Bulleted List */}
      <div className="space-y-1.5 pl-1">
        {order.items.map((item) => (
          <div
            key={item.itemId}
            className="flex justify-between items-center text-xs text-slate-400"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  item.isVeg ? "bg-green-600" : "bg-red-600"
                }`}
              ></span>
              <span>{item.name}</span>
            </div>
            <span className="font-extrabold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[10px] tabular-nums">
              x{item.quantity}
            </span>
          </div>
        ))}
      </div>

      {/* Custom Kitchen Instructions */}
      {order.specialInstructions && (
        <div className="bg-orange-950/20 border border-orange-900/30 rounded-xl p-2.5 flex items-start gap-1.5 text-[11px] text-orange-300 italic">
          <AlertTriangle
            size={13}
            className="text-orange-500 mt-0.5 flex-shrink-0"
          />
          <div>
            <span className="not-italic font-extrabold uppercase text-[9px] tracking-wider block text-orange-400/90 mb-0.5">
              Special Instructions:
            </span>
            <span>"{order.specialInstructions}"</span>
          </div>
        </div>
      )}

      {/* Action Button at the Bottom */}
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className={`w-full py-2 px-4 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-300 transform active:scale-[0.98] border shadow-md flex items-center justify-center gap-1.5 ${actionClass}`}
        >
          <span>{actionLabel}</span>
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
};

/* Sub-Component: Empty State Card */
interface EmptyStateProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
}) => {
  return (
    <div className="border border-dashed border-slate-800 rounded-2xl p-6 text-center flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
      <Icon size={24} className="text-slate-600" />
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        {title}
      </h3>
      <p className="text-[10px] text-slate-500/80 max-w-xs leading-relaxed mx-auto">
        {description}
      </p>
    </div>
  );
};
export default OrderBoard;
