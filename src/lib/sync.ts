import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from './supabase';

export interface TableMapping<T extends { id: string }, R extends { id: string }> {
  table: string;
  fromRow: (row: R) => T;
  toRow: (item: T) => R;
  /** Client-side order after a load or realtime change. */
  sort?: (a: T, b: T) => number;
}

export interface SyncedTable<T> {
  items: T[];
  /** Same shape as useState's setter. Changed rows are upserted, removed rows deleted. */
  setItems: Dispatch<SetStateAction<T[]>>;
  loading: boolean;
  error: string;
  /** Resolves once every write sent so far has finished. */
  flush: () => Promise<void>;
}

/**
 * A whole table held in React state and kept live across everyone's browsers.
 * Writes are optimistic: state updates immediately, then the diff is sent to Supabase.
 * Changes from other people arrive over realtime. A failed write reloads from the server.
 */
export function useSyncedTable<T extends { id: string }, R extends { id: string }>(
  map: TableMapping<T, R>,
  enabled: boolean,
  /** Writes wait for this first, e.g. contacts wait for a new client row to exist. */
  waitFor?: () => Promise<void>,
): SyncedTable<T> {
  const [items, setState] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const current = useRef<T[]>([]);
  const mapRef = useRef(map);
  mapRef.current = map;
  const waitRef = useRef(waitFor);
  waitRef.current = waitFor;
  /** Writes run one after another so an older write can never land after a newer one. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  const commit = useCallback((next: T[]) => {
    const sorted = mapRef.current.sort ? [...next].sort(mapRef.current.sort) : next;
    current.current = sorted;
    setState(sorted);
  }, []);

  const load = useCallback(async () => {
    const { table, fromRow } = mapRef.current;
    const { data, error: err } = await supabase.from(table).select('*');
    if (err) {
      setError(err.message);
    } else {
      setError('');
      commit((data as R[]).map(fromRow));
    }
    setLoading(false);
  }, [commit]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const { table, fromRow } = mapRef.current;
    const channel = supabase
      .channel(`sync:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const list = current.current;
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<R>).id;
          commit(list.filter((x) => x.id !== id));
        } else {
          const item = fromRow(payload.new as R);
          const exists = list.some((x) => x.id === item.id);
          commit(exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);
        }
      })
      .subscribe((status) => {
        // Catch up on anything missed while the socket was down.
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, load, commit]);

  const setItems = useCallback<Dispatch<SetStateAction<T[]>>>(
    (update) => {
      const prev = current.current;
      const next = typeof update === 'function' ? update(prev) : update;
      commit(next);

      const { table, toRow } = mapRef.current;
      const before = new Map(prev.map((x) => [x.id, JSON.stringify(toRow(x))]));
      const changed = next.map(toRow).filter((r) => before.get(r.id) !== JSON.stringify(r));
      const nextIds = new Set(next.map((x) => x.id));
      const removed = prev.filter((x) => !nextIds.has(x.id)).map((x) => x.id);

      if (!changed.length && !removed.length) return;
      queue.current = queue.current.then(async () => {
        await waitRef.current?.();
        const results = await Promise.all([
          changed.length ? supabase.from(table).upsert(changed) : null,
          removed.length ? supabase.from(table).delete().in('id', removed) : null,
        ]);
        const failed = results.find((r) => r?.error);
        if (failed?.error) {
          setError(`Could not save: ${failed.error.message}`);
          void load();
        }
      }).catch((err: unknown) => {
        // Keep the queue alive after a network failure.
        setError(`Could not save: ${err instanceof Error ? err.message : 'network error'}`);
        void load();
      });
    },
    [commit, load],
  );

  const flush = useCallback(() => queue.current, []);

  return { items, setItems, loading, error, flush };
}
