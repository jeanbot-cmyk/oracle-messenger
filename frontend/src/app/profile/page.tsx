'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { notify } from '../../lib/feedback';

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const { lang } = useSettings();
  const token = session?.user?.backendToken ?? '';
  const username = (session?.user as any)?.username ?? '';

  const [name,    setName]    = useState('');
  const [bio,     setBio]     = useState('');
  const [avatar,  setAvatar]  = useState('');
  const [phone,   setPhone]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!mounted) return;
    // Charger depuis localStorage d'abord
    const local = JSON.parse(localStorage.getItem('oracle-profile') ?? '{}');
    setName(local.name || session?.user?.name || '');
    setBio(local.bio || '');
    setAvatar(local.avatar || session?.user?.image || '');
    setPhone(local.phone || '');
    // Puis backend (source de vérité)
    if (token) {
      api.users.me(token).then((u: any) => {
        if (u.name)   setName(u.name);
        if (u.bio)    setBio(u.bio);
        if (u.avatar) setAvatar(u.avatar); // priorité backend sur local
        if (u.phone)  setPhone(u.phone);
      }).catch(() => {});
    }
  }, [mounted, token]);

  async function compressAvatar(file: File): Promise<string> {
    const imageUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = imageUrl;
      });
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(img, 0, 0, width, height);

      const qualities = [0.9, 0.84, 0.76, 0.66, 0.56];
      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length < 3_400_000) return dataUrl;
      }
      return canvas.toDataURL('image/jpeg', 0.48);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t(lang, 'profile.invalidImage'));
      e.target.value = '';
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setError(t(lang, 'profile.imageTooLarge'));
      e.target.value = '';
      return;
    }
    setError('');
    try {
      const b64 = await compressAvatar(file);
      setAvatar(b64);
      setError('');
    } catch {
      setError(t(lang, 'profile.imagePrepareError'));
    }
    e.target.value = '';
  }

  async function handleSave() {
    if (!name.trim()) { setError(t(lang, 'profile.nameRequired')); return; }
    setSaving(true); setError('');
    try {
      const payload: Record<string, string> = { name: name.trim(), bio };
      if (avatar) payload.avatar = avatar;
      if (phone.trim()) payload.phone = phone.trim();
      let savedUser: any = { name: name.trim(), bio, avatar, phone: phone.trim() };
      if (token) {
        savedUser = await api.users.update(token, payload);
      }

      localStorage.setItem('oracle-profile', JSON.stringify({
        name: savedUser.name ?? name.trim(),
        bio: savedUser.bio ?? bio,
        avatar: savedUser.avatar ?? avatar,
        phone: savedUser.phone ?? phone.trim(),
      }));

      if (update) {
        await update({
          user: {
            name: savedUser.name ?? name.trim(),
            image: savedUser.avatar ?? avatar,
            phone: savedUser.phone ?? phone.trim(),
            username: savedUser.username ?? username,
          },
        }).catch(() => {});
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      const message = String(err?.message ?? '');
      if (message.includes('409') || message.toLowerCase().includes('déjà associé')) {
        setError(t(lang, 'profile.phoneUsed'));
      } else if (message.includes('400') || message.toLowerCase().includes('invalide')) {
        setError(t(lang, 'profile.phoneInvalid'));
      } else {
        setError(t(lang, 'profile.saveError'));
      }
    } finally {
      setSaving(false);
    }
  }

  // Use /u/username for clean shareable link with OG meta
  const profileLink = username
    ? `https://messenger.oracle-plus.online/u/${encodeURIComponent(username)}`
    : 'https://messenger.oracle-plus.online/install';

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg-app)', paddingBottom:'calc(158px + env(safe-area-inset-bottom))' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background:'var(--header-bg)', padding:'14px 16px', display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:20 }}>
        <button onClick={() => router.back()}
          style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18 }}>←</button>
        <h1 style={{ fontSize:18, fontWeight:900, color:'#fff', margin:0, flex:1 }}>{t(lang, 'profile.title')}</h1>
        {saved && <span style={{ color:'#fff', fontSize:13, fontWeight:600 }}>✓ {t(lang, 'common.saved')}</span>}
        <button onClick={handleSave} disabled={saving}
          style={{ border:'none', borderRadius:999, background:'var(--accent)', color:'var(--accent-text)', padding:'8px 12px', fontSize:13, fontWeight:900, cursor:saving ? 'not-allowed' : 'pointer', opacity:saving ? 0.8 : 1, whiteSpace:'nowrap' }}>
          {saving ? '...' : t(lang, 'common.save')}
        </button>
      </div>

      {/* Avatar */}
      <div style={{ background:'var(--header-bg)', paddingBottom:32, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <label style={{ cursor:'pointer', position:'relative', marginTop:8 }}>
          <div style={{ width:110, height:110, borderRadius:'50%', overflow:'hidden', background:'rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', border:'3px solid rgba(255,255,255,0.5)' }}>
            {avatar
              ? <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <span style={{ fontSize:48, fontWeight:700, color:'#fff' }}>{name?.[0]?.toUpperCase() ?? '?'}</span>
            }
          </div>
          <div style={{ position:'absolute', bottom:2, right:2, width:34, height:34, borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
            <svg width="18" height="18" fill="var(--accent)" viewBox="0 0 24 24">
              <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display:'none' }}/>
        </label>
        <p style={{ color:'rgba(255,255,255,0.85)', fontSize:13 }}>{t(lang, 'profile.tapPhoto')}</p>
      </div>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12, marginTop:-16 }}>
        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'10px 14px', color:'#dc2626', fontSize:13 }}>{error}</div>
        )}

        {/* Nom + Bio */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)', border:'1px solid var(--border)' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--bg-input)' }}>
            <p style={{ fontSize:12, fontWeight:800, color:'var(--brand)', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.5 }}>{t(lang, 'profile.name')}</p>
            <input value={name} onChange={e => { setName(e.target.value); setError(''); }} maxLength={50} placeholder={t(lang, 'profile.yourName')}
              style={{ width:'100%', border:'none', outline:'none', fontSize:16, color:'var(--text-primary)', background:'transparent', padding:0 }}/>
          </div>
          <div style={{ padding:'12px 16px' }}>
            <p style={{ fontSize:12, fontWeight:800, color:'var(--brand)', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.5 }}>{t(lang, 'profile.bio')}</p>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
              placeholder={t(lang, 'profile.bioPlaceholder')}
              style={{ width:'100%', border:'none', outline:'none', fontSize:15, color:'var(--text-primary)', background:'transparent', resize:'none', padding:0, lineHeight:1.5 }}/>
            <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'right', margin:'4px 0 0' }}>{bio.length}/160</p>
          </div>
        </div>

        {/* Lien unique */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow)', border:'1px solid var(--border)' }}>
          <div style={{ padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:18 }}>🔗</span>
              <p style={{ fontSize:14, fontWeight:800, color:'var(--text-primary)', margin:0 }}>{t(lang, 'profile.uniqueLink')}</p>
            </div>
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 12px', marginBottom:10, border:'1px solid var(--border)', userSelect:'text', WebkitUserSelect:'text' }}>
              <p style={{ fontSize:13, color:'#151A23', margin:0, wordBreak:'break-all', fontWeight:800, lineHeight:1.45 }}>{profileLink}</p>
            </div>
            {/* Explication */}
            <div style={{ background:'rgba(16,42,42,0.06)', borderRadius:10, padding:'10px 12px', marginBottom:12, border:'1px solid rgba(16,42,42,0.12)' }}>
              <p style={{ fontSize:12.5, color:'#151A23', margin:0, lineHeight:1.62, fontWeight:750 }}>
                💡 <strong>{t(lang, 'profile.linkHelp1')}</strong><br/>
                {t(lang, 'profile.linkHelp2')}<br/>
                {t(lang, 'profile.linkHelp3')}
              </p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => navigator.clipboard?.writeText(profileLink).then(() => notify(t(lang, 'profile.linkCopied'), 'success'))}
                style={{ flex:1, background:'var(--bg-app)', border:'1px solid var(--border)', borderRadius:10, padding:'10px', cursor:'pointer', fontSize:13, color:'var(--text-primary)', fontWeight:700 }}>
                📋 {t(lang, 'common.copy')}
              </button>
              <button onClick={() => navigator.share?.({ title:'Oracle Messenger', text:t(lang, 'profile.shareText').replace('{link}', profileLink), url: profileLink }).catch(()=>{})}
                style={{ flex:1, background:'var(--accent)', border:'none', borderRadius:10, padding:'10px', cursor:'pointer', fontSize:13, color:'var(--accent-text)', fontWeight:800 }}>
                📤 {t(lang, 'common.share')}
              </button>
            </div>
          </div>
        </div>

        {/* Téléphone */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:'12px 16px', boxShadow:'var(--shadow)', border:'1px solid var(--border)' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'var(--brand)', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.5 }}>📱 {t(lang, 'profile.phone')}</p>
          <input
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(''); }}
            type="tel"
            placeholder="+33 6 12 34 56 78"
            style={{ width:'100%', border:'none', outline:'none', fontSize:15, color:'var(--text-primary)', background:'transparent', padding:0 }}
          />
          <p style={{ fontSize:11, color:'var(--text-muted)', margin:'6px 0 0' }}>{t(lang, 'profile.phoneHelp')}</p>
        </div>

        {/* Email */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:'12px 16px', boxShadow:'var(--shadow)', border:'1px solid var(--border)' }}>
          <p style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', margin:'0 0 4px', textTransform:'uppercase', letterSpacing:0.5 }}>{t(lang, 'profile.email')}</p>
          <p style={{ fontSize:15, color:'var(--text-primary)', margin:0 }}>{session?.user?.email ?? '—'}</p>
        </div>

      </div>

      {/* Bouton sauvegarder toujours visible */}
      <div style={{ position:'fixed', left:0, right:0, bottom:0, zIndex:30, padding:'10px 16px max(12px, env(safe-area-inset-bottom))', background:'rgba(245,241,234,0.92)', backdropFilter:'blur(12px)', borderTop:'1px solid var(--border)' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ width:'100%', background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:16, padding:16, fontSize:16, fontWeight:900, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'var(--shadow)' }}>
          {saving
            ? <><div style={{ width:20, height:20, border:'2.5px solid rgba(16,42,42,0.25)', borderTopColor:'var(--accent-text)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> {t(lang, 'common.saving')}</>
            : saved ? `✓ ${t(lang, 'profile.saved')}` : t(lang, 'common.save')
          }
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
