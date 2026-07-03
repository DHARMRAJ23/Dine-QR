/**
 * @fileoverview Admin Menu Manager — CRUD interface for the restaurant menu.
 *
 * FEATURES
 * ────────
 * - Filter by category tabs and keyword search
 * - Toggle item availability (hides item from customers immediately)
 * - Add new items via a modal form (with image upload and canvas compression)
 * - Edit existing items inline (pre-fills the same modal with current values)
 * - Delete items (with a confirmation prompt)
 *
 * IMAGE HANDLING
 * ──────────────
 * Uploaded images are:
 *  1. Type-checked (JPG, PNG, WebP only)
 *  2. Size-checked (< 1 MB)
 *  3. Drawn onto a 400×300 canvas and re-exported as WebP at 80% quality
 *  4. Stored as a base64 data URL in the FoodItem.image field in localStorage
 *
 * ⚠️  base64 images are large. Many uploads can fill browser storage quota.
 *     The app warns the user when quota is exceeded (via CartContext.showToast).
 *
 * FORM VALIDATION
 * ───────────────
 * - Name: required, 2–80 characters, no HTML tags
 * - Price: required, integer or decimal ₹1–₹100,000
 * - Description: required, 10–500 characters
 * - Category: required, must be one of the CATEGORIES list
 * - Image: optional (defaults to a placeholder Unsplash URL)
 */
import React, { useState } from "react";
import { useCart } from "../../context/CartContext";
import { AdminSidebar } from "./AdminSidebar";
import type { FoodItem } from "../../types";
import { CATEGORIES } from "../../data/mockData";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Image as ImageIcon,
  Sparkles,
  AlertCircle,
} from "lucide-react";

export const MenuManager: React.FC = () => {
  const {
    menuItems,
    toggleItemAvailability,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
  } = useCart();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("hot-drinks");
  const [image, setImage] = useState("");
  const [isVeg, setIsVeg] = useState(true);
  const [formError, setFormError] = useState("");

  // Handle opening modal for Add
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setName("");
    setPrice("");
    setDescription("");
    setCategory("hot-drinks");
    setImage(
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400",
    ); // Default appetizing pic
    setIsVeg(true);
    setFormError("");
    setIsModalOpen(true);
  };

  // Handle opening modal for Edit
  const handleOpenEditModal = (item: FoodItem) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(item.price.toString());
    setDescription(item.description);
    setCategory(item.category);
    setImage(item.image);
    setIsVeg(item.isVeg);
    setFormError("");
    setIsModalOpen(true);
  };

  // File to base64 image helper with canvas resizing
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError("");
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setFormError("Only JPG, PNG and WebP images are allowed.");
        return;
      }
      if (file.size > 1024 * 1024) {
        setFormError("Image size should be less than 1MB.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/webp", 0.8);
            setImage(dataUrl);
          } else {
            setFormError("Failed to process image.");
          }
        };
        img.onerror = () => {
          setFormError("Failed to load image file.");
        };
        img.src = reader.result as string;
      };
      reader.onerror = () => {
        setFormError("Failed to read image file.");
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedImage = image.trim();

    if (!trimmedName || !price.trim() || !trimmedDescription || !trimmedImage) {
      setFormError("Please fill in all fields.");
      return;
    }

    if (trimmedName.length > 80) {
      setFormError("Item name must not exceed 80 characters.");
      return;
    }

    if (trimmedDescription.length > 500) {
      setFormError("Description must not exceed 500 characters.");
      return;
    }

    const isApprovedDataUrl = /^data:image\/(webp|jpeg|png);base64,/.test(
      trimmedImage,
    );
    const isHttpsUrl = /^https:\/\//.test(trimmedImage);

    if (!isApprovedDataUrl && !isHttpsUrl) {
      setFormError(
        "Image source must start with https:// or be a valid uploaded image.",
      );
      return;
    }

    if (isHttpsUrl && trimmedImage.length > 2000) {
      setFormError("Image URL must not exceed 2,000 characters.");
      return;
    }

    if (isApprovedDataUrl && trimmedImage.length > 700_000) {
      setFormError(
        "Processed image is too large. Please choose a smaller image.",
      );
      return;
    }

    const parsedPrice = Number(price);
    if (
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0 ||
      parsedPrice > 100000
    ) {
      setFormError("Enter a price between ₹1 and ₹100,000.");
      return;
    }
    // Limit to two decimal places
    const priceNum = Math.round(parsedPrice * 100) / 100;

    if (editingItem) {
      // Update
      await updateMenuItem({
        ...editingItem,
        name: trimmedName,
        price: priceNum,
        description: trimmedDescription,
        category,
        image: trimmedImage,
        isVeg,
      });
    } else {
      // Add
      await addMenuItem({
        name: trimmedName,
        price: priceNum,
        description: trimmedDescription,
        category,
        image: trimmedImage,
        isVeg,
        isAvailable: true,
      });
    }

    setIsModalOpen(false);
  };

  // Filter items
  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header Bar */}
        <header className="p-6 border-b border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
          <div>
            <h1 className="font-display font-bold text-xl text-white">
              Menu Manager
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-light">
              Add, edit, or toggle availability of items on the customer menu
            </p>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-orange-600/10 hover:shadow-orange-700/20 active:scale-95 transition-all uppercase tracking-wide border border-orange-500/20"
          >
            <Plus size={14} />
            <span>Add New Item</span>
          </button>
        </header>

        {/* Filters and Search Bar */}
        <div className="p-6 pb-3 flex-shrink-0 flex flex-col sm:flex-row gap-4 justify-between bg-slate-950 border-b border-slate-900">
          {/* Search bar */}
          <div className="relative max-w-sm w-full">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              maxLength={100}
              placeholder="Search food, beverages..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 pl-9 text-xs focus:outline-none focus:border-orange-500 text-slate-200"
            />
            <Search
              size={14}
              className="absolute left-3.5 top-3.5 text-slate-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                    : "bg-transparent text-slate-400 hover:text-white border border-transparent"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="flex-1 p-6 overflow-y-auto min-h-0 bg-slate-950">
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-slate-900 border rounded-2xl p-4 shadow-md flex flex-col justify-between transition-all duration-300 ${
                    item.isAvailable
                      ? "border-slate-800 hover:border-slate-700"
                      : "border-slate-900/60 opacity-60"
                  }`}
                >
                  <div>
                    {/* Item Image and Action Overlays */}
                    <div className="relative h-40 bg-slate-950 rounded-xl overflow-hidden mb-4 border border-slate-800">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/food-placeholder.svg";
                        }}
                      />

                      {/* Veg / Non-Veg Badge */}
                      <span
                        className={`absolute top-3 left-3 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider text-white border ${
                          item.isVeg
                            ? "bg-green-950/80 border-green-700/30 text-green-400"
                            : "bg-red-950/80 border-red-700/30 text-red-400"
                        }`}
                      >
                        {item.isVeg ? "Veg" : "Non-Veg"}
                      </span>

                      {/* Availability status badge */}
                      {!item.isAvailable && (
                        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center">
                          <span className="bg-red-950 border border-red-800 text-red-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg">
                            Out of Stock
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-semibold text-white text-[15px] line-clamp-1">
                        {item.name}
                      </h3>
                      <span className="font-extrabold text-orange-500 text-[14px]">
                        ₹{item.price}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed font-light">
                      {item.description}
                    </p>
                  </div>

                  {/* Actions and Toggle */}
                  <div className="mt-5 pt-3 border-t border-slate-800 flex justify-between items-center">
                    {/* Availability Switch */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleItemAvailability(item.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          item.isAvailable ? "bg-green-600" : "bg-slate-800"
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            item.isAvailable ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {item.isAvailable ? "In Stock" : "Out of Stock"}
                      </span>
                    </div>

                    {/* Edit and Delete Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
                            )
                          ) {
                            deleteMenuItem(item.id);
                          }
                        }}
                        className="p-2 bg-slate-850 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
              <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-slate-700 mb-4">
                <Search size={28} />
              </div>
              <h3 className="font-bold text-slate-400 uppercase tracking-wider text-xs">
                No Items Found
              </h3>
              <p className="text-[10px] text-slate-500/80 max-w-[200px] leading-relaxed mt-1">
                Try widening your search terms or adding a brand new food item.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Edit/Add Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-1.5">
                <Sparkles
                  size={16}
                  className="text-orange-500 fill-orange-500/20"
                />
                <span>
                  {editingItem ? "Edit Menu Item" : "Add New Menu Item"}
                </span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Error banner */}
            {formError && (
              <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-3 flex gap-2.5 items-start text-xs text-red-400">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Item Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder="E.g., Loaded Garlic Bread"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:outline-none focus:border-orange-500 text-white"
                  />
                </div>

                {/* Price */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="E.g., 240"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:outline-none focus:border-orange-500 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category Selector */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:outline-none focus:border-orange-500 text-white cursor-pointer"
                  >
                    {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                      <option
                        key={cat.id}
                        value={cat.id}
                        className="bg-slate-900"
                      >
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Diet Type (Veg / Non-Veg) */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Food Preference
                  </label>
                  <div className="flex gap-4 p-1.5 bg-slate-950 border border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIsVeg(true)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        isVeg
                          ? "bg-green-600 text-white shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsVeg(false)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        !isVeg
                          ? "bg-red-600 text-white shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Non-Veg
                    </button>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  placeholder="Describe this dish's ingredients and flavor profile..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:outline-none focus:border-orange-500 text-white resize-none"
                />
              </div>

              {/* Image Handler */}
              <div className="space-y-2">
                <label className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  Food Image Source
                </label>

                {/* Preview Image */}
                {image && (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                    <img
                      src={image}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/food-placeholder.svg";
                      }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* File Upload (Persisted as base64 in local storage) */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 block">
                      Upload Local File
                    </span>
                    <label className="flex items-center justify-center gap-1.5 border border-slate-800 hover:border-slate-700 bg-slate-950 hover:bg-slate-900 rounded-xl p-3 cursor-pointer transition-colors text-slate-400 hover:text-white font-medium">
                      <ImageIcon size={14} />
                      <span>Choose File...</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* URL Text input */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 block">
                      Or Paste Image URL
                    </span>
                    <input
                      type="text"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      maxLength={2000}
                      placeholder="Https://images.unsplash.com/..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:outline-none focus:border-orange-500 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Actions */}
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-[10px] uppercase font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-[10px] uppercase font-bold tracking-wide transition-colors border border-orange-500/20 shadow-md shadow-orange-600/10"
                >
                  {editingItem ? "Save Changes" : "Create Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default MenuManager;
