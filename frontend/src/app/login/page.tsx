'use client';
export const dynamic = 'force-dynamic';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  APP_BUILD_LABEL,
  BACKEND_URL,
  GOOGLE_ANDROID_APK_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_ANDROID_UPLOAD_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '../../lib/config';

const ACCENT = 'var(--accent)';
const DEEP = 'var(--header-bg)';

function isAndroidAppRuntime(Capacitor?: any) {
  if (typeof window === 'undefined') return false;
  const windowCapacitor = (window as any).Capacitor;
  const nativeCapacitor = Capacitor?.isNativePlatform?.() === true ||
    windowCapacitor?.isNativePlatform?.() === true;
  const platform = Capacitor?.getPlatform?.() || windowCapacitor?.getPlatform?.();
  const search = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent.toLowerCase();
  const nativeBuild = localStorage.getItem('oracle-native-build') ||
    sessionStorage.getItem('oracle-native-build') ||
    search.get('nativeBuild');
  return nativeCapacitor ||
    platform === 'android' ||
    Boolean((window as any).OracleAndroid) ||
    Boolean((window as any).__ORACLE_NATIVE_ANDROID) ||
    Boolean(nativeBuild) ||
    ua.includes('oraclemessengernative') ||
    document.referrer.startsWith('android-app://') ||
    ua.includes('; wv');
}

function readNativeDiagnostics() {
  try {
    const raw = (window as any).OracleAndroid?.getNativeDiagnostics?.();
    const fallback = localStorage.getItem('oracle-native-diagnostics') || sessionStorage.getItem('oracle-native-diagnostics') || '';
    if (!raw && !fallback) return '';
    const parsed = JSON.parse(raw || fallback);
    const googleClient = localStorage.getItem('oracle-last-google-client') || '';
    return [
      parsed.versionCode ? `versionCode ${parsed.versionCode}` : '',
      parsed.packageName ? `package ${parsed.packageName}` : '',
      parsed.sha1 ? `SHA-1 ${parsed.sha1}` : '',
      googleClient ? `client ${googleClient}` : '',
    ].filter(Boolean).join(' • ');
  } catch {
    return '';
  }
}

function readCompactNativeDiagnostics() {
  try {
    const raw = (window as any).OracleAndroid?.getNativeDiagnostics?.() ||
      localStorage.getItem('oracle-native-diagnostics') ||
      sessionStorage.getItem('oracle-native-diagnostics') ||
      '';
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return [
      parsed.versionCode ? `versionCode ${parsed.versionCode}` : '',
      parsed.packageName ? `package ${parsed.packageName}` : '',
      parsed.sha1 ? `SHA-1 ${parsed.sha1}` : '',
    ].filter(Boolean).join(' • ');
  } catch {
    return '';
  }
}

function getNativeDiagnosticPayload() {
  try {
    const raw = (window as any).OracleAndroid?.getNativeDiagnostics?.() ||
      localStorage.getItem('oracle-native-diagnostics') ||
      sessionStorage.getItem('oracle-native-diagnostics') ||
      '';
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeSha(value: string) {
  return String(value || '').replace(/[^a-f0-9]/gi, '').toUpperCase();
}

function nativeClientCandidates() {
  const diagnostics = getNativeDiagnosticPayload();
  const sha = normalizeSha(diagnostics?.sha1 || '');
  const playSha = normalizeSha('CD:B2:27:20:D6:FB:57:28:A9:0A:33:27:FD:27:6B:28:3D:32:A1:78');
  const uploadSha = normalizeSha('C7:80:36:3E:B0:30:96:6E:B7:9D:0B:8A:DA:64:62:3E:9A:C1:D2:C8');
  const apkSha = normalizeSha('F2:C2:57:2B:6C:E4:C7:3D:3F:25:7B:71:99:05:75:A9:2A:8B:FB:D1');
  const preferred =
    sha === playSha ? { clientId: GOOGLE_ANDROID_CLIENT_ID, label: 'android-play' } :
    sha === uploadSha ? { clientId: GOOGLE_ANDROID_UPLOAD_CLIENT_ID, label: 'android-upload' } :
    sha === apkSha ? { clientId: GOOGLE_ANDROID_APK_CLIENT_ID, label: 'android-apk' } :
    null;
  const candidates = [
    preferred,
    { clientId: GOOGLE_WEB_CLIENT_ID, label: 'web' },
    { clientId: GOOGLE_ANDROID_CLIENT_ID, label: 'android-play' },
    { clientId: GOOGLE_ANDROID_APK_CLIENT_ID, label: 'android-apk' },
    { clientId: GOOGLE_ANDROID_UPLOAD_CLIENT_ID, label: 'android-upload' },
  ].filter(Boolean) as Array<{ clientId: string; label: string }>;
  const seen = new Set<string>();
  return candidates.filter(item => {
    if (!item.clientId || seen.has(item.clientId)) return false;
    seen.add(item.clientId);
    return true;
  });
}

async function nativeGoogleSignInWithClient(clientId: string, label: string) {
  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
  localStorage.setItem('oracle-last-google-client', label);
  await GoogleAuth.initialize({
    clientId,
    scopes: ['profile', 'email'],
    grantOfflineAccess: false,
  });
  return GoogleAuth.signIn();
}

async function postNativeGoogleUser(googleUser: any) {
  const idToken = googleUser?.authentication?.idToken;
  if (!idToken) throw new Error('missing_google_token');

  const res = await fetch(`${BACKEND_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      googleId: googleUser.id,
      email: googleUser.email ?? '',
      name: googleUser.name ?? '',
      avatar: googleUser.imageUrl ?? '',
    }),
  });
  if (!res.ok) throw new Error('backend_google_rejected');
  const data = await res.json();
  if (!data?.token) throw new Error('missing_backend_token');
  return data;
}

function googleErrorDetail(error: unknown) {
  const nativeFailure = error as { message?: string; code?: string | number };
  return [
    nativeFailure?.code,
    nativeFailure?.message,
    error instanceof Error ? error.message : String(error || ''),
  ].filter(Boolean).join(' ');
}

function Spinner() {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recovery, setRecovery] = useState<{ found: boolean; name?: string; emailHint?: string; message: string } | null>(null);
  const [policiesAccepted, setPoliciesAccepted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    const authError = params.get('error');
    if (from) {
      const next = `/contacts?from=${encodeURIComponent(from)}`;
      sessionStorage.setItem('oracle-after-login', next);
      localStorage.setItem('oracle-after-login', next);
    }
    if (authError) {
      setError(
        authError === 'native_session'
          ? 'La session Google n’a pas été transmise à Oracle Messenger. Réessayez avec Google.'
          : 'Connexion Google interrompue. Réessayez avec une connexion stable.',
      );
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const afterLogin = sessionStorage.getItem('oracle-after-login') || localStorage.getItem('oracle-after-login');
    if (afterLogin) {
      sessionStorage.removeItem('oracle-after-login');
      localStorage.removeItem('oracle-after-login');
      router.replace(afterLogin);
      return;
    }
    router.replace((session?.user as any)?.isNew ? '/onboarding' : '/chat');
  }, [status, session, router]);

  async function handleGoogleLogin() {
    if (!policiesAccepted) {
      setError('Veuillez lire et approuver les conditions avant de continuer avec Google.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { Capacitor } = await import('@capacitor/core');
      const shouldUseNativeGoogle = isAndroidAppRuntime(Capacitor);
      if (shouldUseNativeGoogle) {
        let lastNativeError: unknown = null;
        try {
          let data: any = null;
          for (const candidate of nativeClientCandidates()) {
            try {
              const googleUser = await nativeGoogleSignInWithClient(candidate.clientId, candidate.label);
              data = await postNativeGoogleUser(googleUser);
              break;
            } catch (candidateError) {
              lastNativeError = candidateError;
              const detail = googleErrorDetail(candidateError);
              if (detail.includes('12501')) throw candidateError;
              if (!detail.includes('10') && !detail.includes('backend_google_rejected') && !detail.includes('missing_google_token')) {
                throw candidateError;
              }
            }
          }
          if (!data?.token) throw lastNativeError || new Error('native_google_failed');

          const result = await signIn('native-token', { token: data.token, redirect: false });
          if (!result?.ok) throw new Error('native_session_failed');
          router.replace(data.user?.phone ? '/chat' : '/onboarding');
          return;
        } catch (nativeError) {
          console.warn('[Oracle Messenger] Native Google login failed.', nativeError);
          const detail = googleErrorDetail(lastNativeError || nativeError);
          if (detail.includes('10')) {
            const diagnostics = readNativeDiagnostics();
            setError(
              "Google Android refuse la signature de cette version. Vérifiez que l'OAuth Android contient le package et le SHA du build installé." +
              (diagnostics ? ` Diagnostic: ${diagnostics}` : ' Diagnostic indisponible: bridge natif non détecté.'),
            );
            setLoading(false);
            return;
          }
          setError(
            detail.includes('12501')
              ? 'Connexion Google annulée.'
              : "Connexion Google Android impossible pour cette version. Vérifiez la configuration Google, puis réessayez." +
                (readCompactNativeDiagnostics() ? ` Diagnostic: ${readCompactNativeDiagnostics()}` : ''),
          );
          setLoading(false);
          return;
        }
      }
      await signIn('google', { callbackUrl: '/login' });
    } catch {
      setError('Connexion Google impossible. Vérifiez votre connexion puis réessayez.');
      setLoading(false);
    }
  }

  async function handleRecoverPhone() {
    if (!phone.trim()) {
      setRecovery({ found: false, message: 'Entrez votre numéro avec indicatif, puis réessayez.' });
      return;
    }
    setRecovering(true);
    setRecovery(null);
    setError('');
    try {
      const result = await api.auth.recoverByPhone(phone.trim());
      setRecovery(result);
    } catch {
      setRecovery({ found: false, message: 'Vérification impossible maintenant. Réessayez avec une connexion stable.' });
    } finally {
      setRecovering(false);
    }
  }

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', boxSizing:'border-box', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <img
        src="/icons/icon-192-v20260809-premium.png"
        alt=""
        style={{ width:92, height:92, borderRadius:26, marginBottom:18, boxShadow:'0 14px 34px rgba(16,42,42,0.18)' }}
      />

      <h1 style={{ fontSize:26, fontWeight:800, color:'var(--text-primary)', margin:'0 0 6px', textAlign:'center' }}>Oracle Messenger</h1>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 24px', textAlign:'center', maxWidth:340, lineHeight:1.5 }}>
        est votre nouvelle application de messagerie, d’appels, de suivi d’entreprise et de création de contenus avec l’IA : vidéos IA et images IA.
        <br /><br />Pour continuer, cliquez sur Google et inscrivez-vous.
      </p>

      {error && (
        <div style={{ width:'100%', maxWidth:360, margin:'0 0 14px', padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, color:'#dc2626', fontSize:13, textAlign:'center' }}>
          {error}
        </div>
      )}

      <button onClick={handleGoogleLogin} disabled={loading}
        style={{ width:'100%', maxWidth:360, background:DEEP, color:'#fff', border:'none', borderRadius:28, padding:'16px 22px', fontSize:16, fontWeight:800, cursor:loading?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:12, boxShadow:'0 8px 22px rgba(16,42,42,0.22)' }}>
        {loading ? (
          <div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        ) : (
          <>
            <span style={{ width:24, height:24, borderRadius:'50%', background:'#fff', color:'var(--text-primary)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:900 }}>G</span>
            Continuer avec Google
          </>
        )}
      </button>

      <label style={{ width:'100%', maxWidth:360, marginTop:10, display:'flex', alignItems:'flex-start', gap:10, color:'var(--text-muted)', fontSize:11.5, lineHeight:1.45, fontWeight:650, cursor:'pointer', userSelect:'none' }}>
        <input
          type="checkbox"
          checked={policiesAccepted}
          onChange={event => {
            setPoliciesAccepted(event.target.checked);
            if (event.target.checked) setError('');
          }}
          style={{ width:18, height:18, margin:'1px 0 0', accentColor:DEEP, flex:'0 0 auto' }}
        />
        <span>
          J’ai lu et j’approuve les{' '}
          <a href="/terms" style={{ color:DEEP, fontWeight:850, textDecoration:'underline' }}>conditions</a>
          {' '}et la{' '}
          <a href="/privacy" style={{ color:DEEP, fontWeight:850, textDecoration:'underline' }}>politique de confidentialité</a>
          {', '}
          <a href="/data" style={{ color:DEEP, fontWeight:850, textDecoration:'underline' }}>politique des données</a>.
        </span>
      </label>

      <div style={{ width:'100%', maxWidth:360, marginTop:18, border:'1px solid var(--border)', borderRadius:18, padding:14, background:'#F8FAFC', boxSizing:'border-box' }}>
        <p style={{ margin:'0 0 5px', fontSize:14, fontWeight:900, color:'var(--text-primary)' }}>Retrouver mon compte</p>
        <p style={{ margin:'0 0 10px', fontSize:12.5, lineHeight:1.45, color:'var(--text-muted)', fontWeight:650 }}>
          Entrez votre numéro. Si ce numéro est lié à un compte, Oracle affiche le Gmail masqué à utiliser.
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+225 07..."
            inputMode="tel"
            style={{ flex:1, minWidth:0, border:'1px solid var(--border)', borderRadius:14, padding:'11px 12px', fontSize:14, outline:'none', color:'var(--text-primary)', background:'#fff', boxSizing:'border-box' }}
          />
          <button
            onClick={handleRecoverPhone}
            disabled={recovering}
            style={{ border:'none', borderRadius:14, padding:'0 13px', minWidth:86, background:DEEP, color:'#fff', fontSize:13, fontWeight:900, cursor:recovering?'default':'pointer', opacity:recovering ? .7 : 1 }}
          >
            {recovering ? '...' : 'Vérifier'}
          </button>
        </div>
        {recovery && (
          <div style={{ marginTop:10, borderRadius:12, padding:'10px 11px', background:recovery.found ? '#ECFDF5' : '#FEF2F2', border:`1px solid ${recovery.found ? '#BBF7D0' : '#FECACA'}` }}>
            {recovery.found && recovery.emailHint && (
              <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:900, color:'#065F46' }}>
                Gmail associé : {recovery.emailHint}
              </p>
            )}
            <p style={{ margin:0, fontSize:12.5, lineHeight:1.45, color:recovery.found ? '#047857' : '#B91C1C', fontWeight:700 }}>
              {recovery.message}
            </p>
          </div>
        )}
      </div>

      <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', lineHeight:1.6, maxWidth:320, margin:'22px 0 0' }}>
        Le numéro aide à retrouver le bon compte Google. La connexion reste protégée par Google.
      </p>
      <p style={{ fontSize:10, color:'#94A3B8', textAlign:'center', margin:'8px 0 0' }}>
        Build {APP_BUILD_LABEL}
      </p>
    </div>
  );
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <Spinner />;
  return <LoginContent />;
}
