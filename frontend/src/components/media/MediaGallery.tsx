'use client';
import { useEffect, useRef, useState } from 'react';

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  dataUrl: string;
  name: string;
  size: number;
  createdAt: number;
}

// Stockage IndexedDB local — rien sur le serveur
const DB_NAME = 'oracle-media';
const STORE   = 'files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath:'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveMedia(item: MediaItem) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

async function loadAllMedia(): Promise<MediaItem[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result ?? []);
    req.onerror   = () => rej(req.error);
  });
}

async function deleteMedia(id: string) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

interface Props {
  onSend?: (item: MediaItem) => void;
  onClose?: () => void;
}

export function MediaGallery({ onSend, onClose }: Props) {
  const [items, setItems]       = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [tab, setTab]           = useState<'gallery' | 'camera' | 'edit'>('gallery');
  const [filter, setFilter]     = useState<'brightness' | 'contrast' | 'saturate' | null>(null);
  const [filterVal, setFilterVal] = useState(100);
  const fileRef  = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    loadAllMedia().then(all => setItems(all.sort((a,b) => b.createdAt - a.createdAt)));
  }, []);

  async function importFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async () => {
        const item: MediaItem = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: file.type.startsWith('video') ? 'video' : 'image',
          dataUrl: reader.result as string,
          name: file.name,
          size: file.size,
          createdAt: Date.now(),
        };
        await saveMedia(item);
        setItems(prev => [item, ...prev]);
      };
      reader.readAsDataURL(file);
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' }, audio: false });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {}
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
  }

  async function takePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.9);
    const item: MediaItem = {
      id: `photo_${Date.now()}`,
      type: 'image',
      dataUrl,
      name: `photo_${Date.now()}.jpg`,
      size: dataUrl.length,
      createdAt: Date.now(),
    };
    await saveMedia(item);
    setItems(prev => [item, ...prev]);
    stopCamera();
    setTab('gallery');
  }

  function getFilterStyle(): string {
    if (!filter) return 'none';
    return `${filter}(${filterVal}%)`;
  }

  async function applyAndSave() {
    if (!selected || !canvasRef.current) return;
    const img = new Image();
    img.onload = async () => {
      const c = canvasRef.current!;
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.filter = getFilterStyle();
      ctx.drawImage(img, 0, 0);
      const newDataUrl = c.toDataURL('image/jpeg', 0.9);
      const edited: MediaItem = { ...selected, id: `edited_${Date.now()}`, dataUrl: newDataUrl, createdAt: Date.now() };
      await saveMedia(edited);
      setItems(prev => [edited, ...prev]);
      setSelected(edited);
    };
    img.src = selected.dataUrl;
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding:'6px 14px', borderRadius:20, border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)', fontSize:13, cursor:'pointer', fontWeight:500,
  });

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'var(--bg-app)', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-surface)', borderBottom:'1px solid var(--border)' }}>
        <button onClick={() => { stopCamera(); onClose?.(); }} style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:20, color:'var(--text-primary)' }}>←</button>
        <h2 style={{ flex:1, fontSize:18, fontWeight:700, color:'var(--text-primary)', margin:0 }}>📸 Multimédia</h2>
        <div style={{ display:'flex', gap:6 }}>
          <button style={btnStyle(tab==='gallery')} onClick={() => { stopCamera(); setTab('gallery'); }}>Galerie</button>
          <button style={btnStyle(tab==='camera')} onClick={() => { setTab('camera'); startCamera(); }}>Caméra</button>
          {selected && <button style={btnStyle(tab==='edit')} onClick={() => setTab('edit')}>Retouche</button>}
        </div>
      </div>

      {/* Caméra */}
      {tab === 'camera' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'#000' }}>
          <video ref={videoRef} autoPlay playsInline style={{ maxWidth:'100%', maxHeight:'70vh', borderRadius:12 }} />
          <canvas ref={canvasRef} style={{ display:'none' }} />
          <button onClick={takePhoto} style={{ width:72, height:72, borderRadius:'50%', background:'#fff', border:'4px solid var(--accent)', cursor:'pointer', fontSize:28 }}>📷</button>
        </div>
      )}

      {/* Retouche */}
      {tab === 'edit' && selected && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:16, padding:16, overflow:'auto' }}>
          <canvas ref={canvasRef} style={{ display:'none' }} />
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'#000', borderRadius:12, overflow:'hidden', minHeight:200 }}>
            <img src={selected.dataUrl} alt="edit" style={{ maxWidth:'100%', maxHeight:400, filter: getFilterStyle() }} />
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {(['brightness','contrast','saturate'] as const).map(f => (
              <button key={f} style={btnStyle(filter===f)} onClick={() => { setFilter(f); setFilterVal(100); }}>
                {f === 'brightness' ? '☀️ Luminosité' : f === 'contrast' ? '◑ Contraste' : '🎨 Saturation'}
              </button>
            ))}
            <button style={btnStyle(false)} onClick={() => { setFilter(null); setFilterVal(100); }}>↺ Reset</button>
          </div>
          {filter && (
            <input type="range" min={0} max={200} value={filterVal} onChange={e => setFilterVal(+e.target.value)}
              style={{ width:'100%', accentColor:'var(--accent)' }} />
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={applyAndSave} style={{ flex:1, background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, padding:12, cursor:'pointer', fontWeight:600 }}>
              💾 Sauvegarder
            </button>
            {onSend && (
              <button onClick={() => { onSend(selected); onClose?.(); }} style={{ flex:1, background:'#22c55e', color:'#fff', border:'none', borderRadius:10, padding:12, cursor:'pointer', fontWeight:600 }}>
                📤 Envoyer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Galerie */}
      {tab === 'gallery' && (
        <div style={{ flex:1, overflow:'auto', padding:12 }}>
          {/* Import */}
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <button onClick={() => fileRef.current?.click()} style={{ flex:1, padding:'10px', borderRadius:10, border:'2px dashed var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-muted)', fontSize:14 }}>
              + Importer photos/vidéos
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={e => importFiles(e.target.files)} style={{ display:'none' }} />
          </div>

          {items.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>
              <p style={{ fontSize:40 }}>🖼️</p>
              <p>Aucun média. Importez ou prenez une photo.</p>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:3 }}>
            {items.map(item => (
              <div key={item.id} onClick={() => { setSelected(item); setTab('edit'); }}
                style={{ aspectRatio:'1', overflow:'hidden', borderRadius:4, cursor:'pointer', position:'relative', border: selected?.id===item.id ? '2px solid var(--accent)' : 'none' }}>
                {item.type === 'image' ? (
                  <img src={item.dataUrl} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                ) : (
                  <div style={{ width:'100%', height:'100%', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🎬</div>
                )}
                {onSend && (
                  <button onClick={e => { e.stopPropagation(); onSend(item); onClose?.(); }}
                    style={{ position:'absolute', bottom:4, right:4, background:'var(--accent)', border:'none', borderRadius:6, padding:'3px 7px', cursor:'pointer', color:'#fff', fontSize:11 }}>
                    Envoyer
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
