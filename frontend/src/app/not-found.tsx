export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-oracle-night text-white gap-4">
      <h1 className="text-6xl font-bold text-oracle-accent">404</h1>
      <p className="text-oracle-muted">Page introuvable</p>
      <a href="/chat" className="text-oracle-accent hover:underline text-sm">Retour à l'accueil</a>
    </div>
  );
}
