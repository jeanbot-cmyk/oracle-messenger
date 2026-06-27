'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const token = session?.user?.backendToken ?? '';
  const username = (session?.user as any)?.username ?? '';

  const [name,    setName]    = useState('');
  const [bio,     setBio]     = useState('');
  const [avatar,  setAvatar]  = useState('');
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
    // Puis backend
    if (token) {
      api.users.me(token).then((u: any) => {
        if (u.name) setName(u.name);
        if (u.bio)  setBio(u.bio);
        if (!local.avatar && u.avatar) setAvatar(u.avatar);
      }).catch(() => {});
    }
  }, [mounted, token]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Image trop grande (max 3 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setAvatar(b64);
      setError('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true); setError('');
    try {
      // 1. Toujours sauvegarder localement
      const localData = { name: name.trim(), bio, avatar };
      localStorage.setItem('oracle-profile', JSON.stringify(localData));

      // 2. Backend — envoyer nom + bio (pas l'avatar base64)
      if (token) {
        const payload: Record<string, string> = { name: name.trim(), bio };
        // Avatar URL seulement (pas base64)
        if (avatar && !avatar.startsWith('data:')) payload.avatar = avatar;
        try {
          await api.users.update(token, payload);
        } catch (e: any) {
          // Continuer même si le backend échoue — sauvegarde locale OK
          console.warn('Backend save failed:', e.message);
        }
      }

      // 3. Mettre à jour la session
      if (update) await update({ name: name.trim() }).catch(() => {});

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  const profileLink = `https://messenger.oracle-plus.online/contacts?from=${username}`;

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ minHeight:'100dvh', background:'#f0f2f5' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background:'#00a884', padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()}
          style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18 }}>←</button>
        <h1 style={{ fontSize:18, fontWeight:700, color:'#fff', margin:0, flex:1 }}>Mon profil</h1>
        {saved && <span style={{ color:'#fff', fontSize:13, fontWeight:600 }}>✓ Enregistré</span>}
      </div>

      {/* Avatar */}
      <div style={{ background:'#00a884', paddingBottom:32, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <label style={{ cursor:'pointer', position:'relative', marginTop:8 }}>
          <div style={{ width:110, height:110, borderRadius:'50%', overflow:'hidden', background:'rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', border:'3px solid rgba(255,255,255,0.5)' }}>
            {avatar
              ? <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <span style={{ fontSize:48, fontWeight:700, color:'#fff' }}>{name?.[0]?.toUpperCase() ?? '?'}</span>
            }
          </div>
          <div style={{ position:'absolute', bottom:2, right:2, width:34, height:34, borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
            <svg width="18" height="18" fill="#00a884" viewBox="0 0 24 24">
              <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display:'none' }}/>
        </label>
        <p style={{ color:'rgba(255,255,255,0.85)', fontSize:13 }}>Appuyez pour changer la photo</p>
      </div>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12, marginTop:-16 }}>
        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'10px 14px', color:'#dc2626', fontSize:13 }}>{error}</div>
        )}

        {/* Nom + Bio */}
        <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f0f2f5' }}>
            <p style={{ fontSize:12, fontWeight:600, color:'#00a884', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.5 }}>Nom</p>
            <input value={name} onChange={e => { setName(e.target.value); setError(''); }} maxLength={50} placeholder="Votre nom"
              style={{ width:'100%', border:'none', outline:'none', fontSize:16, color:'#111b21', background:'transparent', padding:0 }}/>
          </div>
          <div style={{ padding:'12px 16px' }}>
            <p style={{ fontSize:12, fontWeight:600, color:'#00a884', margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.5 }}>Bio</p>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
              placeholder="Parlez de vous en quelques mots…"
              style={{ width:'100%', border:'none', outline:'none', fontSize:15, color:'#111b21', background:'transparent', resize:'none', padding:0, lineHeight:1.5 }}/>
            <p style={{ fontSize:11, color:'#8696a0', textAlign:'right', margin:'4px 0 0' }}>{bio.length}/160</p>
          </div>
        </div>

        {/* Lien unique */}
        <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:18 }}>🔗</span>
              <p style={{ fontSize:14, fontWeight:700, color:'#111b21', margin:0 }}>Votre lien unique</p>
            </div>
            <div style={{ background:'#f0f2f5', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
              <p style={{ fontSize:13, color:'#00a884', margin:0, wordBreak:'break-all', fontWeight:500 }}>{profileLink}</p>
            </div>
            {/* Explication */}
            <div style={{ background:'#e8f5e9', borderRadius:10, padding:'10px 12px', marginBottom:12, border:'1px solid #c8e6c9' }}>
              <p style={{ fontSize:12, color:'#2e7d32', margin:0, lineHeight:1.6 }}>
                💡 <strong>Ce lien est votre identifiant Oracle Messenger</strong> — comme votre numéro de téléphone sur WhatsApp.<br/>
                Partagez-le sur <strong>Facebook, Instagram, WhatsApp</strong> ou par SMS pour que vos contacts vous écrivent directement.<br/>
                Quand quelqu'un clique dessus, il installe l'app et arrive directement dans votre conversation.
              </p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => navigator.clipboard?.writeText(profileLink).then(() => alert('Lien copié !'))}
                style={{ flex:1, background:'#f0f2f5', border:'none', borderRadius:10, padding:'10px', cursor:'pointer', fontSize:13, color:'#111b21', fontWeight:600 }}>
                📋 Copier
              </button>
              <button onClick={() => navigator.share?.({ title:'Oracle Messenger', text:`Écris-moi sur Oracle Messenger : ${profileLink}`, url: profileLink }).catch(()=>{})}
                style={{ flex:1, background:'#00a884', border:'none', borderRadius:10, padding:'10px', cursor:'pointer', fontSize:13, color:'#fff', fontWeight:600 }}>
                📤 Partager
              </button>
            </div>
          </div>
        </div>

        {/* Email */}
        <div style={{ background:'#fff', borderRadius:16, padding:'12px 16px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'#8696a0', margin:'0 0 4px', textTransform:'uppercase', letterSpacing:0.5 }}>Email</p>
          <p style={{ fontSize:15, color:'#111b21', margin:0 }}>{session?.user?.email ?? '—'}</p>
        </div>

        {/* Bouton sauvegarder */}
        <button onClick={handleSave} disabled={saving}
          style={{ background:'#00a884', color:'#fff', border:'none', borderRadius:16, padding:16, fontSize:16, fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          {saving
            ? <><div style={{ width:20, height:20, border:'2.5px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> Enregistrement…</>
            : saved ? '✓ Profil enregistré !' : 'Enregistrer le profil'
          }
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f2f5' }}>
      <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:'#00a884', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
