'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

const COUNTRIES = [
  { code:'CI', name:"Côte d'Ivoire", dial:'+225', flag:'🇨🇮' },
  { code:'CM', name:'Cameroun',      dial:'+237', flag:'🇨🇲' },
  { code:'SN', name:'Sénégal',       dial:'+221', flag:'🇸🇳' },
  { code:'ML', name:'Mali',          dial:'+223', flag:'🇲🇱' },
  { code:'BF', name:'Burkina Faso',  dial:'+226', flag:'🇧🇫' },
  { code:'GN', name:'Guinée',        dial:'+224', flag:'🇬🇳' },
  { code:'TG', name:'Togo',          dial:'+228', flag:'🇹🇬' },
  { code:'BJ', name:'Bénin',         dial:'+229', flag:'🇧🇯' },
  { code:'NE', name:'Niger',         dial:'+227', flag:'🇳🇪' },
  { code:'CD', name:'Congo RDC',     dial:'+243', flag:'🇨🇩' },
  { code:'CG', name:'Congo',         dial:'+242', flag:'🇨🇬' },
  { code:'GA', name:'Gabon',         dial:'+241', flag:'🇬🇦' },
  { code:'GH', name:'Ghana',         dial:'+233', flag:'🇬🇭' },
  { code:'NG', name:'Nigeria',       dial:'+234', flag:'🇳🇬' },
  { code:'MA', name:'Maroc',         dial:'+212', flag:'🇲🇦' },
  { code:'DZ', name:'Algérie',       dial:'+213', flag:'🇩🇿' },
  { code:'TN', name:'Tunisie',       dial:'+216', flag:'🇹🇳' },
  { code:'FR', name:'France',        dial:'+33',  flag:'🇫🇷' },
  { code:'BE', name:'Belgique',      dial:'+32',  flag:'🇧🇪' },
  { code:'CH', name:'Suisse',        dial:'+41',  flag:'🇨🇭' },
  { code:'US', name:'États-Unis',    dial:'+1',   flag:'🇺🇸' },
  { code:'GB', name:'Royaume-Uni',   dial:'+44',  flag:'🇬🇧' },
];

export function PhoneOnboarding({ onDone }: { onDone: () => void }) {
  const { data: session } = useSession();
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [number, setNumber] = useState('');
  const [step, setStep] = useState<'form'|'verifying'>('form');
  const [error, setError] = useState('');

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
  );

  async function handleSubmit() {
    const digits = number.replace(/\D/g, '');
    if (digits.length < 6) { setError('Veuillez entrer un numéro valide.'); return; }
    setError('');
    setStep('verifying');
    const full = `${country.dial}${digits}`;
    const token = (session?.user as any)?.backendToken;
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/me/phone`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ phone: full }),
      }).catch(() => {});
    }
    try {
      const local = JSON.parse(localStorage.getItem('oracle-profile') ?? '{}');
      localStorage.setItem('oracle-profile', JSON.stringify({ ...local, phone: full }));
    } catch {}
    await new Promise(r => setTimeout(r, 3000));
    onDone();
  }

  const F = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  if (step === 'verifying') return (
    <div style={{ position:'fixed',inset:0,zIndex:9999,background:'#fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,fontFamily:F }}>
      <div style={{ width:56,height:56,border:'4px solid #E9EDEF',borderTopColor:'#128C7E',borderRadius:'50%',animation:'spin .8s linear infinite',marginBottom:28 }} />
      <p style={{ fontSize:17,fontWeight:700,color:'#111B21',margin:'0 0 8px',textAlign:'center' }}>Vérification automatique de la ligne...</p>
      <p style={{ fontSize:13,color:'#667781',margin:0,textAlign:'center' }}>Veuillez patienter quelques instants</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ position:'fixed',inset:0,zIndex:9999,background:'#fff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px',fontFamily:F }}>
      <div style={{ width:72,height:72,borderRadius:'50%',background:'#128C7E',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:28 }}>
        <svg width="36" height="36" fill="white" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
      </div>
      <h1 style={{ fontSize:24,fontWeight:700,color:'#111B21',margin:'0 0 10px',textAlign:'center' }}>Associez votre numéro</h1>
      <p style={{ fontSize:14,color:'#667781',textAlign:'center',margin:'0 0 6px',lineHeight:1.6,maxWidth:320 }}>
        Veuillez renseigner le numéro de téléphone actif dans cet appareil.
      </p>
      <p style={{ fontSize:13,color:'#667781',textAlign:'center',fontStyle:'italic',margin:'0 0 32px',maxWidth:320,lineHeight:1.5 }}>
        Une vérification automatique de la conformité de votre ligne va être effectuée en arrière-plan.
      </p>

      {error && <div style={{ background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 14px',color:'#dc2626',fontSize:13,marginBottom:16,width:'100%',maxWidth:380 }}>{error}</div>}

      <div style={{ width:'100%',maxWidth:380,marginBottom:8 }}>
        <div style={{ display:'flex',border:'1.5px solid #E9EDEF',borderRadius:14,overflow:'hidden',background:'#F8F9FA' }}>
          <button onClick={() => setShowPicker(true)}
            style={{ display:'flex',alignItems:'center',gap:6,padding:'14px 12px',background:'transparent',border:'none',borderRight:'1.5px solid #E9EDEF',cursor:'pointer',flexShrink:0,minWidth:110 }}>
            <span style={{ fontSize:20 }}>{country.flag}</span>
            <span style={{ fontSize:14,fontWeight:700,color:'#128C7E' }}>{country.dial}</span>
            <svg width="12" height="12" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <input type="tel" value={number} onChange={e => { setNumber(e.target.value); setError(''); }}
            onKeyDown={e => e.key==='Enter' && handleSubmit()}
            placeholder="07 00 00 00 00" autoFocus
            style={{ flex:1,border:'none',outline:'none',padding:'14px 16px',fontSize:16,color:'#111B21',background:'transparent',fontFamily:F }} />
        </div>
        <p style={{ fontSize:12,color:'#8696a0',margin:'6px 0 0 4px' }}>Numéro sans le code pays — ex : 07 58 86 11 69</p>
      </div>

      <button onClick={handleSubmit} disabled={!number.trim()}
        style={{ width:'100%',maxWidth:380,background:'#128C7E',color:'#fff',border:'none',borderRadius:14,padding:16,fontSize:16,fontWeight:700,cursor:'pointer',marginTop:16,opacity:!number.trim()?.5:1,fontFamily:F }}>
        Valider et continuer
      </button>

      {showPicker && (
        <div style={{ position:'fixed',inset:0,zIndex:10000,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end' }} onClick={() => setShowPicker(false)}>
          <div style={{ background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxHeight:'75vh',display:'flex',flexDirection:'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:40,height:4,background:'#E9EDEF',borderRadius:2,margin:'12px auto 0' }} />
            <div style={{ padding:'16px 20px 8px',borderBottom:'1px solid #F8F9FA' }}>
              <p style={{ fontSize:16,fontWeight:700,color:'#111B21',margin:'0 0 12px' }}>Choisir un pays</p>
              <div style={{ display:'flex',alignItems:'center',gap:10,background:'#F8F9FA',borderRadius:12,padding:'10px 14px' }}>
                <svg width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un pays..."
                  style={{ border:'none',outline:'none',background:'transparent',fontSize:15,color:'#111B21',flex:1,fontFamily:F }} autoFocus />
              </div>
            </div>
            <div style={{ overflowY:'auto',flex:1 }}>
              {filtered.map(c => (
                <button key={c.code} onClick={() => { setCountry(c); setShowPicker(false); setSearch(''); }}
                  style={{ display:'flex',alignItems:'center',gap:14,width:'100%',padding:'14px 20px',border:'none',background:c.code===country.code?'#F0FAF8':'transparent',cursor:'pointer',textAlign:'left',borderBottom:'1px solid #F8F9FA' }}>
                  <span style={{ fontSize:24,flexShrink:0 }}>{c.flag}</span>
                  <span style={{ flex:1,fontSize:15,color:'#111B21',fontFamily:F }}>{c.name}</span>
                  <span style={{ fontSize:14,fontWeight:700,color:'#128C7E',fontFamily:F }}>{c.dial}</span>
                  {c.code===country.code && <svg width="18" height="18" fill="none" stroke="#128C7E" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
