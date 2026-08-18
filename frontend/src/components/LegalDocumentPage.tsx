'use client';

import { useRouter } from 'next/navigation';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS, type LegalDocumentId } from '../lib/legalDocuments';

const DEEP = 'var(--header-bg)';
const GOLD = 'var(--accent)';

export function LegalDocumentPage({ documentId }: { documentId: LegalDocumentId }) {
  const router = useRouter();
  const document = LEGAL_DOCUMENTS[documentId];

  return (
    <main style={{ minHeight: '100dvh', background: '#F5F1EA', color: 'var(--text-primary)', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <header style={{ background: DEEP, color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 2 }}>
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.08)', color: '#fff', cursor: 'pointer', fontSize: 18 }}
        >
          ←
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.15, fontWeight: 850 }}>{document.title}</h1>
          <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,.72)', fontSize: 12.5, lineHeight: 1.35 }}>
            Oracle Messenger · Version {document.version} · Derniere mise a jour : {document.updatedAt}
          </p>
        </div>
      </header>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '24px 18px 44px', lineHeight: 1.65 }}>
        <article style={{ background: '#FFFDF7', border: '1px solid rgba(16,42,42,.10)', borderRadius: 18, padding: 20, boxShadow: '0 1px 8px rgba(0,0,0,.07)' }}>
          <p style={{ margin: 0, color: DEEP, fontSize: 17, lineHeight: 1.45, fontWeight: 850 }}>{document.subtitle}</p>
          <p style={{ color: 'var(--text-muted)', margin: '10px 0 0', fontSize: 14 }}>{document.summary}</p>
          <div style={{ marginTop: 14, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '10px 12px', color: '#9A3412', fontSize: 13, fontWeight: 750 }}>
            Ce document reflete l'architecture auditee. Les points juridiques specifiques doivent etre valides par un conseil competent avant publication definitive.
          </div>
        </article>

        <nav aria-label="Sommaire" style={{ marginTop: 16, background: '#FFFFFF', border: '1px solid rgba(16,42,42,.10)', borderRadius: 18, padding: 18 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, color: DEEP }}>Sommaire</h2>
          <div style={{ display: 'grid', gap: 7 }}>
            {document.sections.map(section => (
              <a key={section.id} href={`#${section.id}`} style={{ color: DEEP, textDecoration: 'none', fontSize: 13.5, fontWeight: 750 }}>
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
          {document.sections.map(section => (
            <section key={section.id} id={section.id} style={{ scrollMarginTop: 96, background: '#FFFFFF', border: '1px solid rgba(16,42,42,.10)', borderRadius: 18, padding: 18 }}>
              <h2 style={{ margin: '0 0 10px', color: DEEP, fontSize: 17, lineHeight: 1.25 }}>{section.title}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} style={{ margin: index === section.body.length - 1 ? 0 : '0 0 10px', color: 'var(--text-primary)', fontSize: 14.5 }}>
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div style={{ marginTop: 16, background: '#EAF4F1', border: '1px solid rgba(16,42,42,.10)', borderRadius: 18, padding: 18 }}>
          <p style={{ margin: '0 0 4px', color: DEEP, fontWeight: 900 }}>Contact officiel</p>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: DEEP, fontWeight: 850, textDecoration: 'underline' }}>
            {LEGAL_CONTACT_EMAIL}
          </a>
        </div>

        <button
          onClick={() => router.back()}
          style={{ marginTop: 18, background: GOLD, color: DEEP, border: 'none', borderRadius: 24, padding: '12px 20px', fontWeight: 850, cursor: 'pointer' }}
        >
          Retour
        </button>
      </section>
    </main>
  );
}
