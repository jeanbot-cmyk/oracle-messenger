// Page d'erreur personnalisée — remplace le _error par défaut de Next.js
// Nécessaire pour éviter le conflit next-auth v4 + App Router
function Error({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0e1a', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold', color: '#3b82f6' }}>{statusCode ?? 'Erreur'}</h1>
      <p style={{ color: '#64748b', marginTop: '1rem' }}>Une erreur est survenue</p>
      <a href="/chat" style={{ color: '#3b82f6', marginTop: '1rem', textDecoration: 'none' }}>Retour à l'accueil</a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: any) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
