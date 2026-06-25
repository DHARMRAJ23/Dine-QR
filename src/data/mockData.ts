/**
 * @fileoverview Seed data for the restaurant menu and categories.
 *
 * PURPOSE
 * ───────
 * Provides the default menu items and category list that are loaded into
 * localStorage on the very first app launch. Subsequent runs use the
 * localStorage-persisted version instead (which may have admin edits).
 *
 * RESET BEHAVIOUR
 * ───────────────
 * `INITIAL_FOOD_ITEMS` is used by `CartContext.resetMenuToDefaults()` to
 * restore the menu to this original state. If you change items here,
 * a "Reset Menu" from the admin sidebar will apply the new defaults.
 *
 * ADDING CATEGORIES
 * ─────────────────
 * 1. Add an entry to `CATEGORIES` with a unique `id` slug.
 * 2. Use that `id` as the `category` field on the relevant FoodItems.
 * 3. The customer menu tabs and admin category dropdown update automatically.
 *
 * IMAGE URLS
 * ──────────
 * Items use Unsplash photo URLs by default. These require an internet connection.
 * The admin can upload local images (stored as base64) via the Menu Manager.
 *
 * ITEM IDs
 * ────────
 * Seed items use short readable IDs (e.g. `hd-1`, `qb-2`).
 * Admin-added items get timestamp-based IDs (e.g. `item-1704067200000`).
 */
import type { FoodItem, Category } from '../types';

export const CATEGORIES: Category[] = [
  { id: 'all', name: 'All', displayName: '✨ All' },
  { id: 'hot-drinks', name: 'Hot Drinks', displayName: '☕ Hot Drinks' },
  { id: 'quick-bites', name: 'Quick Bites', displayName: '🍟 Quick Bites' },
  { id: 'mains', name: 'Mains', displayName: '🍔 Mains' },
  { id: 'desserts', name: 'Desserts', displayName: '🍰 Desserts' },
];

export const INITIAL_FOOD_ITEMS: FoodItem[] = [
  // Hot Drinks
  {
    id: 'hd-1',
    name: 'Vanilla Bean Latte',
    price: 180,
    description: 'Double shot of organic espresso with steamed oat milk and fresh vanilla bean syrup.',
    image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400',
    category: 'hot-drinks',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'hd-2',
    name: 'Ceremonial Matcha Latte',
    price: 220,
    description: 'Stone-ground Uji matcha whisked with creamy almond milk and a touch of organic agave.',
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&q=80&w=400',
    category: 'hot-drinks',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'hd-3',
    name: 'Adrak Elaichi Chai',
    price: 120,
    description: 'Traditional slow-brewed milk tea infused with fresh ginger and crushed green cardamom.',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&q=80&w=400',
    category: 'hot-drinks',
    isVeg: true,
    isAvailable: true,
  },
  
  // Quick Bites
  {
    id: 'qb-1',
    name: 'Truffle Parmesan Fries',
    price: 260,
    description: 'Crispy golden fries tossed in white truffle oil, grated parmesan, and fresh rosemary.',
    image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&q=80&w=400',
    category: 'quick-bites',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'qb-2',
    name: 'Loaded Nacho Platter',
    price: 340,
    description: 'Tortilla chips baked with cheddar, black beans, jalapeños, fresh salsa, and sour cream.',
    image: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&q=80&w=400',
    category: 'quick-bites',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'qb-3',
    name: 'Crispy Chicken Sliders',
    price: 380,
    description: 'Three mini brioche buns filled with buttermilk fried chicken, spicy mayo, and pickles.',
    image: 'https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&q=80&w=400',
    category: 'quick-bites',
    isVeg: false,
    isAvailable: true,
  },

  // Mains
  {
    id: 'm-1',
    name: 'Avocado Toast & Poached Egg',
    price: 320,
    description: 'Artisanal sourdough topped with smashed Hass avocado, cherry tomatoes, and a soft-poached egg.',
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&q=80&w=400',
    category: 'mains',
    isVeg: false,
    isAvailable: true,
  },
  {
    id: 'm-2',
    name: 'The Antigravity Smoke Burger',
    price: 450,
    description: 'Smoked angus beef patty with melted provolone, grilled onions, and house barbecue sauce.',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400',
    category: 'mains',
    isVeg: false,
    isAvailable: true,
  },
  {
    id: 'm-3',
    name: 'Creamy Basil Pesto Pasta',
    price: 390,
    description: 'Penne pasta tossed in rich basil pine-nut pesto, fresh cream, roasted garlic, and pine nuts.',
    image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&q=80&w=400',
    category: 'mains',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'm-4',
    name: 'Spicy Paneer Tikka Wrap',
    price: 290,
    description: 'Charcoal-grilled paneer, bell peppers, mint chutney, and pickled onions wrapped in a soft paratha.',
    image: 'https://images.unsplash.com/photo-1628831291075-35e0c5d599ee?auto=format&fit=crop&q=80&w=400',
    category: 'mains',
    isVeg: true,
    isAvailable: true,
  },

  // Desserts
  {
    id: 'd-1',
    name: 'New York Baked Cheesecake',
    price: 280,
    description: 'Rich and creamy classic baked cheesecake served with fresh wild berry compote.',
    image: 'https://images.unsplash.com/photo-1524351199679-46cddf530c04?auto=format&fit=crop&q=80&w=400',
    category: 'desserts',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'd-2',
    name: 'Molten Chocolate Lava Cake',
    price: 240,
    description: 'Warm chocolate cake with a molten lava center, served with premium vanilla bean gelato.',
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&q=80&w=400',
    category: 'desserts',
    isVeg: true,
    isAvailable: true,
  },
  {
    id: 'd-3',
    name: 'Classic Espresso Tiramisu',
    price: 290,
    description: 'Layers of espresso-soaked ladyfingers and whipped mascarpone cream, dusted with dark cocoa.',
    image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&q=80&w=400',
    category: 'desserts',
    isVeg: true,
    isAvailable: false, // Starts as out of stock to demonstrate the out-of-stock toggle
  }
];
