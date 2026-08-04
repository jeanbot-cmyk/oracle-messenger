'use client';
import { useState, useCallback } from 'react';

export interface PhoneContact {
  name: string;
  phones: string[];
  emails: string[];
  avatar?: string | null;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

function storageKey(userId?: string) {
  return userId ? `oracle-contacts:${userId}` : '';
}

export function useContacts(userId?: string) {
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
      const props = ['name', 'tel', 'email', 'icon'];
      const opts  = { multiple: true };
      const raw   = await (navigator as any).contacts.select(props, opts);
      const parsed: PhoneContact[] = await Promise.all(raw.map(async (c: any) => {
        const icon = Array.isArray(c.icon) ? c.icon[0] : null;
        return {
          name:   c.name?.[0] ?? 'Inconnu',
          phones: c.tel  ?? [],
          emails: c.email ?? [],
          avatar: icon instanceof Blob ? await readBlobAsDataUrl(icon) : null,
        };
      }));
      setContacts(parsed);
      setGranted(true);
      const key = storageKey(userId);
      if (key) localStorage.setItem(key, JSON.stringify(parsed));
      return { supported: true, contacts: parsed };
    } catch {
      return { supported: true, contacts: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCached = useCallback(() => {
    try {
      const key = storageKey(userId);
      const cached = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : [];
      setContacts(cached);
      return cached as PhoneContact[];
    } catch { return []; }
  }, [userId]);

  return { contacts, loading, granted, importContacts, loadCached };
}
