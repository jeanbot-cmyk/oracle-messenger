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

  const [name, setName]     = useState('');
  const [bio, setBio]       = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!mounted) return;
    // Charger d'abord depuis localStorage (plus rapide)
    const localProfile = JSON.parse(localStorage.getItem('oracle-profile') ?? '{}');
    if (localProfile.name) setName(localProfile.name);
    if (localProfile.bio)  setBio(localProfile.bio);
    if (localProfile.avatar) setAvatar(localProfile.avatar);

    // Puis depuis le backend si token disponible
    if (token) {
      api.users.me(token).then((u: any) => {
        setName(u.name ?? localProfile.name ?? session?.user?.name ?? '');
        setBio(u.bio ?? localProfile.bio ?? '');
        // Avatar : priorité localStorage (base64) > backend > Google
        if (!localProfile.avatar) {
          setAvatar(u.avatar ?? session?.user?.image ?? '');
        }
      }).catch(() => {
        if (!localProfile.name) setName(session?.user?.name ?? '');
        if (!localProfile.avatar) setAvatar(session?.user?.image ?? '');
      });
    } else {
      if (!localProfile.name) setName(session?.user?.name ?? '');
      if (!localProfile.avatar) setAvatar(session?.user?.image ?? '');
    }
  }, [mounted, token]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Image trop grande (max 2 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true); setError('');
    try {
      // 1. Sauvegarder localement (toujours)
      const localData = { name: name.trim(), bio, avatar };
      localStorage.setItem('oracle-profile', JSON.stringify(localData));

      // 2. Sauvegarder sur le backend (sans l'avatar base64 si trop lourd)
      if (token) {
        const payload: any = { name: name.trim(), bio };
        // N'envoyer l'avatar que s'il vient de Google (URL) pas base64
        if (avatar && !avatar.startsWith('data:')) payload.avatar = avatar;
        await api.users.update(token, payload);
      }

      // 3. Mettre à jour la session NextAuth
      if (update) {
        await update({ name: name.trim() });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f2f5' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: '#00a884', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0, flex: 1 }}>Mon profil</h1>
        {saved && <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>✓ Enregistré</span>}
      </div>

      {/* Avatar */}
      <div style={{ background: '#00a884', paddingBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <label style={{ cursor: 'pointer', position: 'relative', marginTop: 8 }}>
          <div style={{ width: 110, height: 110, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid rgba(255,255,255,0.5)' }}>
            {avatar ? (
              <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 48, fontWeight: 700, color: '#fff' }}>{name?.[0]?.toUpperCase() ?? '?'}</span>
            )}
          </div>
          <div style={{ position: 'absolute', bottom: 2, right: 2, width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <svg width="18" height="18" fill="#00a884" viewBox="0 0 24 24">
              <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
        </label>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Appuyez pour changer la photo</p>
      </div>

      {/* Formulaire */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: -16 }}>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#00a884', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nom</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={50}
              placeholder="Votre nom"
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16, color: '#111b21', background: 'transparent', padding: 0 }}
            />
          </div>
          <div style={{ padding: '12px 16px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#00a884', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Bio</p>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder="Parlez de vous en quelques mots…"
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, color: '#111b21', background: 'transparent', resize: 'none', padding: 0, lineHeight: 1.5 }}
            />
            <p style={{ fontSize: 11, color: '#8696a0', textAlign: 'right', margin: '4px 0 0' }}>{bio.length}/160</p>
          </div>
        </div>

        {/* Infos compte */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8696a0', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</p>
            <p style={{ fontSize: 15, color: '#111b21', margin: 0 }}>{session?.user?.email ?? '—'}</p>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8696a0', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lien de profil</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 14, color: '#00a884', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                messenger.oracle-plus.online/u/{session?.user?.username ?? '…'}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(`https://messenger.oracle-plus.online/u/${session?.user?.username}`)}
                style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#111b21', flexShrink: 0 }}>
                Copier
              </button>
            </div>
          </div>
        </div>

        {/* Bouton sauvegarder */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: '#00a884', color: '#fff', border: 'none', borderRadius: 16, padding: '16px', fontSize: 16, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {saving ? (
            <><div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/> Enregistrement…</>
          ) : saved ? '✓ Profil enregistré !' : 'Enregistrer le profil'}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e9edef', borderTopColor: '#00a884', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
