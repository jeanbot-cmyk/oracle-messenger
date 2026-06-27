'use client';
import { useState, useCallback } from 'react';

export interface PhoneContact {
  name: string;
  phones: string[];
  emails: string[];
}

export function useContacts() {
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [loading, setLoading]   = useState(false);
  const [granted, setGranted]   = useState(false);

  const importContacts = useCallback(async () => {
    // API Contacts (Chrome Android 80+, pas encore iOS Safari)
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      return { supported: false, contacts: [] };
    }
    setLoading(true);
    try {
      const props = ['name', 'tel', 'email'];
      const opts  = { multiple: true };
      const raw   = await (navigator as any).contacts.select(props, opts);
      const parsed: PhoneContact[] = raw.map((c: any) => ({
        name:   c.name?.[0] ?? 'Inconnu',
        phones: c.tel  ?? [],
        emails: c.email ?? [],
      }));
      setContacts(parsed);
      setGranted(true);
      // Stocker localement (IndexedDB)
      localStorage.setItem('oracle-contacts', JSON.stringify(parsed));
      return { supported: true, contacts: parsed };
    } catch {
      return { supported: true, contacts: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCached = useCallback(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
      setContacts(cached);
      return cached as PhoneContact[];
    } catch { return []; }
  }, []);

  return { contacts, loading, granted, importContacts, loadCached };
}
