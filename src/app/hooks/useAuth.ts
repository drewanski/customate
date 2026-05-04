import { useEffect, useState, useCallback } from 'react';

const API_URL = 'http://localhost:4000/api';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  // Check server session - logout if server restarted
  const checkServerSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/session`);
      const data = await response.json();
      const serverSessionId = data.sessionId;
      const storedSessionId = localStorage.getItem('serverSessionId');
      
      if (storedSessionId !== serverSessionId) {
        // Server restarted (or first visit) - clear all auth data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('cart');
        setUser(null);
      }
      
      // Store current server session
      localStorage.setItem('serverSessionId', serverSessionId);
    } catch (err) {
      // Server not reachable - keep current state
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      // First check server session - this may clear auth data if server restarted
      await checkServerSession();
      // Then load user (will be null if cleared)
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('serverSessionId');
    // Clean up any cart data
    localStorage.removeItem('cart');
    setUser(null);
    // Dispatch event to trigger cart reload
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: null }));
  };

  const loginUser = (token: string, userData: any) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    // Dispatch event to trigger cart reload
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: JSON.stringify(userData) }));
  };

  return { user, loading, logout, loginUser, reloadUser: loadUser };
}
