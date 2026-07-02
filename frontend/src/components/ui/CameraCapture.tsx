'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onCapture: (dataUrl: string, type: 'image' | 'video') => void;
  onClose: () => void;
  mode?: 'photo' | 'video' | 'both';
}

export function CameraCapture({ onCapture, onClose, mode = 'both' }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  const [facing,    setFacing]    = useState<'user' | 'environment'>('environment');
  const [recording, setRecording] = useState(false);
  const [recSecs,   setRecSecs]   = useState(0);
  const [error,     setError]     = useState('');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(mode === 'video' ? 'video' : 'photo');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facing]);

  async function startCamera() {
    stopCamera();
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: captureMode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function flipCamera() {
    setFacing(f => f === 'environment' ? 'user' : 'environment');
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror si caméra frontale
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onCapture(dataUrl, 'image');
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => onCapture(reader.result as string, 'video');
        reader.readAsDataURL(blob);
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch (e) {
      setError('Enregistrement vidéo non supporté sur cet appareil.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function handleShutter() {
    if (captureMode === 'photo') {
      takePhoto();
    } else {
      if (recording) stopRecording();
      else startRecording();
    }
  }

  const fmtSecs = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Viewfinder */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: facing === 'user' ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Barre du haut */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}>
          <button onClick={() => { stopCamera(); onClose(); }}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', color: '#fff', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>

          {/* Indicateur enregistrement */}
          {recording && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: '6px 14px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{fmtSecs(recSecs)}</span>
            </div>
          )}

          {/* Flip caméra */}
          <button onClick={flipCamera}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24">
              <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
              <path d="M12 9l-4 4h3v4h2v-4h3z" opacity=".6"/>
            </svg>
          </button>
        </div>

        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 24 }}>
            <p style={{ color: '#fff', textAlign: 'center', fontSize: 15 }}>{error}</p>
          </div>
        )}
      </div>

      {/* Barre du bas */}
      <div style={{ background: '#111', padding: '20px 32px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Sélecteur photo/vidéo */}
        {mode === 'both' && (
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 4 }}>
            {(['photo', 'video'] as const).map(m => (
              <button key={m} onClick={() => { if (!recording) setCaptureMode(m); }}
                style={{ padding: '6px 20px', borderRadius: 16, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: captureMode === m ? '#fff' : 'transparent', color: captureMode === m ? '#111' : 'rgba(255,255,255,0.7)' }}>
                {m === 'photo' ? 'Photo' : 'Vidéo'}
              </button>
            ))}
          </div>
        )}

        {/* Bouton déclencheur */}
        <button onClick={handleShutter}
          style={{
            width: 72, height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: captureMode === 'video' && recording ? '#ef4444' : '#fff',
            boxShadow: `0 0 0 4px rgba(255,255,255,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.1s',
          }}>
          {captureMode === 'video' ? (
            recording
              ? <div style={{ width: 24, height: 24, borderRadius: 4, background: '#fff' }} />
              : <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ef4444' }} />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fff', border: '3px solid #ccc' }} />
          )}
        </button>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
