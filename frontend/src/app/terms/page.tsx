'use client';

import { useRouter } from 'next/navigation';

const DEEP = 'var(--header-bg)';
const GOLD = 'var(--accent)';

export default function TermsPage() {
  const router = useRouter();

  return (
    <main style={{ minHeight:'100dvh', background:'#F5F1EA', color:'var(--text-primary)', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <header style={{ background:DEEP, color:'#fff', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} aria-label="Retour"
          style={{ width:36, height:36, borderRadius:'50%', border:'1px solid rgba(255,255,255,.16)', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer', fontSize:18 }}>
          ←
        </button>
        <div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800 }}>Conditions d'utilisation</h1>
          <p style={{ margin:'2px 0 0', color:'rgba(255,255,255,.72)', fontSize:13 }}>Oracle Messenger</p>
        </div>
      </header>

      <section style={{ maxWidth:760, margin:'0 auto', padding:'24px 18px 40px', lineHeight:1.65 }}>
        <div style={{ background:'#FFFDF7', border:'1px solid rgba(16,42,42,.10)', borderRadius:16, padding:20, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
          <p style={{ marginTop:0 }}>En utilisant Oracle Messenger, vous acceptez d'utiliser l'application de manière responsable et respectueuse.</p>
          <p>Vous restez responsable des messages, médias et informations que vous partagez avec vos contacts.</p>
          <p>Il est interdit d'utiliser Oracle Messenger pour harceler, menacer, usurper une identité, diffuser des contenus illégaux ou porter atteinte aux droits d'autrui.</p>
          <p>Le service peut évoluer pour améliorer la sécurité, la stabilité et les fonctionnalités de l'application.</p>
          <p style={{ marginBottom:0, color:DEEP, fontWeight:700 }}>Pour toute question, contactez l'administrateur Oracle Messenger depuis l'application.</p>
        </div>
        <button onClick={() => router.back()}
          style={{ marginTop:18, background:GOLD, color:DEEP, border:'none', borderRadius:24, padding:'12px 20px', fontWeight:800, cursor:'pointer' }}>
          Retour
        </button>
      </section>
    </main>
  );
}
