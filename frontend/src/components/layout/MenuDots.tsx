'use client';
import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useSettings } from '../../store/settings';
import { t, LANGUAGES } from '../../lib/i18n';

const ADMIN_EMAIL = 'tchingankonggeorges@gmail.com';

export function MenuDots() {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { lang, theme, setLang, toggleTheme } = useSettings();
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setLangOpen(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const menuStyle: React.CSSProperties = { position:'absolute', right:0, top:40, zIndex:50, width:220, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 4px 24px rgba(0,0,0,.15)', overflow:'hidden' };
  const itemStyle: React.CSSProperties = { width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px 16px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left' as const, color:'var(--text-primary)', fontSize:14 };
  const divStyle: React.CSSProperties = { height:1, background:'var(--border)', margin:'2px 0' };

  function shareApp() {
    setOpen(false);
    if (navigator.share) {
      navigator.share({ title:'Oracle Messenger', text:'Rejoins-moi sur Oracle Messenger !', url:'https://messenger.oracle-plus.online' }).catch(()=>{});
    } else {
      navigator.clipboard.writeText('https://messenger.oracle-plus.online').then(()=>alert('Lien copié !'));
    }
  }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)' }}>
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
        </svg>
      </button>

      {open && (
        <div style={menuStyle}>
          <button style={itemStyle} onClick={() => { window.open('https://oracle-plus.online','_blank'); setOpen(false); }}>
            <span>🔮</span><div><div style={{ fontWeight:500 }}>{t(lang,'menu.spirituality')}</div><div style={{ fontSize:11, color:'var(--text-muted)' }}>oracle-plus.online</div></div>
          </button>
          <div style={divStyle}/>
          <button style={itemStyle} onClick={() => { setOpen(false); setShowMedia(true); }}>
            <span>📸</span><div><div style={{ fontWeight:500 }}>{t(lang,'menu.media')}</div><div style={{ fontSize:11, color:'var(--text-muted)' }}>{t(lang,'menu.media.sub')}</div></div>
          </button>
          <button style={itemStyle} onClick={() => { setOpen(false); router.push('/business'); }}>
            <span>💼</span><div><div style={{ fontWeight:500 }}>{t(lang,'menu.business')}</div><div style={{ fontSize:11, color:'var(--text-muted)' }}>{t(lang,'menu.business.sub')}</div></div>
          </button>
          <div style={divStyle}/>
          {/* Thème */}
          <button style={itemStyle} onClick={() => { toggleTheme(); setOpen(false); }}>
            <span>{theme === 'light' ? '🌙' : '☀️'}</span>
            <div style={{ fontWeight:500 }}>{theme === 'light' ? t(lang,'menu.theme.dark') : t(lang,'menu.theme.light')}</div>
          </button>
          {/* Langue */}
          <button style={itemStyle} onClick={() => setLangOpen(v => !v)}>
            <span>🌐</span>
            <div style={{ flex:1, fontWeight:500 }}>{t(lang,'menu.language')}</div>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{LANGUAGES.find(l=>l.code===lang)?.flag}</span>
          </button>
          {langOpen && (
            <div style={{ background:'var(--bg-elevated)', borderTop:'1px solid var(--border)', maxHeight:200, overflowY:'auto' }}>
              {LANGUAGES.map(l => (
                <button key={l.code} style={{ ...itemStyle, padding:'8px 24px', background: l.code===lang ? 'var(--bg-input)' : 'transparent' }}
                  onClick={() => { setLang(l.code); setLangOpen(false); setOpen(false); }}>
                  <span>{l.flag}</span><span>{l.label}</span>
                  {l.code===lang && <span style={{ marginLeft:'auto', color:'var(--accent)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
          <div style={divStyle}/>
          <button style={itemStyle} onClick={shareApp}>
            <span>📤</span><div><div style={{ fontWeight:500 }}>{t(lang,'menu.share')}</div><div style={{ fontSize:11, color:'var(--text-muted)' }}>{t(lang,'menu.share.sub')}</div></div>
          </button>
          <div style={divStyle}/>
          <button style={itemStyle} onClick={() => { setOpen(false); router.push('/profile'); }}>
            <span>👤</span><span style={{ fontWeight:500 }}>Mon profil</span>
          </button>
          {isAdmin && (
            <>
              <div style={divStyle}/>
              <button style={itemStyle} onClick={() => { setOpen(false); router.push('/admin'); }}>
                <span>🛡️</span>
                <div>
                  <div style={{ fontWeight:500 }}>Panel Admin</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>Statistiques & diffusion</div>
                </div>
              </button>
            </>
          )}
          <div style={divStyle}/>
          <button style={{ ...itemStyle, color:'#dc2626' }} onClick={() => { setOpen(false); signOut({ callbackUrl:'/login' }); }}>
            <span>🚪</span><span style={{ fontWeight:500 }}>{t(lang,'menu.logout')}</span>
          </button>
        </div>
      )}

      {/* Galerie multimédia */}
      {showMedia && (
        <div style={{ position:'fixed', inset:0, zIndex:500 }}>
          {/* Import dynamique pour éviter SSR */}
          <MediaGalleryLazy onClose={() => setShowMedia(false)} />
        </div>
      )}
    </div>
  );
}

function MediaGalleryLazy({ onClose }: { onClose: () => void }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import('../media/MediaGallery').then(m => setComp(() => m.MediaGallery));
  }, []);
  if (!Comp) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}><div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  return <Comp onClose={onClose} />;
}
