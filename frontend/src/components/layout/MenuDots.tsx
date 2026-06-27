'use client';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';

interface MenuItem {
  icon: string;
  label: string;
  sublabel?: string;
  action: () => void;
  divider?: boolean;
}

export function MenuDots() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const items: MenuItem[] = [
    {
      icon: '🔮',
      label: 'Spiritualité',
      sublabel: 'oracle-plus.online',
      action: () => { window.open('https://oracle-plus.online', '_blank'); setOpen(false); },
    },
    {
      icon: '📸',
      label: 'Photos & Multimédia',
      sublabel: 'Galerie locale',
      action: () => { setOpen(false); /* Phase 2 */ },
    },
    {
      icon: '💼',
      label: 'Entreprise',
      sublabel: 'CRM & Business Hub',
      action: () => { setOpen(false); /* Phase 2 */ },
      divider: true,
    },
    {
      icon: '📤',
      label: 'Partager l\'application',
      sublabel: 'Inviter des contacts',
      action: () => {
        setOpen(false);
        if (navigator.share) {
          navigator.share({
            title: 'Oracle Messenger',
            text: 'Rejoins-moi sur Oracle Messenger, la messagerie souveraine !',
            url: 'https://messenger.oracle-plus.online',
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText('https://messenger.oracle-plus.online').then(() => {
            alert('Lien copié !');
          });
        }
      },
      divider: true,
    },
    {
      icon: '🚪',
      label: 'Déconnexion',
      action: () => { setOpen(false); signOut({ callbackUrl: '/login' }); },
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-oracle-border/30 text-oracle-muted hover:text-white transition-colors"
        aria-label="Menu"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 bg-oracle-surface border border-oracle-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          {items.map((item, i) => (
            <div key={i}>
              {item.divider && <div className="h-px bg-oracle-border mx-3" />}
              <button
                onClick={item.action}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-oracle-border/20 transition-colors text-left"
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{item.label}</div>
                  {item.sublabel && (
                    <div className="text-xs text-oracle-muted truncate">{item.sublabel}</div>
                  )}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
