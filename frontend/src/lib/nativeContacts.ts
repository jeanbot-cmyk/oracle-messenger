'use client';

export interface NativeDeviceContact {
  name: string;
  phones: string[];
  emails: string[];
  avatar?: string | null;
}

type NativeContactsResult =
  | { supported: true; denied: false; contacts: NativeDeviceContact[] }
  | { supported: true; denied: true; contacts: NativeDeviceContact[] }
  | { supported: false; denied: false; contacts: NativeDeviceContact[] };

export function isCapacitorNativeRuntime() {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as any).Capacitor;
  return !!capacitor?.isNativePlatform?.();
}

function normalizeNativeName(contact: any) {
  return (
    contact?.name?.display ||
    [contact?.name?.given, contact?.name?.family].filter(Boolean).join(' ') ||
    'Inconnu'
  ).trim();
}

function normalizeNativeContacts(raw: any[]): NativeDeviceContact[] {
  const byKey = new Map<string, NativeDeviceContact>();

  for (const contact of raw) {
    const phones = (contact?.phones ?? [])
      .map((phone: any) => String(phone?.number ?? '').trim())
      .filter(Boolean);
    const emails = (contact?.emails ?? [])
      .map((email: any) => String(email?.address ?? '').trim())
      .filter(Boolean);

    if (!phones.length && !emails.length) continue;

    const name = normalizeNativeName(contact);
    const avatar = contact?.image?.base64String
      ? `data:image/*;base64,${contact.image.base64String}`
      : null;
    const key = `${name.toLowerCase()}|${phones.join(',')}|${emails.join(',')}`;

    if (!byKey.has(key)) {
      byKey.set(key, { name, phones, emails, avatar });
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function importNativeDeviceContacts(): Promise<NativeContactsResult> {
  if (!isCapacitorNativeRuntime()) {
    return { supported: false, denied: false, contacts: [] };
  }

  try {
    const { Contacts } = await import('@capacitor-community/contacts');
    const current = await Contacts.checkPermissions();
    let permission = current.contacts;

    if (permission !== 'granted') {
      const requested = await Contacts.requestPermissions();
      permission = requested.contacts;
    }

    if (permission !== 'granted') {
      return { supported: true, denied: true, contacts: [] };
    }

    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
        emails: true,
        image: false,
      },
    });

    return {
      supported: true,
      denied: false,
      contacts: normalizeNativeContacts(result.contacts ?? []),
    };
  } catch {
    return { supported: true, denied: true, contacts: [] };
  }
}
