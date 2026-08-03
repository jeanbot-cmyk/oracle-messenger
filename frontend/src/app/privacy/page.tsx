'use client';

import { useRouter } from 'next/navigation';

const DEEP = 'var(--header-bg)';
const GOLD = 'var(--accent)';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <main style={{ minHeight:'100dvh', background:'#F5F1EA', color:'var(--text-primary)', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <header style={{ background:DEEP, color:'#fff', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} aria-label="Retour"
          style={{ width:36, height:36, borderRadius:'50%', border:'1px solid rgba(255,255,255,.16)', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer', fontSize:18 }}>
          ←
        </button>
        <div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800 }}>Politique de confidentialité</h1>
          <p style={{ margin:'2px 0 0', color:'rgba(255,255,255,.72)', fontSize:13 }}>Oracle Messenger</p>
        </div>
      </header>

      <section style={{ maxWidth:760, margin:'0 auto', padding:'24px 18px 40px', lineHeight:1.65 }}>
        <div style={{ background:'#FFFDF7', border:'1px solid rgba(16,42,42,.10)', borderRadius:16, padding:20, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
          <p style={{ marginTop:0 }}>Oracle Messenger utilise votre numéro de téléphone pour vérifier votre compte et vous connecter à vos conversations.</p>
          <p>Vos contacts peuvent être utilisés pour retrouver les personnes qui utilisent déjà l'application, uniquement lorsque vous lancez l'import.</p>
          <p>Les messages, appels, médias, notifications et informations de profil sont traités pour faire fonctionner la messagerie et synchroniser votre expérience.</p>
          <p>Les notifications push servent à vous prévenir des nouveaux messages et événements importants.</p>
          <p style={{ marginBottom:0, color:DEEP, fontWeight:700 }}>Vous pouvez demander la correction ou la suppression de vos informations auprès de l'administrateur Oracle Messenger.</p>
        </div>
        <button onClick={() => router.back()}
          style={{ marginTop:18, background:GOLD, color:DEEP, border:'none', borderRadius:24, padding:'12px 20px', fontWeight:800, cursor:'pointer' }}>
          Retour
        </button>
      </section>
    </main>
  );
}
