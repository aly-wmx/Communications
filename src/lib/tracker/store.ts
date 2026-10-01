import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useSyncedTable } from '../sync';
import { createContact, newId, type NewContactInput } from './contacts';
import { clientMapping, contactMapping, teamMapping } from './rows';
import { defaultSla } from './sla';
import type { Client, ClientContact, SlaSettings } from './types';

/** The single-row escalation matrix, kept live. */
function useSla(enabled: boolean) {
  const [sla, setLocal] = useState<SlaSettings>(defaultSla);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    const load = async () => {
      const { data, error: err } = await supabase.from('settings').select('sla').eq('id', 1).maybeSingle();
      if (err) setError(err.message);
      else if (data) setLocal({ ...defaultSla, ...(data.sla as SlaSettings) });
    };
    void load();
    const channel = supabase
      .channel('sync:settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => {
        const row = p.new as { sla?: SlaSettings };
        if (row?.sla) setLocal({ ...defaultSla, ...row.sla });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  const setSla = useCallback(async (next: SlaSettings) => {
    setLocal(next);
    const { error: err } = await supabase
      .from('settings')
      .upsert({ id: 1, sla: next, updated_at: new Date().toISOString() });
    setError(err ? `Could not save the matrix: ${err.message}` : '');
  }, []);

  return { sla, setSla, error };
}

/** All tracker data, shared by everyone on the team. `email` is the signed-in user's address. */
export function useTracker(email: string) {
  const enabled = Boolean(email);
  const clientsT = useSyncedTable(clientMapping, enabled);
  const contactsT = useSyncedTable(contactMapping, enabled, clientsT.flush);
  const teamT = useSyncedTable(teamMapping, enabled);
  const slaT = useSla(enabled);

  const contacts = contactsT.items;
  const clients = clientsT.items;
  const team = teamT.items;
  const sla = slaT.sla;
  const setContacts = contactsT.setItems;
  const setClients = clientsT.setItems;
  const setTeam = teamT.setItems;
  const setSla = slaT.setSla;
  const meId = team.find((t) => t.email && t.email.toLowerCase() === email.toLowerCase())?.id ?? '';

  const addContact = useCallback(
    (input: NewContactInput) => {
      const c = createContact(input, meId);
      setContacts((prev) => [c, ...prev]);
      return c;
    },
    [meId, setContacts],
  );

  const updateContact = useCallback(
    (id: string, fn: (c: ClientContact) => ClientContact) =>
      setContacts((prev) => prev.map((c) => (c.id === id ? fn(c) : c))),
    [setContacts],
  );

  const deleteContact = useCallback(
    (id: string) => setContacts((prev) => prev.filter((c) => c.id !== id)),
    [setContacts],
  );

  const addClient = useCallback(
    (input: Omit<Client, 'id' | 'createdAt'>) => {
      const client: Client = { ...input, name: input.name.trim(), id: newId('cl'), createdAt: new Date().toISOString() };
      setClients((prev) => [...prev, client]);
      return client;
    },
    [setClients],
  );

  const updateClient = useCallback(
    (id: string, patch: Partial<Client>) =>
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    [setClients],
  );

  const deleteClient = useCallback(
    (id: string) => {
      setClients((prev) => prev.filter((c) => c.id !== id));
      setContacts((prev) => prev.filter((c) => c.clientId !== id));
    },
    [setClients, setContacts],
  );

  return {
    contacts,
    clients,
    team,
    sla,
    meId,
    setTeam,
    setSla,
    setContacts,
    setClients,
    addContact,
    updateContact,
    deleteContact,
    addClient,
    updateClient,
    deleteClient,
    loading: contactsT.loading || clientsT.loading || teamT.loading,
    error: contactsT.error || clientsT.error || teamT.error || slaT.error,
  };
}

export type Tracker = ReturnType<typeof useTracker>;
