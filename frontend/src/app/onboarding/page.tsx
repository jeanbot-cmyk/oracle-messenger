'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

const ACCENT = '#128C7E';

const COUNTRIES = [
  {code:'DZ',name:'Algérie',dial:'+213',flag:'🇩🇿'},{code:'AO',name:'Angola',dial:'+244',flag:'🇦🇴'},
  {code:'BJ',name:'Bénin',dial:'+229',flag:'🇧🇯'},{code:'BF',name:'Burkina Faso',dial:'+226',flag:'🇧🇫'},
  {code:'BI',name:'Burundi',dial:'+257',flag:'🇧🇮'},{code:'CM',name:'Cameroun',dial:'+237',flag:'🇨🇲'},
  {code:'CV',name:'Cap-Vert',dial:'+238',flag:'🇨🇻'},{code:'CF',name:'Centrafrique',dial:'+236',flag:'🇨🇫'},
  {code:'KM',name:'Comores',dial:'+269',flag:'🇰🇲'},{code:'CG',name:'Congo',dial:'+242',flag:'🇨🇬'},
  {code:'CD',name:'Congo (RDC)',dial:'+243',flag:'🇨🇩'},{code:'CI',name:"Côte d'Ivoire",dial:'+225',flag:'🇨🇮'},
  {code:'DJ',name:'Djibouti',dial:'+253',flag:'🇩🇯'},{code:'EG',name:'Égypte',dial:'+20',flag:'🇪🇬'},
  {code:'ER',name:'Érythrée',dial:'+291',flag:'🇪🇷'},{code:'ET',name:'Éthiopie',dial:'+251',flag:'🇪🇹'},
  {code:'GA',name:'Gabon',dial:'+241',flag:'🇬🇦'},{code:'GM',name:'Gambie',dial:'+220',flag:'🇬🇲'},
  {code:'GH',name:'Ghana',dial:'+233',flag:'🇬🇭'},{code:'GN',name:'Guinée',dial:'+224',flag:'🇬🇳'},
  {code:'GQ',name:'Guinée éq.',dial:'+240',flag:'🇬🇶'},{code:'GW',name:'Guinée-Bissau',dial:'+245',flag:'🇬🇼'},
  {code:'KE',name:'Kenya',dial:'+254',flag:'🇰🇪'},{code:'LS',name:'Lesotho',dial:'+266',flag:'🇱🇸'},
  {code:'LR',name:'Libéria',dial:'+231',flag:'🇱🇷'},{code:'LY',name:'Libye',dial:'+218',flag:'🇱🇾'},
  {code:'MG',name:'Madagascar',dial:'+261',flag:'🇲🇬'},{code:'MW',name:'Malawi',dial:'+265',flag:'🇲🇼'},
  {code:'ML',name:'Mali',dial:'+223',flag:'🇲🇱'},{code:'MR',name:'Mauritanie',dial:'+222',flag:'🇲🇷'},
  {code:'MU',name:'Maurice',dial:'+230',flag:'🇲🇺'},{code:'MA',name:'Maroc',dial:'+212',flag:'🇲🇦'},
  {code:'MZ',name:'Mozambique',dial:'+258',flag:'🇲🇿'},{code:'NA',name:'Namibie',dial:'+264',flag:'🇳🇦'},
  {code:'NE',name:'Niger',dial:'+227',flag:'🇳🇪'},{code:'NG',name:'Nigeria',dial:'+234',flag:'🇳🇬'},
  {code:'RW',name:'Rwanda',dial:'+250',flag:'🇷🇼'},{code:'ST',name:'São Tomé',dial:'+239',flag:'🇸🇹'},
  {code:'SN',name:'Sénégal',dial:'+221',flag:'🇸🇳'},{code:'SL',name:'Sierra Leone',dial:'+232',flag:'🇸🇱'},
  {code:'SO',name:'Somalie',dial:'+252',flag:'🇸🇴'},{code:'ZA',name:'Afrique du Sud',dial:'+27',flag:'🇿🇦'},
  {code:'SS',name:'Soudan du Sud',dial:'+211',flag:'🇸🇸'},{code:'SD',name:'Soudan',dial:'+249',flag:'🇸🇩'},
  {code:'SZ',name:'Eswatini',dial:'+268',flag:'🇸🇿'},{code:'TZ',name:'Tanzanie',dial:'+255',flag:'🇹🇿'},
  {code:'TD',name:'Tchad',dial:'+235',flag:'🇹🇩'},{code:'TG',name:'Togo',dial:'+228',flag:'🇹🇬'},
  {code:'TN',name:'Tunisie',dial:'+216',flag:'🇹🇳'},{code:'UG',name:'Ouganda',dial:'+256',flag:'🇺🇬'},
  {code:'ZM',name:'Zambie',dial:'+260',flag:'🇿🇲'},{code:'ZW',name:'Zimbabwe',dial:'+263',flag:'🇿🇼'},
  {code:'FR',name:'France',dial:'+33',flag:'🇫🇷'},{code:'BE',name:'Belgique',dial:'+32',flag:'🇧🇪'},
  {code:'CH',name:'Suisse',dial:'+41',flag:'🇨🇭'},{code:'CA',name:'Canada',dial:'+1',flag:'🇨🇦'},
  {code:'US',name:'États-Unis',dial:'+1',flag:'🇺🇸'},{code:'GB',name:'Royaume-Uni',dial:'+44',flag:'🇬🇧'},
  {code:'DE',name:'Allemagne',dial:'+49',flag:'🇩🇪'},{code:'IT',name:'Italie',dial:'+39',flag:'🇮🇹'},
  {code:'ES',name:'Espagne',dial:'+34',flag:'🇪🇸'},{code:'PT',name:'Portugal',dial:'+351',flag:'🇵🇹'},
  {code:'NL',name:'Pays-Bas',dial:'+31',flag:'🇳🇱'},{code:'SE',name:'Suède',dial:'+46',flag:'🇸🇪'},
  {code:'NO',name:'Norvège',dial:'+47',flag:'🇳🇴'},{code:'DK',name:'Danemark',dial:'+45',flag:'🇩🇰'},
  {code:'FI',name:'Finlande',dial:'+358',flag:'🇫🇮'},{code:'PL',name:'Pologne',dial:'+48',flag:'🇵🇱'},
  {code:'RO',name:'Roumanie',dial:'+40',flag:'🇷🇴'},{code:'RU',name:'Russie',dial:'+7',flag:'🇷🇺'},
  {code:'UA',name:'Ukraine',dial:'+380',flag:'🇺🇦'},{code:'TR',name:'Turquie',dial:'+90',flag:'🇹🇷'},
  {code:'SA',name:'Arabie Saoudite',dial:'+966',flag:'🇸🇦'},{code:'AE',name:'Émirats arabes',dial:'+971',flag:'🇦🇪'},
  {code:'QA',name:'Qatar',dial:'+974',flag:'🇶🇦'},{code:'KW',name:'Koweït',dial:'+965',flag:'🇰🇼'},
  {code:'LB',name:'Liban',dial:'+961',flag:'🇱🇧'},{code:'JO',name:'Jordanie',dial:'+962',flag:'🇯🇴'},
  {code:'IQ',name:'Irak',dial:'+964',flag:'🇮🇶'},{code:'IR',name:'Iran',dial:'+98',flag:'🇮🇷'},
  {code:'IL',name:'Israël',dial:'+972',flag:'🇮🇱'},{code:'IN',name:'Inde',dial:'+91',flag:'🇮🇳'},
  {code:'PK',name:'Pakistan',dial:'+92',flag:'🇵🇰'},{code:'BD',name:'Bangladesh',dial:'+880',flag:'🇧🇩'},
  {code:'LK',name:'Sri Lanka',dial:'+94',flag:'🇱🇰'},{code:'NP',name:'Népal',dial:'+977',flag:'🇳🇵'},
  {code:'CN',name:'Chine',dial:'+86',flag:'🇨🇳'},{code:'JP',name:'Japon',dial:'+81',flag:'🇯🇵'},
  {code:'KR',name:'Corée du Sud',dial:'+82',flag:'🇰🇷'},{code:'TW',name:'Taïwan',dial:'+886',flag:'🇹🇼'},
  {code:'VN',name:'Vietnam',dial:'+84',flag:'🇻🇳'},{code:'TH',name:'Thaïlande',dial:'+66',flag:'🇹🇭'},
  {code:'MY',name:'Malaisie',dial:'+60',flag:'🇲🇾'},{code:'ID',name:'Indonésie',dial:'+62',flag:'🇮🇩'},
  {code:'PH',name:'Philippines',dial:'+63',flag:'🇵🇭'},{code:'SG',name:'Singapour',dial:'+65',flag:'🇸🇬'},
  {code:'AU',name:'Australie',dial:'+61',flag:'🇦🇺'},{code:'NZ',name:'Nouvelle-Zél.',dial:'+64',flag:'🇳🇿'},
  {code:'BR',name:'Brésil',dial:'+55',flag:'🇧🇷'},{code:'AR',name:'Argentine',dial:'+54',flag:'🇦🇷'},
  {code:'CL',name:'Chili',dial:'+56',flag:'🇨🇱'},{code:'CO',name:'Colombie',dial:'+57',flag:'🇨🇴'},
  {code:'PE',name:'Pérou',dial:'+51',flag:'🇵🇪'},{code:'VE',name:'Venezuela',dial:'+58',flag:'🇻🇪'},
  {code:'MX',name:'Mexique',dial:'+52',flag:'🇲🇽'},{code:'HT',name:'Haïti',dial:'+509',flag:'🇭🇹'},
].sort((a,b) => a.name.localeCompare(b.name, 'fr'));

function Spinner() {
  return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = session?.user?.backendToken ?? '';

  const [name,    setName]    = useState('');
  const [bio,     setBio]     = useState('');
  const [avatar,  setAvatar]  = useState('');
  const [phone,   setPhone]   = useState('');
  const [country, setCountry] = useState(COUNTRIES.find(c=>c.code==='CI') ?? COUNTRIES[0]);
  const [dialInput, setDialInput] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [search,  setSearch]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated' && !(session?.user as any)?.isNew) {
      router.replace('/chat');
    }
  }, [status, session]);

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dial.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image trop grande (max 5 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => { setAvatar(reader.result as string); setError(''); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleDialInput(val: string) {
    setDialInput(val);
    const cleaned = val.replace(/[^\d+]/g,'');
    const found = COUNTRIES.find(c => c.dial === cleaned || c.dial === '+'+cleaned);
    if (found) { setCountry(found); setDialInput(''); }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true); setError('');
    try {
      const fullPhone = phone ? `${country.dial}${phone.replace(/^0+/,'')}` : '';
      if (token) {
        const payload: Record<string,string> = { name: name.trim(), bio };
        if (avatar && !avatar.startsWith('data:')) payload.avatar = avatar;
        if (fullPhone) payload.phone = fullPhone;
        try { await api.users.update(token, payload); } catch(e:any) { console.warn('Backend save:', e.message); }
      }
      localStorage.setItem('oracle-profile', JSON.stringify({ name: name.trim(), bio, avatar, phone: `${country.dial}${phone}` }));
      router.replace('/chat');
    } catch(err:any) {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || status === 'loading') return <Spinner />;

  const initials = name?.[0]?.toUpperCase() ?? '?';

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header vert */}
      <div style={{ background:ACCENT, padding:'32px 24px 52px', textAlign:'center', position:'relative' }}>
        <p style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.7)', letterSpacing:1, textTransform:'uppercase', margin:'0 0 6px' }}>Bienvenue sur</p>
        <h1 style={{ fontSize:24, fontWeight:800, color:'#fff', margin:'0 0 4px' }}>Oracle Messenger</h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.8)', margin:0 }}>Complétez votre profil pour commencer</p>
      </div>

      {/* Avatar */}
      <div style={{ display:'flex', justifyContent:'center', marginTop:-48 }}>
        <label style={{ cursor:'pointer', position:'relative' }}>
          <div style={{ width:96, height:96, borderRadius:'50%', overflow:'hidden', background:'#e9edef', display:'flex', alignItems:'center', justifyContent:'center', border:'4px solid #fff', boxShadow:'0 4px 16px rgba(0,0,0,0.12)' }}>
            {avatar
              ? <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <span style={{ fontSize:40, fontWeight:700, color:'#8696a0' }}>{initials}</span>
            }
          </div>
          <div style={{ position:'absolute', bottom:2, right:2, width:30, height:30, borderRadius:'50%', background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
            <svg width="15" height="15" fill="#fff" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display:'none' }}/>
        </label>
      </div>
      <p style={{ textAlign:'center', fontSize:12, color:'#8696a0', margin:'8px 0 0' }}>Appuyez pour ajouter une photo</p>

      {/* Formulaire */}
      <div style={{ flex:1, padding:'20px 20px 32px', display:'flex', flexDirection:'column', gap:12, animation:'fadeUp 0.3s ease' }}>
        {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'10px 14px', color:'#dc2626', fontSize:13 }}>{error}</div>}

        {/* Nom */}
        <div style={{ background:'#f0f2f5', borderRadius:16, padding:'14px 16px' }}>
          <p style={{ fontSize:11, fontWeight:700, color:ACCENT, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.6 }}>Votre nom *</p>
          <input value={name} onChange={e=>{setName(e.target.value);setError('');}} maxLength={50} placeholder="Ex : Jean Dupont" autoFocus
            style={{ width:'100%', border:'none', outline:'none', fontSize:16, color:'#111b21', background:'transparent', padding:0 }}/>
        </div>

        {/* Bio */}
        <div style={{ background:'#f0f2f5', borderRadius:16, padding:'14px 16px' }}>
          <p style={{ fontSize:11, fontWeight:700, color:ACCENT, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.6 }}>Bio <span style={{ color:'#8696a0', fontWeight:400, textTransform:'none' }}>(optionnel)</span></p>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160} rows={2} placeholder="Dites quelque chose sur vous…"
            style={{ width:'100%', border:'none', outline:'none', fontSize:15, color:'#111b21', background:'transparent', resize:'none', padding:0, lineHeight:1.5 }}/>
          <p style={{ fontSize:11, color:'#8696a0', textAlign:'right', margin:'4px 0 0' }}>{bio.length}/160</p>
        </div>

        {/* Téléphone avec indicatif */}
        <div style={{ background:'#f0f2f5', borderRadius:16, padding:'14px 16px' }}>
          <p style={{ fontSize:11, fontWeight:700, color:ACCENT, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:0.6 }}>Numéro de téléphone <span style={{ color:'#8696a0', fontWeight:400, textTransform:'none' }}>(optionnel)</span></p>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* Sélecteur pays */}
            <button onClick={()=>setShowPicker(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 12px', background:'#fff', border:'1.5px solid #e9edef', borderRadius:12, cursor:'pointer', fontSize:14, fontWeight:600, color:'#111b21', flexShrink:0, whiteSpace:'nowrap' }}>
              <span style={{ fontSize:18 }}>{country.flag}</span>
              <span>{country.dial}</span>
              <svg width="12" height="12" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            {/* Numéro */}
            <input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/[^\d]/g,''))}
              placeholder="Numéro sans indicatif"
              style={{ flex:1, border:'none', outline:'none', fontSize:15, color:'#111b21', background:'transparent', padding:0 }}/>
          </div>
          {/* Saisie manuelle du code indicatif */}
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
            <p style={{ fontSize:11, color:'#8696a0', margin:0, flexShrink:0 }}>Code manuel :</p>
            <input value={dialInput} onChange={e=>handleDialInput(e.target.value)} placeholder="+225"
              style={{ width:80, padding:'6px 10px', background:'#fff', border:'1.5px solid #e9edef', borderRadius:8, fontSize:13, outline:'none', color:'#111b21' }}/>
            {dialInput && !COUNTRIES.find(c=>c.dial===dialInput||c.dial==='+'+dialInput) && (
              <p style={{ fontSize:11, color:'#dc2626', margin:0 }}>Code inconnu</p>
            )}
          </div>
        </div>

        <div style={{ flex:1 }}/>

        {/* Bouton */}
        <button onClick={handleSave} disabled={saving||!name.trim()}
          style={{ background:name.trim()?ACCENT:'#e9edef', color:name.trim()?'#fff':'#8696a0', border:'none', borderRadius:28, padding:'17px 24px', fontSize:16, fontWeight:700, cursor:name.trim()&&!saving?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:name.trim()?`0 4px 16px ${ACCENT}44`:'none' }}>
          {saving
            ? <div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            : 'Commencer à discuter →'
          }
        </button>
        <button onClick={()=>router.replace('/chat')}
          style={{ background:'none', border:'none', color:'#8696a0', fontSize:14, cursor:'pointer', padding:'8px', textDecoration:'underline' }}>
          Passer pour l'instant
        </button>
      </div>

      {/* Country picker */}
      {showPicker && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end' }}
          onClick={e=>{if(e.target===e.currentTarget){setShowPicker(false);setSearch('');}}}>
          <div style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px 8px', display:'flex', alignItems:'center', gap:12 }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un pays ou code…"
                style={{ flex:1, padding:'10px 14px', background:'#f0f2f5', border:'none', borderRadius:20, fontSize:14, outline:'none' }} autoFocus/>
              <button onClick={()=>{setShowPicker(false);setSearch('');}}
                style={{ border:'none', background:'none', fontSize:20, cursor:'pointer', color:'#8696a0' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.map(c=>(
                <button key={c.code} onClick={()=>{setCountry(c);setShowPicker(false);setSearch('');}}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'12px 20px', border:'none', background:c.code===country.code?'#f0fdf4':'transparent', cursor:'pointer', textAlign:'left' }}>
                  <span style={{ fontSize:22 }}>{c.flag}</span>
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
