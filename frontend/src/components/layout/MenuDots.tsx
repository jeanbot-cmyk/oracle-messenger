'use client';
import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useSettings } from '../../store/settings';
import { t, LANGUAGES } from '../../lib/i18n';
import { notify } from '../../lib/feedback';

const ADMIN_EMAIL = 'tchingankonggeorges@gmail.com';
const ADMIN_PHONES = ['+2250504673829', '+2250700508618'];

export function MenuDots() {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { lang, theme, setLang, toggleTheme } = useSettings();
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.email === ADMIN_EMAIL || ADMIN_PHONES.includes((session?.user as any)?.phone);
  const ownerId = (session?.user as any)?.id || session?.user?.email || '';

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setLangOpen(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function shareApp() {
    setOpen(false);
    if (navigator.share) {
      navigator.share({ title:'Oracle Messenger', text:t(lang, 'menu.share.sub'), url:'https://messenger.oracle-plus.online' }).catch(()=>{});
    } else {
      navigator.clipboard.writeText('https://messenger.oracle-plus.online').then(()=>notify(t(lang, 'profile.linkCopied'), 'success'));
    }
  }

  const menuStyle: React.CSSProperties = {
    position:'absolute',
    right:0,
    top:52,
    zIndex:50,
    width:'min(292px, calc(100vw - 34px))',
    maxHeight:'min(78dvh, 680px)',
    overflowY:'auto',
    overflowX:'hidden',
    background:'color-mix(in srgb, var(--bg-surface) 94%, transparent)',
    border:'1px solid color-mix(in srgb, var(--border) 72%, transparent)',
    borderRadius:24,
    boxShadow:'0 26px 70px rgba(16,42,42,0.22), 0 2px 10px rgba(15,23,42,0.08)',
    backdropFilter:'blur(18px) saturate(1.08)',
    WebkitBackdropFilter:'blur(18px) saturate(1.08)',
    padding:'10px 0',
    scrollbarWidth:'none',
  };
  const divStyle: React.CSSProperties = { height:1, background:'color-mix(in srgb, var(--border) 58%, transparent)', margin:'9px 18px' };

  function MenuItem({
    icon,
    title,
    subtitle,
    end,
    danger = false,
    onClick,
  }: {
    icon: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    end?: React.ReactNode;
    danger?: boolean;
    onClick: () => void;
  }) {
    return (
      <button className={`om-tools-menu-item${danger ? ' om-tools-menu-danger' : ''}`} onClick={onClick}>
        <span className="om-tools-menu-icon" aria-hidden="true">{icon}</span>
        <span className="om-tools-menu-copy">
          <span className="om-tools-menu-title">{title}</span>
          {subtitle && <span className="om-tools-menu-subtitle">{subtitle}</span>}
        </span>
        {end && <span className="om-tools-menu-end">{end}</span>}
      </button>
    );
  }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t(lang, 'chat.menu.open')}
        style={{ width:42, height:42, minHeight:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1.5px solid rgba(255,255,255,0.22)', background:'rgba(255,255,255,0.14)', cursor:'pointer', color:'#FFFFFF', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 20px rgba(0,0,0,0.16)' }}
      >
        <svg width="25" height="25" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.85"/><circle cx="12" cy="12" r="1.85"/><circle cx="12" cy="19" r="1.85"/>
        </svg>
      </button>

      {open && (
        <div style={menuStyle}>
          <style>{`
            @keyframes omToolsMenuIn {
              from { opacity: 0; transform: translateY(-8px) scale(.985); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .om-tools-menu-item {
              position: relative;
              width: 100%;
              min-height: 68px;
              display: flex;
              align-items: center;
              gap: 17px;
              padding: 15px 18px;
              border: none;
              background: transparent;
              color: var(--text-primary);
              cursor: pointer;
              text-align: left;
              line-height: 1.18;
              animation: omToolsMenuIn 170ms ease both;
              transition: background-color 140ms ease, transform 120ms ease, color 140ms ease;
            }
            .om-tools-menu-item::after {
              content: "";
              position: absolute;
              inset: 7px 10px;
              border-radius: 16px;
              background: transparent;
              z-index: -1;
              transition: background-color 120ms ease, transform 120ms ease;
            }
            .om-tools-menu-item:active {
              transform: scale(.992);
            }
            .om-tools-menu-item:active::after,
            .om-tools-menu-item:hover::after {
              background: color-mix(in srgb, var(--header-bg) 9%, transparent);
            }
            .dark .om-tools-menu-item:active::after,
            .dark .om-tools-menu-item:hover::after {
              background: rgba(255,255,255,.08);
            }
            .om-tools-menu-icon {
              width: 34px;
              height: 34px;
              flex: 0 0 34px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 22px;
              line-height: 1;
              border-radius: 12px;
              background: color-mix(in srgb, var(--header-bg) 7%, transparent);
            }
            .om-tools-menu-copy {
              min-width: 0;
              flex: 1 1 auto;
              display: flex;
              flex-direction: column;
              gap: 3px;
              justify-content: center;
            }
            .om-tools-menu-title {
              display: block;
              font-size: 16px;
              font-weight: 760;
              color: inherit;
              letter-spacing: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .om-tools-menu-subtitle {
              display: block;
              font-size: 13px;
              font-weight: 560;
              color: var(--text-muted);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .om-tools-menu-end {
              flex: 0 0 auto;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-width: 24px;
              color: var(--text-muted);
              font-weight: 800;
            }
            .om-tools-menu-danger {
              color: #dc2626;
            }
            .om-tools-menu-danger .om-tools-menu-icon {
              background: rgba(220,38,38,.08);
            }
            @media (prefers-reduced-motion: reduce) {
              .om-tools-menu-item { animation: none; transition: none; }
            }
          `}</style>
          <MenuItem icon="🔮" title={t(lang,'menu.spirituality')} subtitle={t(lang,'menu.spirituality.sub')} onClick={() => { window.location.assign('https://oracle-plus.online/consultation'); setOpen(false); }} />
          <MenuItem icon="🌐" title="Web" subtitle="Créer mon site web, appli ou boutique" onClick={() => { window.location.assign('https://web.oracle-plus.online?source=messenger'); setOpen(false); }} />
          <div style={divStyle}/>
          <MenuItem icon="📸" title={t(lang,'menu.media')} subtitle={t(lang,'menu.media.sub')} onClick={() => { setOpen(false); setShowMedia(true); }} />
          <MenuItem icon="💼" title={t(lang,'menu.business')} subtitle={t(lang,'menu.business.sub')} onClick={() => { setOpen(false); router.push('/business'); }} />
          <div style={divStyle}/>
          {/* Thème */}
          <MenuItem icon={theme === 'light' ? '🌙' : '☀️'} title={theme === 'light' ? t(lang,'menu.theme.dark') : t(lang,'menu.theme.light')} onClick={() => { toggleTheme(); setOpen(false); }} />
          {/* Langue */}
          <MenuItem icon="🌐" title={t(lang,'menu.language')} end={LANGUAGES.find(l=>l.code===lang)?.flag} onClick={() => setLangOpen(v => !v)} />
          {langOpen && (
            <div style={{ background:'color-mix(in srgb, var(--bg-elevated) 88%, transparent)', borderTop:'1px solid color-mix(in srgb, var(--border) 56%, transparent)', maxHeight:200, overflowY:'auto', padding:'4px 0' }}>
              {LANGUAGES.map(l => (
                <button key={l.code} className="om-tools-menu-item" style={{ minHeight:46, padding:'9px 24px', background: l.code===lang ? 'color-mix(in srgb, var(--header-bg) 9%, transparent)' : 'transparent' }}
                  onClick={() => { setLang(l.code); setLangOpen(false); setOpen(false); }}>
                  <span className="om-tools-menu-icon" style={{ width:28, height:28, flexBasis:28, fontSize:18 }}>{l.flag}</span>
                  <span className="om-tools-menu-title" style={{ fontSize:14 }}>{l.label}</span>
                  {l.code===lang && <span className="om-tools-menu-end" style={{ marginLeft:'auto', color:'var(--brand)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
          <div style={divStyle}/>
          <MenuItem icon="📤" title={t(lang,'menu.share')} subtitle={t(lang,'menu.share.sub')} onClick={shareApp} />
          <div style={divStyle}/>
          <MenuItem icon="👤" title={t(lang,'menu.profile')} onClick={() => { setOpen(false); router.push('/profile'); }} />
          {isAdmin && (
            <>
              <div style={divStyle}/>
              <MenuItem icon="🛡️" title={t(lang,'menu.admin')} subtitle={t(lang,'menu.admin.sub')} onClick={() => { setOpen(false); router.push('/admin'); }} />
            </>
          )}
          <div style={divStyle}/>
          <MenuItem icon="🚪" title={t(lang,'menu.logout')} danger onClick={() => { setOpen(false); signOut({ callbackUrl:'/login' }); }} />
        </div>
      )}

      {/* Galerie multimédia */}
      {showMedia && (
        <div style={{ position:'fixed', inset:0, zIndex:500 }}>
          {/* Import dynamique pour éviter SSR */}
          <MediaGalleryLazy ownerId={ownerId} onClose={() => setShowMedia(false)} />
        </div>
      )}
    </div>
  );
}

function MediaGalleryLazy({ ownerId, onClose }: { ownerId: string; onClose: () => void }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import('../media/MediaGallery').then(m => setComp(() => m.MediaGallery));
  }, []);
  if (!Comp) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}><div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  return <Comp ownerId={ownerId} onClose={onClose} />;
}
