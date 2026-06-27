export const dynamic = 'force-dynamic';
export default function NotFound() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-app)', gap:16 }}>
      <h1 style={{ fontSize:64, fontWeight:700, color:'var(--accent)' }}>404</h1>
      <p style={{ color:'var(--text-muted)' }}>Page introuvable</p>
      <a href="/chat" style={{ color:'var(--accent)', fontSize:14 }}>Retour à l&apos;accueil</a>
    </div>
  );
}
