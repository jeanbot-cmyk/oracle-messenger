'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const { lang } = useSettings();
  const token = session?.user?.backendToken ?? '';

  const [name, setName]   = useState('');
  const [bio, setBio]     = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!token) return;
    api.users.me(token).then((u: any) => {
      setName(u.name ?? '');
      setBio(u.bio ?? '');
      setAvatar(u.avatar ?? session?.user?.image ?? '');
    }).catch(() => {
      setName(session?.user?.name ?? '');
      setAvatar(session?.user?.image ?? '');
    });
  }, [token]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Stockage local uniquement — base64 dans IndexedDB
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    try {
      await api.users.update(token, { name, bio, avatar });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  if (!mounted || status === 'loading') return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-app)', padding:24 }}>
      <div style={{ maxWidth:480, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32 }}>
          <button onClick={() => router.back()} style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)', fontSize:18 }}>←</button>
          <h1 style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0 }}>Mon profil</h1>
        </div>

        {/* Avatar */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:32 }}>
          <label style={{ cursor:'pointer', position:'relative' }}>
            <div style={{ width:100, height:100, borderRadius:'50%', overflow:'hidden', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {avatar ? (
                <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              ) : (
                <span style={{ fontSize:40, color:'#fff', fontWeight:700 }}>{name?.[0]?.toUpperCase() ?? 'U'}</span>
              )}
            </div>
            <div style={{ position:'absolute', bottom:0, right:0, width:32, height:32, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--bg-app)' }}>
              <span style={{ fontSize:16 }}>📷</span>
            </div>
            <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display:'none' }} />
          </label>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:8 }}>Appuyez pour changer</p>
        </div>

        {/* Formulaire */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, display:'flex', flexDirection:'column', gap:16, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Nom</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={50}
              style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:15, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
              placeholder="Parlez de vous en quelques mots…"
              style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:15, outline:'none', resize:'none', boxSizing:'border-box' }} />
            <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'right', margin:'4px 0 0' }}>{bio.length}/160</p>
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:15, fontWeight:600, cursor:'pointer', opacity:saving?.7:1 }}>
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré !' : 'Enregistrer'}
          </button>
        </div>

        {/* Lien de profil */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:20, marginTop:16, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
          <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', margin:'0 0 8px' }}>Votre lien de profil</p>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <code style={{ flex:1, fontSize:13, color:'var(--accent)', background:'var(--bg-input)', padding:'8px 12px', borderRadius:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              https://messenger.oracle-plus.online/u/{session?.user?.username ?? '…'}
            </code>
            <button onClick={() => navigator.clipboard.writeText(`https://messenger.oracle-plus.online/u/${session?.user?.username}`)}
              style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-input)', cursor:'pointer', fontSize:13, color:'var(--text-primary)' }}>
              Copier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
