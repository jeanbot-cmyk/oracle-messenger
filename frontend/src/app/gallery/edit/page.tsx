'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ACCENT = '#128C7E';

interface Adjustments {
  brightness: number; // 0-200 (100=normal)
  contrast:   number;
  saturation: number;
  blur:       number; // 0-10
  rotation:   number; // 0,90,180,270
  flipH:      boolean;
  flipV:      boolean;
}

const DEFAULT: Adjustments = { brightness:100, contrast:100, saturation:100, blur:0, rotation:0, flipH:false, flipV:false };

const FILTERS = [
  { name:'Original',  css:'' },
  { name:'Vivid',     css:'saturate(1.8) contrast(1.1)' },
  { name:'Fade',      css:'brightness(1.1) saturate(0.7) contrast(0.9)' },
  { name:'Noir',      css:'grayscale(1) contrast(1.1)' },
  { name:'Chaud',     css:'sepia(0.4) saturate(1.3) brightness(1.05)' },
  { name:'Froid',     css:'hue-rotate(200deg) saturate(1.2)' },
  { name:'Drama',     css:'contrast(1.4) saturate(1.3) brightness(0.9)' },
  { name:'Vintage',   css:'sepia(0.6) contrast(0.9) brightness(1.1) saturate(0.8)' },
];

function buildFilter(adj: Adjustments, extra = '') {
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${adj.blur}px) ${extra}`;
}

function buildTransform(adj: Adjustments) {
  const scaleX = adj.flipH ? -1 : 1;
  const scaleY = adj.flipV ? -1 : 1;
  return `rotate(${adj.rotation}deg) scale(${scaleX},${scaleY})`;
}

export default function PhotoEditPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);

  const [src,      setSrc]      = useState('');
  const [adj,      setAdj]      = useState<Adjustments>(DEFAULT);
  const [filter,   setFilter]   = useState(0);
  const [tab,      setTab]      = useState<'adjust'|'filter'>('adjust');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem('photo-edit-src');
    if (!stored) { router.replace('/chat'); return; }
    setSrc(stored);
    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = stored;
  }, []);

  if (!mounted || !src) return null;

  const filterCss = buildFilter(adj, FILTERS[filter].css);
  const transformCss = buildTransform(adj);

  function update(key: keyof Adjustments, val: number | boolean) {
    setAdj(prev => ({ ...prev, [key]: val }));
  }

  function rotate() { setAdj(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 })); }
  function reset()  { setAdj(DEFAULT); setFilter(0); }

  async function handleSave() {
    setSaving(true);
    try {
      const img = imgRef.current;
      if (!img) return;
      const canvas = canvasRef.current!;
      const isRotated = adj.rotation === 90 || adj.rotation === 270;
      canvas.width  = isRotated ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRotated ? img.naturalWidth  : img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = filterCss;
      ctx.save();
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.rotate((adj.rotation * Math.PI) / 180);
      ctx.scale(adj.flipH ? -1 : 1, adj.flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth/2, -img.naturalHeight/2);
      ctx.restore();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      // Sauvegarder dans la galerie locale
      const gallery: string[] = JSON.parse(localStorage.getItem('oracle-gallery') ?? '[]');
      gallery.unshift(dataUrl);
      localStorage.setItem('oracle-gallery', JSON.stringify(gallery.slice(0, 100)));
      setSaved(true);
      setTimeout(() => router.back(), 1200);
    } finally {
      setSaving(false);
    }
  }

  const sliders: { key: keyof Adjustments; label: string; min: number; max: number; step: number }[] = [
    { key:'brightness', label:'Luminosité',  min:0,   max:200, step:1 },
    { key:'contrast',   label:'Contraste',   min:0,   max:200, step:1 },
    { key:'saturation', label:'Saturation',  min:0,   max:300, step:1 },
    { key:'blur',       label:'Flou',        min:0,   max:10,  step:0.1 },
  ];

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#111', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
      <canvas ref={canvasRef} style={{ display:'none' }}/>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#1a1a1a', flexShrink:0 }}>
        <button onClick={() => router.back()}
          style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.1)', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h1 style={{ color:'#fff', fontSize:16, fontWeight:700, margin:0 }}>Retouche Photo</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={reset}
            style={{ padding:'7px 14px', borderRadius:20, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'#fff', fontSize:13, cursor:'pointer' }}>
            Réinitialiser
          </button>
          <button onClick={handleSave} disabled={saving || saved}
            style={{ padding:'7px 16px', borderRadius:20, border:'none', background: saved ? '#22c55e' : ACCENT, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            {saving ? (
              <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            ) : saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#000', position:'relative' }}>
        <img src={src} alt="edit"
          style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', filter:filterCss, transform:transformCss, transition:'filter 0.15s, transform 0.2s' }}/>
        {saved && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)', animation:'pop 0.2s ease' }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:'#22c55e', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="36" height="36" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ background:'#1a1a1a', flexShrink:0 }}>
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
          {(['adjust','filter'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'10px', border:'none', background:'transparent', color: tab===t ? ACCENT : 'rgba(255,255,255,0.5)', fontSize:13, fontWeight: tab===t ? 700 : 400, borderBottom: tab===t ? `2px solid ${ACCENT}` : '2px solid transparent', cursor:'pointer' }}>
              {t === 'adjust' ? '🎛 Ajustements' : '✨ Filtres'}
            </button>
          ))}
        </div>

        {/* Adjust tab */}
        {tab === 'adjust' && (
          <div style={{ padding:'12px 16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Rotation + flip */}
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              {[
                { label:'↻ Rotation', action: rotate },
                { label:'↔ Miroir H', action: () => update('flipH', !adj.flipH) },
                { label:'↕ Miroir V', action: () => update('flipV', !adj.flipV) },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action}
                  style={{ flex:1, padding:'8px 4px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:12, cursor:'pointer' }}>
                  {btn.label}
                </button>
              ))}
            </div>
            {/* Sliders */}
            {sliders.map(s => (
              <div key={s.key}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{s.label}</span>
                  <span style={{ fontSize:12, color:ACCENT, fontWeight:600 }}>{(adj[s.key] as number).toFixed(s.step < 1 ? 1 : 0)}{s.key==='blur'?'px':'%'}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step}
                  value={adj[s.key] as number}
                  onChange={e => update(s.key, parseFloat(e.target.value))}
                  style={{ width:'100%', accentColor:ACCENT, height:4 }}/>
              </div>
            ))}
          </div>
        )}

        {/* Filter tab */}
        {tab === 'filter' && (
          <div style={{ padding:'12px 16px 20px', overflowX:'auto' }}>
            <div style={{ display:'flex', gap:12, width:'max-content' }}>
              {FILTERS.map((f, i) => (
                <button key={f.name} onClick={() => setFilter(i)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, border:'none', background:'transparent', cursor:'pointer', padding:0 }}>
                  <div style={{ width:64, height:64, borderRadius:12, overflow:'hidden', border: filter===i ? `2.5px solid ${ACCENT}` : '2.5px solid transparent' }}>
                    <img src={src} alt={f.name} style={{ width:'100%', height:'100%', objectFit:'cover', filter: f.css || 'none' }}/>
                  </div>
                  <span style={{ fontSize:11, color: filter===i ? ACCENT : 'rgba(255,255,255,0.6)', fontWeight: filter===i ? 700 : 400 }}>{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
