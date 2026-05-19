import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CartItem, Product, CustomizationConfig } from '../data/types';
import { syncAbandonedCart } from '../api';

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, customization: CustomizationConfig, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalAmount: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

// Base storage key - will be combined with user ID
const STORAGE_KEY_BASE = 'cart';

// Get user-specific storage key
const getStorageKey = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user?.id || user?._id) {
        return `${STORAGE_KEY_BASE}_${user.id || user._id}`;
      }
    } catch {
      // Invalid user data, fall back to default
    }
  }
  return STORAGE_KEY_BASE; // Guest cart
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [storageKey, setStorageKey] = useState(getStorageKey());

  // Load cart for current user
  const loadCart = useCallback(() => {
    const key = getStorageKey();
    setStorageKey(key);
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    } else {
      setItems([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadCart();
    
    // Clean up old shared cart key to prevent cross-user data leakage
    // This removes the old 'cart' key that was shared across all users
    const currentKey = getStorageKey();
    if (currentKey !== STORAGE_KEY_BASE) {
      localStorage.removeItem(STORAGE_KEY_BASE);
    }
  }, [loadCart]);

  // Listen for storage changes (login/logout in other tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' || e.key === 'token') {
        loadCart();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadCart]);

  // Save cart whenever items change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  // Debounced server-side cart sync — powers abandoned-cart recovery.
  // Only fires for logged-in customers (token present); the backend's
  // authMiddleware rejects anon calls cleanly anyway.
  const syncTimerRef = useRef<any>(null);
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const subtotal = items.reduce(
        (sum, it) => sum + it.quantity * it.product.price,
        0,
      );
      // Strip large fields (previewImage data URLs) before sending — the
      // server only needs the bare minimum to reconstruct the recovery email.
      const lite = items.map((it) => ({
        sku: it.product.sku,
        name: it.product.name,
        quantity: it.quantity,
        unitPrice: it.product.price,
        customization: {
          size: it.customization.size,
          color: it.customization.color,
          placement: it.customization.placement,
          text: it.customization.text,
        },
      }));
      syncAbandonedCart(lite, subtotal).catch((err) =>
        // Non-fatal: a failed sync just means recovery emails won't fire.
        console.debug('Cart sync failed (non-fatal):', err?.message),
      );
    }, 30 * 1000); // 30s debounce
    return () => clearTimeout(syncTimerRef.current);
  }, [items]);

  const addItem = (product: Product, customization: CustomizationConfig, quantity = 1) => {
    setItems(prev => {
      // Dedup rule: same product + same basic specs (size/color/text) AND the
      // same customized-flag state. A customized item with a design snapshot
      // is ALWAYS treated as unique — two custom designs that happen to share
      // size/color/text would still merge incorrectly otherwise, and the
      // operator would lose one of the design previews.
      const existing = customization.isCustomized
        ? null
        : prev.find(
            (item) =>
              item.product.id === product.id &&
              !item.customization.isCustomized &&
              item.customization.size === customization.size &&
              item.customization.color === customization.color &&
              item.customization.text === customization.text,
          );
      if (existing) {
        return prev.map(item =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + quantity, totalPrice: (item.quantity + quantity) * product.price }
            : item
        );
      }

      const id = `${product.id}-${Date.now()}`;
      const totalPrice = product.price * quantity;
      return [...prev, { id, product, customization, quantity, totalPrice }];
    });
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, quantity, totalPrice: quantity * item.product.price }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    localStorage.removeItem(storageKey);
  };

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + item.totalPrice, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalAmount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
