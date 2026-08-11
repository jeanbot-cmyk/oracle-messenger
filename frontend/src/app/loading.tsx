export default function Loading() {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)', color:'var(--text-primary)' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <div style={{ width:34, height:34, border:'3px solid var(--border)', borderTopColor:'var(--brand)', borderRadius:'50%', animation:'spin .75s linear infinite' }} />
        <p style={{ margin:0, fontSize:13, fontWeight:800, color:'var(--text-muted)' }}>Ouverture...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
