/**
 * @fileoverview Admin sidebar navigation component.
 *
 * Provides persistent left-side navigation for all admin panel pages:
 *  - Order Board   (/#/admin/dashboard)
 *  - Menu Manager  (/#/admin/menu)
 *  - QR Codes      (/#/admin/qr-codes)
 *
 * Also exposes three guarded reset actions (all require window.confirm):
 *  - Reset Menu     → restores mockData defaults, preserves orders
 *  - Clear Orders   → wipes order history, preserves menu
 *  - Full Reset     → factory reset (ALL data cleared, page reloaded)
 *
 * Logout clears the auth session and redirects to /admin/login.
 */
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { 
  ClipboardList, 
  Menu as MenuIcon, 
  QrCode, 
  LogOut, 
  Sparkles,
  UserCheck
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';

/**
 * Persistent sidebar used by all admin panel pages.
 * Displays the branding, navigation links, reset controls, and a logout button.
 */
export const AdminSidebar: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { resetMenuToDefaults, clearAllOrders, resetCompleteDemo, clearCart } = useCart();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const handleResetMenu = () => {
    if (window.confirm('Reset menu items to default list? Your custom additions/changes will be lost.')) {
      resetMenuToDefaults();
    }
  };

  const handleClearOrders = () => {
    if (window.confirm('Are you sure you want to clear all live orders? This will empty the Order Board.')) {
      clearAllOrders();
    }
  };

  const handleClearCart = () => {
    if (window.confirm('Clear all items from the current shopping cart?')) {
      clearCart();
    }
  };

  const handleResetDemo = () => {
    if (window.confirm('CAUTION: This will clear all orders, reset the menu to default, empty the cart, and sign you out. Proceed?')) {
      resetCompleteDemo();
    }
  };

  const navItems = [
    { to: '/admin/dashboard', label: 'Order Board', icon: ClipboardList },
    { to: '/admin/menu', label: 'Menu Manager', icon: MenuIcon },
    { to: '/admin/qr-codes', label: 'QR Generator', icon: QrCode },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800 flex-shrink-0 no-print">
      
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white tracking-wide flex items-center gap-1.5">
            Zest & Fire <Sparkles size={14} className="text-amber-400 fill-amber-400" />
          </h2>
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-0.5 block">Kitchen Console</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                isActive
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/10'
                  : 'hover:bg-slate-800 hover:text-white text-slate-400'
              }`
            }
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Demo Controls Section */}
      <div className="px-4 py-3 border-t border-slate-800/60 bg-slate-950/20 text-slate-400 flex flex-col gap-2">
        <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 block px-1.5">Demo Controls</span>
        <div className="grid grid-cols-2 gap-2 text-[9px] font-bold uppercase tracking-wider">
          <button 
            onClick={handleResetMenu}
            className="p-2 border border-slate-800 hover:border-slate-700 rounded-lg hover:bg-slate-850 hover:text-white transition-all text-center"
          >
            Reset Menu
          </button>
          <button 
            onClick={handleClearOrders}
            className="p-2 border border-slate-800 hover:border-slate-700 rounded-lg hover:bg-slate-850 hover:text-white transition-all text-center"
          >
            Clear Orders
          </button>
          <button 
            onClick={handleClearCart}
            className="p-2 border border-slate-800 hover:border-slate-700 rounded-lg hover:bg-slate-850 hover:text-white transition-all text-center"
          >
            Clear Cart
          </button>
          <button 
            onClick={handleResetDemo}
            className="p-2 border border-red-950/30 hover:border-red-900/40 text-red-500 rounded-lg hover:bg-red-950/20 transition-all text-center"
          >
            Reset Demo
          </button>
        </div>
      </div>

      {/* User Status / Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-500 font-bold text-xs">
            <UserCheck size={14} />
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-none">Chef Admin</p>
            <span className="text-[9px] text-slate-500 mt-1 block">Active Session</span>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-800 text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all"
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
export default AdminSidebar;
