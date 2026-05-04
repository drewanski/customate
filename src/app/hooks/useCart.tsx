import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { CartItem, Product, CustomizationConfig } from '../data/types';

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

  const addItem = (product: Product, customization: CustomizationConfig, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.customization.size === customization.size && item.customization.color === customization.color && item.customization.text === customization.text);
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
