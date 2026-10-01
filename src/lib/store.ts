import { useCallback, useEffect, useState } from 'react';
import { createRecord, updateRecord } from './records';
import type { Communication, CommunicationInput } from './types';

const STORAGE_KEY = 'comms-dashboard:v1';

function load(): Communication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Communication[]) : [];
  } catch {
    return [];
  }
}

function save(list: Communication[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * All communications, persisted to this browser's localStorage.
 * Keeps tabs in sync via the storage event.
 */
export function useCommunications() {
  const [items, setItems] = useState<Communication[]>(load);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!save(items));
  }, [items]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((input: CommunicationInput) => {
    const rec = createRecord(input);
    setItems((prev) => [rec, ...prev]);
    return rec;
  }, []);

  const update = useCallback((id: string, input: CommunicationInput) => {
    setItems((prev) => prev.map((c) => (c.id === id ? updateRecord(c, input) : c)));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const replaceAll = useCallback((list: Communication[]) => setItems(list), []);

  return { items, add, update, remove, replaceAll, saveError };
}
