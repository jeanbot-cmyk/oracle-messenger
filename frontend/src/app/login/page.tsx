'use client';
export const dynamic = 'force-dynamic';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { firebaseAuth } from '../../lib/firebase';

const ACCENT = '#00a884';
const BASE   = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const ALL_COUNTRIES = [
  { code:'CI', name:"Côte d'Ivoire", dial:'+225', flag:'🇨🇮' },
  { code:'CM', name:'Cameroun',      dial:'+237', flag:'🇨🇲' },
  { code:'SN', name:'Sénégal',       dial:'+221', flag:'🇸🇳' },
  { code:'ML', name:'Mali',          dial:'+223', flag:'🇲🇱' },
  { code:'BF', name:'Burkina Faso',  dial:'+226', flag:'🇧🇫' },
  { code:'GN', name:'Guinée',        dial:'+224', flag:'🇬🇳' },
  { code:'BJ', name:'Bénin',         dial:'+229', flag:'🇧🇯' },
  { code:'TG', name:'Togo',          dial:'+228', flag:'🇹🇬' },
  { code:'NE', name:'Niger',         dial:'+227', flag:'🇳🇪' },
  { code:'CD', name:'Congo RDC',     dial:'+243', flag:'🇨🇩' },
  { code:'CG', name:'Congo',         dial:'+242', flag:'🇨🇬' },
  { code:'GA', name:'Gabon',         dial:'+241', flag:'🇬🇦' },
  { code:'GH', name:'Ghana',         dial:'+233', flag:'🇬🇭' },
  { code:'NG', name:'Nigeria',       dial:'+234', flag:'🇳🇬' },
  { code:'MA', name:'Maroc',         dial:'+212', flag:'🇲🇦' },
  { code:'DZ', name:'Algérie',       dial:'+213', flag:'🇩🇿' },
  { code:'TN', name:'Tunisie',       dial:'+216', flag:'🇹🇳' },
  { code:'EG', name:'Égypte',        dial:'+20',  flag:'🇪🇬' },
  { code:'FR', name:'France',        dial:'+33',  flag:'🇫🇷' },
  { code:'BE', name:'Belgique',      dial:'+32',  flag:'🇧🇪' },
  { code:'CH', name:'Suisse',        dial:'+41',  flag:'🇨🇭' },
  { code:'US', name:'États-Unis',    dial:'+1',   flag:'🇺🇸' },
  { code:'GB', name:'Royaume-Uni',   dial:'+44',  flag:'🇬🇧' },
  { code:'DE', name:'Allemagne',     dial:'+49',  flag:'🇩🇪' },
  { code:'IT', name:'Italie',        dial:'+39',  flag:'🇮🇹' },
  { code:'ES', name:'Espagne',       dial:'+34',  flag:'🇪🇸' },
  { code:'PT', name:'Portugal',      dial:'+351', flag:'🇵🇹' },
  { code:'BR', name:'Brésil',        dial:'+55',  flag:'🇧🇷' },
  { code:'MX', name:'Mexique',       dial:'+52',  flag:'🇲🇽' },
  { code:'IN', name:'Inde',          dial:'+91',  flag:'🇮🇳' },
  { code:'CN', name:'Chine',         dial:'+86',  flag:'🇨🇳' },
  { code:'JP', name:'Japon',         dial:'+81',  flag:'🇯🇵' },
  { code:'KR', name:'Corée du Sud',  dial:'+82',  flag:'🇰🇷' },
  { code:'ZA', name:'Afrique du Sud',dial:'+27',  flag:'🇿🇦' },
  { code:'KE', name:'Kenya',         dial:'+254', flag:'🇰🇪' },
  { code:'ET', name:'Éthiopie',      dial:'+251', flag:'🇪🇹' },
  { code:'TZ', name:'Tanzanie',      dial:'+255', flag:'🇹🇿' },
  { code:'UG', name:'Ouganda',       dial:'+256', flag:'🇺🇬' },
  { code:'RW', name:'Rwanda',        dial:'+250', flag:'🇷🇼' },
  { code:'MG', name:'Madagascar',    dial:'+261', flag:'🇲🇬' },
  { code:'MU', name:'Maurice',       dial:'+230', flag:'🇲🇺' },
  { code:'AO', name:'Angola',        dial:'+244', flag:'🇦🇴' },
  { code:'MZ', name:'Mozambique',    dial:'+258', flag:'🇲🇿' },
  { code:'ZM', name:'Zambie',        dial:'+260', flag:'🇿🇲' },
  { code:'ZW', name:'Zimbabwe',      dial:'+263', flag:'🇿🇼' },
  { code:'LR', name:'Liberia',       dial:'+231', flag:'🇱🇷' },
  { code:'SL', name:'Sierra Leone',  dial:'+232', flag:'🇸🇱' },
  { code:'GW', name:'Guinée-Bissau', dial:'+245', flag:'🇬🇼' },
  { code:'CV', name:'Cap-Vert',      dial:'+238', flag:'🇨🇻' },
  { code:'GM', name:'Gambie',        dial:'+220', flag:'🇬🇲' },
  { code:'MR', name:'Mauritanie',    dial:'+222', flag:'🇲🇷' },
  { code:'LY', name:'Libye',         dial:'+218', flag:'🇱🇾' },
  { code:'SD', name:'Soudan',        dial:'+249', flag:'🇸🇩' },
  { code:'SO', name:'Somalie',       dial:'+252', flag:'🇸🇴' },
  { code:'DJ', name:'Djibouti',      dial:'+253', flag:'🇩🇯' },
  { code:'ER', name:'Érythrée',      dial:'+291', flag:'🇪🇷' },
  { code:'SS', name:'Soudan du Sud', dial:'+211', flag:'🇸🇸' },
  { code:'CF', name:'Centrafrique',  dial:'+236', flag:'🇨🇫' },
  { code:'TD', name:'Tchad',         dial:'+235', flag:'🇹🇩' },
  { code:'GQ', name:'Guinée Éq.',    dial:'+240', flag:'🇬🇶' },
  { code:'ST', name:'São Tomé',      dial:'+239', flag:'🇸🇹' },
  { code:'BI', name:'Burundi',       dial:'+257', flag:'🇧🇮' },
  { code:'KM', name:'Comores',       dial:'+269', flag:'🇰🇲' },
  { code:'SC', name:'Seychelles',    dial:'+248', flag:'🇸🇨' },
  { code:'MW', name:'Malawi',        dial:'+265', flag:'🇲🇼' },
  { code:'LS', name:'Lesotho',       dial:'+266', flag:'🇱🇸' },
  { code:'SZ', name:'Eswatini',      dial:'+268', flag:'🇸🇿' },
  { code:'BW', name:'Botswana',      dial:'+267', flag:'🇧🇼' },
  { code:'NA', name:'Namibie',       dial:'+264', flag:'🇳🇦' },
  { code:'LK', name:'Sri Lanka',     dial:'+94',  flag:'🇱🇰' },
  { code:'SE', name:'Suède',         dial:'+46',  flag:'🇸🇪' },
  { code:'NO', name:'Norvège',       dial:'+47',  flag:'🇳🇴' },
  { code:'DK', name:'Danemark',      dial:'+45',  flag:'🇩🇰' },
  { code:'FI', name:'Finlande',      dial:'+358', flag:'🇫🇮' },
  { code:'NL', name:'Pays-Bas',      dial:'+31',  flag:'🇳🇱' },
  { code:'PL', name:'Pologne',       dial:'+48',  flag:'🇵🇱' },
  { code:'RU', name:'Russie',        dial:'+7',   flag:'🇷🇺' },
  { code:'TR', name:'Turquie',       dial:'+90',  flag:'🇹🇷' },
  { code:'SA', name:'Arabie Saoudite',dial:'+966',flag:'🇸🇦' },
  { code:'AE', name:'Émirats Arabes', dial:'+971',flag:'🇦🇪' },
  { code:'SY', name:'Syrie',         dial:'+963', flag:'🇸🇾' },
  { code:'IQ', name:'Irak',          dial:'+964', flag:'🇮🇶' },
  { code:'IR', name:'Iran',          dial:'+98',  flag:'🇮🇷' },
  { code:'PK', name:'Pakistan',      dial:'+92',  flag:'🇵🇰' },
  { code:'BD', name:'Bangladesh',    dial:'+880', flag:'🇧🇩' },
  { code:'AU', name:'Australie',     dial:'+61',  flag:'🇦🇺' },
  { code:'NZ', name:'Nouvelle-Zélande',dial:'+64',flag:'🇳🇿' },
  { code:'CA', name:'Canada',        dial:'+1',   flag:'🇨🇦' },
  { code:'AR', name:'Argentine',     dial:'+54',  flag:'🇦🇷' },
  { code:'CO', name:'Colombie',      dial:'+57',  flag:'🇨🇴' },
  { code:'VE', name:'Venezuela',     dial:'+58',  flag:'🇻🇪' },
  { code:'PE', name:'Pérou',         dial:'+51',  flag:'🇵🇪' },
  { code:'CL', name:'Chili',         dial:'+56',  flag:'🇨🇱' },
];

function Spinner() {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [step, setStep]             = useState<1|2>(1);
  const [country, setCountry]       = useState(ALL_COUNTRIES[0]);
  const [phone, setPhone]           = useState('');
  const [fullPhone, setFullPhone]   = useState('');
  const [otp, setOtp]               = useState(['','','','','','']);
  const [loading, setLoading]       = useState(false);
  const [verifying, setVerifying]   = useState(false);
  const [error, setError]           = useState('');
  const [resendCd, setResendCd]     = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch]         = useState('');

  const confirmRef  = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const otpRefs     = useRef<(HTMLInputElement|null)[]>([]);
  const cdRef       = useRef<NodeJS.Timeout|null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace((session?.user as any)?.isNew ? '/onboarding' : '/chat');
    }
  }, [status, session]);

  useEffect(() => {
    if (resendCd <= 0) return;
    cdRef.current = setTimeout(() => setResendCd(s => s - 1), 1000);
    return () => { if (cdRef.current) clearTimeout(cdRef.current); };
  }, [resendCd]);

  // Initialiser reCAPTCHA invisible (requis par Firebase Phone Auth)
  function initRecaptcha() {
    if (recaptchaRef.current) return recaptchaRef.current;
    const verifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
    });
    recaptchaRef.current = verifier;
    return verifier;
  }

  // ── Étape 1 : envoyer OTP via Firebase ───────────────────────────────────
  async function handleSendOtp() {
    const full = `${country.dial}${phone.replace(/^0+/, '')}`;
    if (phone.length < 6) { setError('Numéro trop court'); return; }
    setLoading(true); setError('');
    try {
      const verifier = initRecaptcha();
      const confirmation = await signInWithPhoneNumber(firebaseAuth, full, verifier);
      confirmRef.current = confirmation;
      setFullPhone(full);
      setStep(2);
      setOtp(['','','','','','']);
      setResendCd(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      console.error('[Firebase OTP]', e);
      // Reset reCAPTCHA en cas d'erreur
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
      const msg = e.code === 'auth/invalid-phone-number'   ? 'Numéro de téléphone invalide'
                : e.code === 'auth/too-many-requests'      ? 'Trop de tentatives — réessayez dans quelques minutes'
                : e.code === 'auth/quota-exceeded'         ? 'Quota SMS dépassé — réessayez plus tard'
                : e.message ?? 'Erreur envoi SMS';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Étape 2 : vérifier le code Firebase puis connecter au backend ─────────
  async function handleVerifyOtp(code?: string) {
    const finalCode = code ?? otp.join('');
    if (finalCode.length !== 6) return;
    setVerifying(true); setError('');
    try {
      // 1. Vérifier le code avec Firebase
      const result = await confirmRef.current!.confirm(finalCode);
      const firebaseToken = await result.user.getIdToken();

      // 2. Échanger le token Firebase contre un token backend Oracle
      const res = await fetch(`${BASE}/auth/firebase-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: firebaseToken, phone: fullPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur serveur');

      // 3. Connecter via NextAuth
      const result2 = await signIn('phone', {
        redirect: false,
        backendToken: data.token,
        userId:       data.user.id,
        username:     data.user.username ?? '',
        isNew:        String(data.isNew ?? false),
      });
      if (result2?.error) throw new Error(result2.error);

      const afterLogin = sessionStorage.getItem('oracle-after-login');
      if (afterLogin) { sessionStorage.removeItem('oracle-after-login'); router.replace(afterLogin); return; }
      router.replace(data.isNew ? '/onboarding' : '/chat');
    } catch (e: any) {
      const msg = e.code === 'auth/invalid-verification-code' ? 'Code incorrect'
                : e.code === 'auth/code-expired'              ? 'Code expiré — renvoyez un nouveau code'
                : e.message ?? 'Code invalide';
      setError(msg);
      setOtp(['','','','','','']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setVerifying(false);
    }
  }

  function handleOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g,'').slice(-1);
    const next = [...otp]; next[idx] = digit; setOtp(next); setError('');
    if (digit && idx < 5) otpRefs.current[idx+1]?.focus();
    if (next.every(d => d !== '')) handleVerifyOtp(next.join(''));
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx-1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
      handleVerifyOtp(pasted);
    }
  }

  const filtered = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dial.includes(search) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight:'100dvh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', boxSizing:'border-box', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* reCAPTCHA invisible — requis par Firebase */}
      <div id="recaptcha-container" />

      {/* Logo */}
      <div style={{ width:72, height:72, borderRadius:22, background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, boxShadow:`0 8px 24px ${ACCENT}44` }}>
        <svg width="38" height="38" fill="none" viewBox="0 0 24 24">
          <path fill="white" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.782-1.388A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
          <circle cx="8.5" cy="12" r="1.3" fill={ACCENT}/>
          <circle cx="12"  cy="12" r="1.3" fill={ACCENT}/>
          <circle cx="15.5" cy="12" r="1.3" fill={ACCENT}/>
        </svg>
      </div>
      <h1 style={{ fontSize:26, fontWeight:800, color:'#111b21', margin:'0 0 6px', textAlign:'center' }}>Oracle Messenger</h1>

      {error && (
        <div style={{ width:'100%', maxWidth:360, margin:'12px 0', padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, color:'#dc2626', fontSize:13, textAlign:'center' }}>
          {error}
        </div>
      )}

      {/* ── ÉTAPE 1 : Numéro ── */}
      {step === 1 && (
        <div style={{ width:'100%', maxWidth:360, animation:'fadeIn .25s ease' }}>
          <p style={{ color:'#667781', fontSize:14, margin:'0 0 24px', textAlign:'center' }}>Entrez votre numéro de téléphone</p>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button onClick={() => setShowPicker(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'14px 12px', background:'#f0f2f5', border:'none', borderRadius:14, cursor:'pointer', fontSize:15, fontWeight:600, color:'#111b21', flexShrink:0 }}>
              <span style={{ fontSize:20 }}>{country.flag}</span>
              <span>{country.dial}</span>
              <svg width="14" height="14" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <input type="tel" value={phone}
              onChange={e => { setPhone(e.target.value.replace(/[^\d]/g,'')); setError(''); }}
              placeholder="Numéro de téléphone"
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
              autoFocus
              style={{ flex:1, padding:'14px 16px', background:'#f0f2f5', border:'none', borderRadius:14, fontSize:16, outline:'none', color:'#111b21' }}
            />
          </div>
          <button onClick={handleSendOtp} disabled={loading || phone.length < 6}
            style={{ width:'100%', background: phone.length >= 6 ? ACCENT : '#e9edef', color: phone.length >= 6 ? '#fff' : '#8696a0', border:'none', borderRadius:28, padding:'17px 24px', fontSize:16, fontWeight:700, cursor: phone.length >= 6 ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:24, boxShadow: phone.length >= 6 ? `0 4px 16px ${ACCENT}44` : 'none' }}>
            {loading
              ? <div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
              : '📱 Recevoir le code SMS →'}
          </button>
          <p style={{ fontSize:11, color:'#8696a0', textAlign:'center', lineHeight:1.6, maxWidth:300 }}>
            En continuant, vous acceptez nos <a href="/terms" style={{ color:ACCENT }}>conditions</a> et <a href="/privacy" style={{ color:ACCENT }}>politique de confidentialité</a>.
          </p>
        </div>
      )}

      {/* ── ÉTAPE 2 : Code OTP ── */}
      {step === 2 && (
        <div style={{ width:'100%', maxWidth:360, animation:'fadeIn .25s ease' }}>
          <p style={{ color:'#667781', fontSize:14, margin:'0 0 6px', textAlign:'center' }}>
            Code SMS envoyé au <strong style={{ color:'#111b21' }}>{fullPhone}</strong>
          </p>
          <p style={{ color:'#8696a0', fontSize:12, margin:'0 0 28px', textAlign:'center' }}>Entrez le code à 6 chiffres</p>

          <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:24 }} onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input key={i} ref={el => { otpRefs.current[i] = el; }}
                type="tel" inputMode="numeric" maxLength={1} value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                style={{ width:46, height:56, textAlign:'center', fontSize:24, fontWeight:700,
                  border:`2px solid ${digit ? ACCENT : '#e9edef'}`, borderRadius:14, outline:'none',
                  color:'#111b21', background: digit ? `${ACCENT}10` : '#f0f2f5',
                  transition:'border-color .15s, background .15s', caretColor:ACCENT }}
              />
            ))}
          </div>

          {verifying && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:16, color:'#667781', fontSize:14 }}>
              <div style={{ width:18, height:18, border:'2.5px solid #e9edef', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
              Vérification…
            </div>
          )}

          <div style={{ textAlign:'center', marginBottom:20 }}>
            {resendCd > 0
              ? <p style={{ fontSize:13, color:'#8696a0' }}>Renvoyer dans <strong>{resendCd}s</strong></p>
              : <button onClick={handleSendOtp} disabled={loading}
                  style={{ border:'none', background:'none', color:ACCENT, fontSize:14, fontWeight:600, cursor:'pointer', textDecoration:'underline' }}>
                  {loading ? 'Envoi…' : 'Renvoyer le code'}
                </button>
            }
          </div>

          <button onClick={() => { setStep(1); setError(''); setOtp(['','','','','','']); confirmRef.current = null; }}
            style={{ width:'100%', border:'none', background:'transparent', color:'#8696a0', fontSize:14, cursor:'pointer', padding:'8px' }}>
            ← Changer de numéro
          </button>
        </div>
      )}

      {/* Country picker */}
      {showPicker && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPicker(false); }}>
          <div style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px 8px', display:'flex', alignItems:'center', gap:12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un pays…"
                style={{ flex:1, padding:'10px 14px', background:'#f0f2f5', border:'none', borderRadius:20, fontSize:14, outline:'none' }} autoFocus/>
              <button onClick={() => { setShowPicker(false); setSearch(''); }}
                style={{ border:'none', background:'none', fontSize:20, cursor:'pointer', color:'#8696a0' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.map(c => (
                <button key={c.code} onClick={() => { setCountry(c); setShowPicker(false); setSearch(''); }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'12px 20px', border:'none', background: c.code === country.code ? '#f0fdf4' : 'transparent', cursor:'pointer', textAlign:'left' }}>
                  <span style={{ fontSize:24 }}>{c.flag}</span>
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

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <Spinner />;
  return <LoginContent />;
}
