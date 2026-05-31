import { useEffect, useRef, useState, useCallback } from 'react';
import { io as connectSocket, Socket } from 'socket.io-client';
import { getChatUnreadCount } from '../api';
import { useAuth } from './useAuth';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');

export interface ChatToast {
  id: string;
  orderId: string;
  orderRef: string;
  fromRole: 'customer' | 'admin' | 'staff' | 'system';
  fromName: string;
  body: string;
  createdAt: string;
}

/**
 * Shared client-side handler for incoming chat events.
 *
 * - Opens a single persistent socket.io connection scoped only to `role`.
 *   The handler reads `role` and `userId` via refs so unrelated re-renders
 *   don't tear the socket down (the previous version's dep list was too
 *   eager and the socket never lived long enough to receive anything).
 * - Polls /chat/unread/count every 15s to keep the badge fresh.
 * - Plays the notification.mp3 chime at low volume on incoming messages.
 */
export function useChatNotifications(opts: { soundEnabled?: boolean } = {}) {
  const { user } = useAuth();
  const role = user?.role === 'admin' ? 'admin'
            : user?.role === 'production_staff' ? 'staff'
            : user ? 'customer' : null;

  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadPerOrder, setUnreadPerOrder] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<ChatToast | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Refs so the socket's onmessage callback can read the latest auth state
  // without us having to re-create the socket every render.
  const roleRef = useRef(role);
  const userIdRef = useRef(user?.id || (user as any)?._id);
  const soundEnabledRef = useRef(opts.soundEnabled !== false);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { userIdRef.current = user?.id || (user as any)?._id; }, [user?.id]);
  useEffect(() => { soundEnabledRef.current = opts.soundEnabled !== false; }, [opts.soundEnabled]);

  useEffect(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.volume = 0.35;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!roleRef.current) return;
    try {
      const r = await getChatUnreadCount();
      setUnreadTotal(r?.total || 0);
      setUnreadPerOrder(r?.perOrder || {});
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (!role) return;
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [role, refresh]);

  // Single persistent socket connection — scoped only to `role` so changing
  // an unrelated piece of state doesn't disconnect us mid-event.
  useEffect(() => {
    if (!role) return;
    let socket: Socket | null = null;
    try {
      socket = connectSocket(API_BASE, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;
      socket.on('chat:notify', (payload: any) => {
        if (!payload || !payload.message) return;
        const myRole = roleRef.current;
        const myId = userIdRef.current;
        // Don't notify the sender about their own message.
        if (payload.message.fromRole === myRole) return;
        // Customer side: only fire for messages on the customer's own orders.
        if (myRole === 'customer' && payload.customerId && myId && String(payload.customerId) !== String(myId)) return;
        // Admin/staff: fire for everything
        const id = String(payload.message._id || Date.now());
        setToast({
          id,
          orderId: String(payload.orderId),
          orderRef: payload.orderRef || String(payload.orderId).slice(-6).toUpperCase(),
          fromRole: payload.message.fromRole,
          fromName: payload.message.fromName || (payload.message.fromRole === 'customer' ? 'Customer' : payload.message.fromRole === 'admin' ? 'Store team' : 'Production team'),
          body: payload.message.body || '',
          createdAt: payload.message.createdAt || new Date().toISOString(),
        });
        if (soundEnabledRef.current && audioRef.current) {
          try { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } catch { /* non-fatal */ }
        }
        setTimeout(() => { refresh(); }, 200);
      });
    } catch { /* non-fatal */ }
    return () => {
      if (socket) {
        socket.off('chat:notify');
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [role, refresh]);

  const dismissToast = useCallback(() => setToast(null), []);

  return { unreadTotal, unreadPerOrder, toast, dismissToast, refresh, role };
}
