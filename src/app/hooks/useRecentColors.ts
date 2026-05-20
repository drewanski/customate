import { useCallback, useEffect, useState } from 'react';

/**
 * Persists the last N colours the user has applied across the studio so
 * they get a one-click palette of their own recently-used colours.
 *
 * Stored in localStorage so it survives page refresh and product changes —
 * the customer's preferred design palette stays with them across sessions.
 */
const STORAGE_KEY = 'customate_recent_colors_v1';
const MAX_COLORS = 12;

export function useRecentColors() {
  const [colors, setColors] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string').slice(0, MAX_COLORS) : [];
    } catch {
      return [];
    }
  });

  const remember = useCallback((color: string) => {
    if (!color || typeof color !== 'string') return;
    const normalized = color.toLowerCase();
    setColors((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== normalized);
      const next = [normalized, ...filtered].slice(0, MAX_COLORS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable (private mode / quota) — fine, the
        // in-memory state still works for the current session.
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setColors([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return { colors, remember, clear };
}
