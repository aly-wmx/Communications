import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState backed by localStorage, synced across tabs.
 * This is the single persistence seam: swap it for a shared database later.
 */
export function usePersistentState<T>(
  key: string,
  initial: () => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial();
    } catch {
      return initial();
    }
  };
  const [value, setValue] = useState<T>(read);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [key, value]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, saveError];
}

/** Current time, re-rendering every `ms` so wait timers stay live. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
