import { useCallback } from 'react';
import { createRecord, updateRecord } from './records';
import { useSyncedTable } from './sync';
import { announcementMapping } from './tracker/rows';
import type { CommunicationInput } from './types';

/** Outgoing announcements, shared by the whole team. */
export function useCommunications(enabled: boolean) {
  const { items, setItems, error } = useSyncedTable(announcementMapping, enabled);

  const add = useCallback(
    (input: CommunicationInput) => {
      const rec = createRecord(input);
      setItems((prev) => [rec, ...prev]);
      return rec;
    },
    [setItems],
  );

  const update = useCallback(
    (id: string, input: CommunicationInput) =>
      setItems((prev) => prev.map((c) => (c.id === id ? updateRecord(c, input) : c))),
    [setItems],
  );

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((c) => c.id !== id)), [setItems]);

  return { items, add, update, remove, error };
}
