import { useState, useEffect } from 'react';

/**
 * useState backed by localStorage, so a choice (e.g. a sort order) survives
 * reloads and revisits. Falls back gracefully if storage is unavailable
 * (private mode / quota) — it just behaves like a normal useState.
 */
export function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore — storage may be unavailable
    }
  }, [key, value]);

  return [value, setValue];
}
