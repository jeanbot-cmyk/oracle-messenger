'use client';
export const dynamic = 'force-dynamic';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ACCENT = '#00a884';
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const ALL_COUNTRIES = [
  { code:'CI', name:"Côte d'Ivoire", dial:'+225', flag:'🇨🇮' },
  { code:'CM', name:'Cameroun',      dial:'+237', flag:'🇨🇲' },
  { code:'SN', name:'Sénégal',       dial:'+221', flag:'🇸🇳' },
  { code:'ML', name:'Mali',          dial:'+223', flag:'🇲🇱' },
  { code:'BF', name:'Burkina Faso',  dial:'+226', flag:'🇧🇫' },
  { code:'GN', name:'Guinée',        dial:'+224', flag:'🇬🇳' },
  { code:'TG', name:'Togo',          dial:'+228', flag:'🇹🇬' },
  { code:'BJ', name:'Bénin',         dial:'+229', flag:'🇧🇯' },
  { code:'NE', name:'Niger',         dial:'+227', flag:'🇳🇪' },
  { code:'CD', name:'Congo (RDC)',   dial:'+243', flag:'🇨🇩' },
  { code:'CG', name:'Congo',         dial:'+242', flag:'🇨🇬' },
  { code:'GA', name:'Gabon',         dial:'+241', flag:'🇬🇦' },
  { code:'FR', name:'France',        dial:'+33',  flag:'🇫🇷' },
  { code:'BE', name:'Belgique',      dial:'+32',  flag:'🇧🇪' },
  { code:'CH', name:'Suisse',        dial:'+41',  flag:'🇨🇭' },
  { code:'CA', name:'Canada',        dial:'+1',   flag:'🇨🇦' },
  { code:'US', name:'États-Unis',    dial:'+1',   flag:'🇺🇸' },
  { code:'GB', name:'Royaume-Uni',   dial:'+44',  flag:'🇬🇧' },
  { code:'DE', name:'Allemagne',     dial:'+49',  flag:'🇩🇪' },
  { code:'IT', name:'Italie',        dial:'+39',  flag:'🇮🇹' },
  { code:'DZ', name:'Algérie',       dial:'+213', flag:'🇩🇿' },
  { code:'AO', name:'Angola',        dial:'+244', flag:'🇦🇴' },
  { code:'AR', name:'Argentine',     dial:'+54',  flag:'🇦🇷' },
  { code:'AU', name:'Australie',     dial:'+61',  flag:'🇦🇺' },
  { code:'BD', name:'Bangladesh',    dial:'+880', flag:'🇧🇩' },
  { code:'BR', name:'Brésil',        dial:'+55',  flag:'🇧🇷' },
  { code:'KH', name:'Cambodge',      dial:'+855', flag:'🇰🇭' },
  { code:'CV', name:'Cap-Vert',      dial:'+238', flag:'🇨🇻' },
  { code:'CL', name:'Chili',         dial:'+56',  flag:'🇨🇱' },
  { code:'CN', name:'Chine',         dial:'+86',  flag:'🇨🇳' },
  { code:'CO', name:'Colombie',      dial:'+57',  flag:'🇨🇴' },
  { code:'KM', name:'Comores',       dial:'+269', flag:'🇰🇲' },
  { code:'KR', name:'Corée du Sud',  dial:'+82',  flag:'🇰🇷' },
  { code:'CU', name:'Cuba',          dial:'+53',  flag:'🇨🇺' },
  { code:'DK', name:'Danemark',      dial:'+45',  flag:'🇩🇰' },
  { code:'DJ', name:'Djibouti',      dial:'+253', flag:'🇩🇯' },
  { code:'EG', name:'Égypte',        dial:'+20',  flag:'🇪🇬' },
  { code:'AE', name:'Émirats arabes',dial:'+971', flag:'🇦🇪' },
  { code:'ES', name:'Espagne',       dial:'+34',  flag:'🇪🇸' },
  { code:'ET', name:'Éthiopie',      dial:'+251', flag:'🇪🇹' },
  { code:'FI', name:'Finlande',      dial:'+358', flag:'🇫🇮' },
  { code:'GH', name:'Ghana',         dial:'+233', flag:'🇬🇭' },
  { code:'GR', name:'Grèce',         dial:'+30',  flag:'🇬🇷' },
  { code:'GT', name:'Guatemala',     dial:'+502', flag:'🇬🇹' },
  { code:'GW', name:'Guinée-Bissau', dial:'+245', flag:'🇬🇼' },
  { code:'GQ', name:'Guinée éq.',    dial:'+240', flag:'🇬🇶' },
  { code:'HT', name:'Haïti',         dial:'+509', flag:'🇭🇹' },
  { code:'IN', name:'Inde',          dial:'+91',  flag:'🇮🇳' },
  { code:'ID', name:'Indonésie',     dial:'+62',  flag:'🇮🇩' },
  { code:'IQ', name:'Irak',          dial:'+964', flag:'🇮🇶' },
  { code:'IR', name:'Iran',          dial:'+98',  flag:'🇮🇷' },
  { code:'IE', name:'Irlande',       dial:'+353', flag:'🇮🇪' },
  { code:'IL', name:'Israël',        dial:'+972', flag:'🇮🇱' },
  { code:'JP', name:'Japon',         dial:'+81',  flag:'🇯🇵' },
  { code:'JO', name:'Jordanie',      dial:'+962', flag:'🇯🇴' },
  { code:'KZ', name:'Kazakhstan',    dial:'+7',   flag:'🇰🇿' },
  { code:'KE', name:'Kenya',         dial:'+254', flag:'🇰🇪' },
  { code:'KW', name:'Koweït',        dial:'+965', flag:'🇰🇼' },
  { code:'LB', name:'Liban',         dial:'+961', flag:'🇱🇧' },
  { code:'LY', name:'Libye',         dial:'+218', flag:'🇱🇾' },
  { code:'MG', name:'Madagascar',    dial:'+261', flag:'🇲🇬' },
  { code:'MY', name:'Malaisie',      dial:'+60',  flag:'🇲🇾' },
  { code:'MR', name:'Mauritanie',    dial:'+222', flag:'🇲🇷' },
  { code:'MU', name:'Maurice',       dial:'+230', flag:'🇲🇺' },
  { code:'MX', name:'Mexique',       dial:'+52',  flag:'🇲🇽' },
  { code:'MA', name:'Maroc',         dial:'+212', flag:'🇲🇦' },
  { code:'MZ', name:'Mozambique',    dial:'+258', flag:'🇲🇿' },
  { code:'NA', name:'Namibie',       dial:'+264', flag:'🇳🇦' },
  { code:'NP', name:'Népal',         dial:'+977', flag:'🇳🇵' },
  { code:'NG', name:'Nigeria',       dial:'+234', flag:'🇳🇬' },
  { code:'NO', name:'Norvège',       dial:'+47',  flag:'🇳🇴' },
  { code:'NZ', name:'Nouvelle-Zél.', dial:'+64',  flag:'🇳🇿' },
  { code:'OM', name:'Oman',          dial:'+968', flag:'🇴🇲' },
  { code:'UG', name:'Ouganda',       dial:'+256', flag:'🇺🇬' },
  { code:'PK', name:'Pakistan',      dial:'+92',  flag:'🇵🇰' },
  { code:'PA', name:'Panama',        dial:'+507', flag:'🇵🇦' },
  { code:'NL', name:'Pays-Bas',      dial:'+31',  flag:'🇳🇱' },
  { code:'PE', name:'Pérou',         dial:'+51',  flag:'🇵🇪' },
  { code:'PH', name:'Philippines',   dial:'+63',  flag:'🇵🇭' },
  { code:'PL', name:'Pologne',       dial:'+48',  flag:'🇵🇱' },
  { code:'PT', name:'Portugal',      dial:'+351', flag:'🇵🇹' },
  { code:'QA', name:'Qatar',         dial:'+974', flag:'🇶🇦' },
  { code:'RO', name:'Roumanie',      dial:'+40',  flag:'🇷🇴' },
  { code:'RU', name:'Russie',        dial:'+7',   flag:'🇷🇺' },
  { code:'RW', name:'Rwanda',        dial:'+250', flag:'🇷🇼' },
  { code:'SA', name:'Arabie Saoudite',dial:'+966',flag:'🇸🇦' },
  { code:'SL', name:'Sierra Leone',  dial:'+232', flag:'🇸🇱' },
  { code:'SO', name:'Somalie',       dial:'+252', flag:'🇸🇴' },
  { code:'SD', name:'Soudan',        dial:'+249', flag:'🇸🇩' },
  { code:'LK', name:'Sri Lanka',     dial:'+94',  flag:'🇱🇰' },
  { code:'SE', name:'Suède',         dial:'+46',  flag:'🇸🇪' },
  { code:'SY', name:'Syrie',         dial:'+963', flag:'🇸🇾' },
  { code:'TW', name:'Taïwan',        dial:'+886', flag:'🇹🇼' },
  { code:'TZ', name:'Tanzanie',      dial:'+255', flag:'🇹🇿' },
  { code:'TD', name:'Tchad',         dial:'+235', flag:'🇹🇩' },
  { code:'TH', name:'Thaïlande',     dial:'+66',  flag:'🇹🇭' },
  { code:'TN', name:'Tunisie',       dial:'+216', flag:'🇹🇳' },
  { code:'TR', name:'Turquie',       dial:'+90',  flag:'🇹🇷' },
  { code:'UA', name:'Ukraine',       dial:'+380', flag:'🇺🇦' },
  { code:'UY', name:'Uruguay',       dial:'+598', flag:'🇺🇾' },
  { code:'VE', name:'Venezuela',     dial:'+58',  flag:'🇻🇪' },
  { code:'VN', name:'Vietnam',       dial:'+84',  flag:'🇻🇳' },
  { code:'YE', name:'Yémen',         dial:'+967', flag:'🇾🇪' },
  { code:'ZM', name:'Zambie',        dial:'+260', flag:'🇿🇲' },
  { code:'ZW', name:'Zimbabwe',      dial:'+263', flag:'🇿🇼' },
  { code:'ZA', name:'Afrique du Sud',dial:'+27',  flag:'🇿🇦' },
];

function Spinner() {
  return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [country, setCountry]     = useState(ALL_COUNTRIES[0]);
  const [phone, setPhone]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch]       = useState('');

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace((session?.user as any)?.isNew ? '/onboarding' : '/chat');
    }
  }, [status, session]);

  const filtered = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dial.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  async function handleLogin() {
    const full = `${country.dial}${phone.replace(/^0+/, '')}`;
    if (phone.length < 6) { setError('Numéro trop court'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/auth/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: full }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur');

      // Sign in via NextAuth credentials provider
      const { signIn } = await import('next-auth/react');
      const result = await signIn('phone', {
        redirect: false,
        backendToken: data.token,
        userId:       data.user.id,
        username:     data.user.username ?? '',
        isNew:        String(data.isNew ?? false),
      });
      if (result?.error) throw new Error(result.error);

      // Nouveau compte → onboarding, compte existant → chat
      router.replace(data.isNew ? '/onboarding' : '/chat');
    } catch (e: any) {
      setError(e.message ?? 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', boxSizing:'border-box', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Logo */}
      <div style={{ width:72, height:72, borderRadius:22, background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, boxShadow:`0 8px 24px ${ACCENT}44` }}>
        <svg width="38" height="38" fill="none" viewBox="0 0 24 24">
          <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
          <circle cx="8.5" cy="12" r="1.3" fill={ACCENT}/>
          <circle cx="12"  cy="12" r="1.3" fill={ACCENT}/>
          <circle cx="15.5" cy="12" r="1.3" fill={ACCENT}/>
        </svg>
      </div>

      <h1 style={{ fontSize:26, fontWeight:800, color:'#111b21', margin:'0 0 6px', textAlign:'center' }}>Oracle Messenger</h1>
      <p style={{ color:'#667781', fontSize:14, margin:'0 0 36px', textAlign:'center' }}>Entrez votre numéro de téléphone</p>

      {error && (
        <div style={{ width:'100%', maxWidth:360, marginBottom:16, padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, color:'#dc2626', fontSize:13, textAlign:'center' }}>
          {error}
        </div>
      )}

      <div style={{ width:'100%', maxWidth:360 }}>
        {/* Country + phone */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <button onClick={() => setShowPicker(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'14px 12px', background:'#f0f2f5', border:'none', borderRadius:14, cursor:'pointer', fontSize:15, fontWeight:600, color:'#111b21', flexShrink:0 }}>
            <span style={{ fontSize:20 }}>{country.flag}</span>
            <span>{country.dial}</span>
            <svg width="14" height="14" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <input
            type="tel" value={phone}
            onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Numéro de téléphone"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoFocus
            style={{ flex:1, padding:'14px 16px', background:'#f0f2f5', border:'none', borderRadius:14, fontSize:16, outline:'none', color:'#111b21' }}
          />
        </div>

        <button onClick={handleLogin} disabled={loading || phone.length < 6}
          style={{
            width:'100%',
            background: phone.length >= 6 ? ACCENT : '#e9edef',
            color: phone.length >= 6 ? '#fff' : '#8696a0',
            border:'none', borderRadius:28, padding:'17px 24px',
            fontSize:16, fontWeight:700,
            cursor: phone.length >= 6 ? 'pointer' : 'default',
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            marginBottom:24,
            boxShadow: phone.length >= 6 ? `0 4px 16px ${ACCENT}44` : 'none',
          }}>
          {loading
            ? <div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            : 'Continuer →'
          }
        </button>
      </div>

      <p style={{ fontSize:11, color:'#8696a0', textAlign:'center', lineHeight:1.6, maxWidth:300 }}>
        En continuant, vous acceptez nos{' '}
        <a href="/terms" style={{ color:ACCENT }}>conditions</a>{' '}et{' '}
        <a href="/privacy" style={{ color:ACCENT }}>politique de confidentialité</a>.
      </p>

      {/* Country picker */}
      {showPicker && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPicker(false); }}>
          <div style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px 8px', display:'flex', alignItems:'center', gap:12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un pays…"
                style={{ flex:1, padding:'10px 14px', background:'#f0f2f5', border:'none', borderRadius:20, fontSize:14, outline:'none' }} autoFocus/>
              <button onClick={() => { setShowPicker(false); setSearch(''); }}
                style={{ border:'none', background:'none', fontSize:20, cursor:'pointer', color:'#8696a0' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.map(c => (
                <button key={c.code} onClick={() => { setCountry(c); setShowPicker(false); setSearch(''); }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'12px 20px', border:'none', background: c.code === country.code ? '#f0fdf4' : 'transparent', cursor:'pointer', textAlign:'left' }}>
                  <span style={{ fontSize:24 }}>{c.flag}</span>
                  <span style={{ flex:1, fontSize:15, color:'#111b21' }}>{c.name}</span>
                  <span style={{ fontSize:14, color:'#8696a0', fontWeight:600 }}>{c.dial}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <Spinner />;
  return <LoginContent />;
}
