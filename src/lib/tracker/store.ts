import { useCallback } from 'react';
import { usePersistentState } from '../persist';
import { createContact, newId, type NewContactInput } from './contacts';
import { defaultSla } from './sla';
import type { Client, ClientContact, SlaSettings, TeamMember } from './types';

const KEYS = {
  contacts: 'portal-tracker:contacts:v1',
  clients: 'portal-tracker:clients:v1',
  team: 'portal-tracker:team:v1',
  sla: 'portal-tracker:sla:v1',
  me: 'portal-tracker:me',
};

/** Starting team from the planning discussion; edit in Settings. */
function initialTeam(): TeamMember[] {
  return [
    { id: 'tm_van', name: 'Van', email: '', phone: '', escalation: false },
    { id: 'tm_reid', name: 'Reid', email: '', phone: '', escalation: true },
    { id: 'tm_chris', name: 'Chris', email: '', phone: '', escalation: true },
    { id: 'tm_aly', name: 'Aly', email: '', phone: '', escalation: false },
  ];
}

export function useTracker() {
  const [contacts, setContacts, e1] = usePersistentState<ClientContact[]>(KEYS.contacts, () => []);
  const [clients, setClients, e2] = usePersistentState<Client[]>(KEYS.clients, () => []);
  const [team, setTeam, e3] = usePersistentState<TeamMember[]>(KEYS.team, initialTeam);
  const [sla, setSla, e4] = usePersistentState<SlaSettings>(KEYS.sla, () => ({
    ...defaultSla,
    defaultAssigneeId: 'tm_van',
  }));
  /** Who is using this browser. Stands in for a login until the portal has one. */
  const [meId, setMeId] = usePersistentState<string>(KEYS.me, () => '');

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
    setMeId,
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
    saveError: e1 || e2 || e3 || e4,
  };
}

export type Tracker = ReturnType<typeof useTracker>;
