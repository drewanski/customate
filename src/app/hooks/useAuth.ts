import { useEffect, useState, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('cart');
    setUser(null);
  }, []);

  const loadUser = useCallback(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        clearAuth();
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, [clearAuth]);

  const validateStoredAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr || localStorage.getItem('isAuthenticated') !== 'true') {
      clearAuth();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        clearAuth();
        return;
      }

      const profile = await response.json();
      const normalizedUser = {
        ...JSON.parse(userStr),
        ...profile,
        id: profile.id || profile._id || JSON.parse(userStr).id
      };
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
    } catch {
      clearAuth();
    }
  }, [clearAuth]);

  // Check server session - logout if server restarted
  const checkServerSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/session`);
      const data = await response.json();
      const serverSessionId = data.sessionId;
      const storedSessionId = localStorage.getItem('serverSessionId');
      
      if (storedSessionId !== serverSessionId) {
        // Server restarted (or first visit) - clear all auth data
        clearAuth();
      }
      
      // Store current server session
      localStorage.setItem('serverSessionId', serverSessionId);
    } catch (err) {
      clearAuth();
    }
  }, [clearAuth]);

  useEffect(() => {
    const initAuth = async () => {
      // First check server session - this may clear auth data if server restarted
      await checkServerSession();
      // Then verify the saved token before rendering logged-in UI
      await validateStoredAuth();
      loadUser();
    };
    initAuth();
    
    // Listen for storage changes in other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'user') {
        loadUser();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadUser, checkServerSession]);

  const logout = () => {
    // Get user ID before removing user data to clear their specific cart
    const userStr = localStorage.getItem('user');
    let userId = null;
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        userId = user?.id || user?._id;
      } catch {
        // Invalid user data
      }
    }
    
    // Remove auth data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('serverSessionId');
    localStorage.removeItem('isAuthenticated');
    
    // Clear user-specific cart
    if (userId) {
      localStorage.removeItem(`cart_${userId}`);
    }
    
    // Also clear any old shared cart key
    localStorage.removeItem('cart');
    
    setUser(null);
    // Dispatch event to trigger cart reload
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: null }));
  };

  const loginUser = (token: string, userData: any) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('isAuthenticated', 'true');
    setUser(userData);
    // Dispatch event to trigger cart reload
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: JSON.stringify(userData) }));
  };

  return { user, loading, logout, loginUser, reloadUser: loadUser };
}
