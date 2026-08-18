'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { matchesSearch } from '../../lib/search';
import { notify } from '../../lib/feedback';
import { playReminderSound } from '../../lib/sounds';
import { api } from '../../lib/api';

type Tag = 'chaud'|'froid'|'payé'|'relancer'|'prospect'|'vip'|'perdu';
interface Client {
  id:string; name:string; phone:string; email:string; tags:Tag[];
  notes:string; nextReminder?:string; reminderNote?:string;
  autoMessage?:string; value:number; createdAt:string;
}
interface Reminder { id:string; clientId:string; clientName:string; date:string; note:string; done:boolean; notifiedAt?:number; }
interface AutoSettings { welcomeMessage:string; paymentProvider:string; paymentLink:string; }
type BusinessAiMessage = { role:'client'|'agent'|'system'; text:string };
type WesternUnionReceiptStatus = 'idle'|'submitting'|'approved'|'pending_manual_review'|'rejected'|'error';

const TAG_META:Record<Tag,{bg:string;color:string;label:string}> = {
  chaud:   {bg:'#fff3e0',color:'#e65100',label:'🔥 Chaud'},
  froid:   {bg:'#e3f2fd',color:'#1565c0',label:'❄️ Froid'},
  'payé':  {bg:'#e8f5e9',color:'#2e7d32',label:'✅ Payé'},
  relancer:{bg:'#fce4ec',color:'#c62828',label:'📞 Relancer'},
  prospect:{bg:'#f3e5f5',color:'#6a1b9a',label:'👁 Prospect'},
  vip:     {bg:'#fffde7',color:'#f57f17',label:'⭐ VIP'},
  perdu:   {bg:'#f5f5f5',color:'#616161',label:'❌ Perdu'},
};

const tabs = [
  ['clients', 'Clients'],
  ['reminders', 'Rappels'],
  ['stats', 'Stats'],
  ['auto', 'Auto IA'],
] as const;

const filterOrder = ['all', 'chaud', 'froid', 'payé', 'relancer', 'prospect', 'vip', 'perdu'] as const;
const DEMO_CLIENT_IDS = ['demo-ai-1', 'demo-ai-2', 'demo-ai-3'];
const FREE_AI_TEST_LIMIT = 5;

const aiBusinessFeatures = [
  'Répondre aux prospects avec un message professionnel.',
  'Classer les clients : chaud, froid, payé ou à relancer.',
  'Créer des rappels au bon moment.',
  'Proposer la prochaine action commerciale.',
  'Analyser les statistiques et les priorités.',
  'Faire gagner du temps chaque semaine.',
];

function scopedKey(k:string, ownerId?:string){const id=ownerId?.trim();return id?`${k}:${id}`:k;}
function ld<T>(k:string,d:T,ownerId?:string):T{if(typeof window==='undefined')return d;try{return JSON.parse(localStorage.getItem(scopedKey(k,ownerId))??'null')??d;}catch{return d;}}
function sv(k:string,v:any,ownerId?:string){if(typeof window!=='undefined')localStorage.setItem(scopedKey(k,ownerId),JSON.stringify(v));}
function csvCell(value:any){return `"${String(value??'').replace(/"/g,'""')}"`;}
function downloadTextFile(name:string, content:string, type:string){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Lecture du reçu impossible.'));
    reader.readAsDataURL(file);
  });
}

function reminderTimestamp(date:string) {
  if (!date) return 0;
  const parsed = date.includes('T') ? new Date(date) : new Date(`${date}T09:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function reminderDateLabel(date:string) {
  const ts = reminderTimestamp(date);
  if (!ts) return date;
  return new Date(ts).toLocaleString('fr', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function mapServerStatus(status:string): Tag {
  if (status === 'paye') return 'payé';
  if (['chaud','froid','relancer','prospect','vip','perdu'].includes(status)) return status as Tag;
  return 'prospect';
}

function mergeById<T extends { id:string }>(local:T[], incoming:T[]) {
  const map = new Map(local.map(item => [item.id, item]));
  incoming.forEach(item => map.set(item.id, { ...map.get(item.id), ...item }));
  return Array.from(map.values());
}

export default function BusinessPage() {
  const {data:session,status}=useSession();
  const router=useRouter();
  const searchParams=useSearchParams();
  const [mounted,setMounted]=useState(false);
  const [tab,setTab]=useState<'clients'|'reminders'|'stats'|'auto'>('clients');
  const [clients,setClients]=useState<Client[]>([]);
  const [reminders,setReminders]=useState<Reminder[]>([]);
  const [search,setSearch]=useState('');
  const [filterTag,setFilterTag]=useState<Tag|'all'>('all');
  const [showForm,setShowForm]=useState(false);
  const [editClient,setEditClient]=useState<Client|null>(null);
  const [showRemind,setShowRemind]=useState<Client|null>(null);
  const [remDate,setRemDate]=useState('');
  const [remNote,setRemNote]=useState('');
  const [guideOpen,setGuideOpen]=useState(false);
  const [autoSettings,setAutoSettings]=useState<AutoSettings>({welcomeMessage:'Bonjour {nom}, merci pour votre intérêt. Je reviens vers vous rapidement.',paymentProvider:'Flutterwave',paymentLink:''});
  const [businessAccess,setBusinessAccess]=useState<any>(null);
  const [payingBusiness,setPayingBusiness]=useState(false);
  const [westernUnion,setWesternUnion]=useState<any>(null);
  const [wuOpen,setWuOpen]=useState(false);
  const [wuReceiptStatus,setWuReceiptStatus]=useState<WesternUnionReceiptStatus>('idle');
  const [wuMessage,setWuMessage]=useState('');
  const [wuForm,setWuForm]=useState({
    transactionNumber:'',
    senderFullName:'',
    senderCountry:'',
    amountFcfa:'50000',
    paymentDate:new Date().toISOString().slice(0,10),
    receiptDataUrl:'',
    fileName:'',
    mimeType:'',
    fileSize:0,
    width:0,
    height:0,
  });
  const [aiPanelOpen,setAiPanelOpen]=useState(false);
  const [aiPanelNotice,setAiPanelNotice]=useState('');
  const [aiConversation,setAiConversation]=useState<BusinessAiMessage[]>([]);
  const [aiTestCount,setAiTestCount]=useState(0);
  const aiCloseTimerRef=useRef<number|null>(null);
  const wuCameraRef=useRef<HTMLInputElement|null>(null);
  const token=(session?.user as any)?.backendToken ?? '';
  const ownerId=(session?.user as any)?.id || (session?.user as any)?.email || token || '';
  const username=(session?.user as any)?.username ?? '';
  const businessLink=username
    ? `https://messenger.oracle-plus.online/u/${encodeURIComponent(username)}`
    : 'https://messenger.oracle-plus.online/install';

  useEffect(()=>{setMounted(true);if(status==='unauthenticated')router.replace('/login');},[status]);
  useEffect(()=>{
    if(!aiPanelOpen)return;
    if(aiCloseTimerRef.current)window.clearTimeout(aiCloseTimerRef.current);
    aiCloseTimerRef.current=window.setTimeout(()=>{
      setAiPanelOpen(false);
      setAiPanelNotice('');
    },45000);
    return()=>{if(aiCloseTimerRef.current)window.clearTimeout(aiCloseTimerRef.current);};
  },[aiPanelOpen, aiConversation, aiPanelNotice]);
  useEffect(()=>{
    if(!mounted || status!=='authenticated' || !ownerId)return;
    setClients(ld('oracle-crm',[],ownerId) );
    setReminders(ld('oracle-rem',[],ownerId));
    setAutoSettings(ld('oracle-crm-auto',{welcomeMessage:'Bonjour {nom}, merci pour votre intérêt. Je reviens vers vous rapidement.',paymentProvider:'Flutterwave',paymentLink:''},ownerId));
    setAiTestCount(ld('oracle-business-ai-test-count',0,ownerId));
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(()=>{});
    checkReminders();
    if (token) {
      const reference = searchParams?.get('reference') ?? '';
      const request = searchParams?.get('businessPaystack') === 'verify' && reference
        ? api.business.verifyPaystack(token, reference)
        : api.business.overview(token);
      request.then(data => {
        setBusinessAccess(data.access ?? null);
        setWesternUnion(data.westernUnion ?? null);
        if (searchParams?.get('businessPaystack') === 'verify') {
          notify('Abonnement Business activé.', 'success');
          router.replace('/business');
        }
        const serverClients:Client[] = (data.clients || []).map((c:any) => {
          const status = mapServerStatus(c.status);
          const tags = String(c.tags || status).split('|').map(mapServerStatus);
          return {
            id: c.id,
            name: c.name || 'Client',
            phone: c.phone || '',
            email: c.email || '',
            tags: Array.from(new Set(tags)),
            notes: c.notes || '',
            nextReminder: '',
            reminderNote: '',
            autoMessage: '',
            value: c.value || 0,
            createdAt: c.createdAt || new Date().toISOString(),
          };
        });
        const serverReminders:Reminder[] = (data.reminders || []).map((r:any) => ({
          id: r.id,
          clientId: r.clientId || '',
          clientName: r.title?.replace(/^Relancer\s+/i, '') || 'Client',
          date: r.dueAt,
          note: r.note || '',
          done: Boolean(r.done),
        }));
        setClients(current => {
          const merged = mergeById(current.length ? current : ld('oracle-crm', [], ownerId), serverClients);
          sv('oracle-crm', merged, ownerId);
          return merged;
        });
        setReminders(current => {
          const merged = mergeById(current.length ? current : ld('oracle-rem', [], ownerId), serverReminders);
          sv('oracle-rem', merged, ownerId);
          return merged;
        });
      }).catch(() => {});
    }
    const timer = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(timer);
  },[mounted, token, ownerId, searchParams, router]);

  const canUseBusinessActions = Boolean(businessAccess?.canAct);
  const businessBlockedText = !businessAccess
    ? ''
    : !businessAccess.subscriptionActive
      ? `Abonnement Business requis : ${businessAccess.monthlyPriceFcfa?.toLocaleString?.() ?? 10000} FCFA/mois.`
      : !businessAccess.aiCreditsOk
        ? 'Crédit IA insuffisant pour exécuter les actions Business automatiques.'
        : '';

  function requireBusinessAccess() {
    if (canUseBusinessActions) return true;
    notify(businessBlockedText || 'Activez Business pour utiliser cette action.', 'error');
    return false;
  }

  async function payBusinessSubscription() {
    if (!token) {
      notify('Session expirée. Reconnectez-vous avec Google avant de lancer le paiement Business.', 'error');
      return;
    }
    if (payingBusiness) return;
    setPayingBusiness(true);
    try {
      const data = await api.business.initializePaystack(token);
      if (data.authorizationUrl) window.location.href = data.authorizationUrl;
      else {
        const fresh = await api.business.overview(token);
        setBusinessAccess(fresh.access ?? null);
        setPayingBusiness(false);
      }
    } catch (err:any) {
      notify(err?.message || 'Paiement Business indisponible.', 'error');
      setPayingBusiness(false);
    }
  }

  async function openWesternUnionPanel() {
    if (!token) {
      notify('Session expirée. Reconnectez-vous avant le paiement Western Union.', 'error');
      return;
    }
    try {
      const data = await api.business.westernUnionConfig(token);
      setWesternUnion(data);
      setWuOpen(true);
      setWuMessage('');
    } catch (err:any) {
      notify(err?.message || 'Western Union indisponible.', 'error');
    }
  }

  async function pickWesternUnionReceipt(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setWuMessage('Le reçu doit être photographié avec la caméra.');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    const img = new Image();
    img.onload = () => {
      setWuForm(current => ({
        ...current,
        receiptDataUrl: dataUrl,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));
      setWuMessage('Reçu photographié. Vérifiez les informations puis envoyez pour validation.');
    };
    img.onerror = () => {
      setWuForm(current => ({
        ...current,
        receiptDataUrl: dataUrl,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      }));
      setWuMessage('Reçu chargé. Envoyez pour validation.');
    };
    img.src = dataUrl;
  }

  async function submitWesternUnionReceipt() {
    if (!token) {
      notify('Session expirée. Reconnectez-vous avant d’envoyer le reçu.', 'error');
      return;
    }
    if (!wuForm.transactionNumber.trim() || !wuForm.senderFullName.trim() || !wuForm.senderCountry.trim()) {
      setWuMessage('Renseignez le numéro de transaction, votre nom et votre pays.');
      return;
    }
    if (!wuForm.receiptDataUrl) {
      setWuMessage('Ouvrez la caméra et photographiez le reçu original.');
      return;
    }
    setWuReceiptStatus('submitting');
    setWuMessage('Contrôle 1 en cours, puis lancement du contrôle OCR anti-fraude...');
    try {
      const result = await api.business.submitWesternUnionReceipt(token, {
        ...wuForm,
        amountFcfa: Number(wuForm.amountFcfa.replace(/\D/g,'')) || 0,
      });
      setBusinessAccess(result.access ?? null);
      setWuReceiptStatus(result.receipt?.status ?? 'pending_manual_review');
      setWuMessage(result.message || 'Reçu enregistré.');
      if (result.receipt?.status === 'approved') {
        notify('Paiement Western Union validé. Forfait entreprise activé.', 'success');
        const fresh = await api.business.overview(token);
        setBusinessAccess(fresh.access ?? null);
        setWesternUnion(fresh.westernUnion ?? westernUnion);
      }
    } catch (err:any) {
      setWuReceiptStatus('error');
      setWuMessage(err?.message || 'Envoi du reçu impossible.');
    }
  }

  function checkReminders(){
    const rems:Reminder[]=ld('oracle-rem',[],ownerId);
    const now=new Date();
    let changed=false;
    const next=rems.map(r=>{
      const due=reminderTimestamp(r.date);
      if(!r.done&&!r.notifiedAt&&due>0&&due<=now.getTime()){
        playReminderSound();
        if('Notification' in window&&Notification.permission==='granted'){
          new Notification(`Rappel : ${r.clientName}`,{
            body:r.note||reminderDateLabel(r.date),
            icon:'/icons/icon-192-v20260809-premium.png',
            tag:`business-reminder-${r.id}`,
            requireInteraction:true,
          });
        }
        changed=true;
        return {...r,notifiedAt:now.getTime()};
      }
      return r;
    });
    if(changed){
      setReminders(next);
      sv('oracle-rem', next, ownerId);
    }
  }

  function saveC(list:Client[]){if(!requireBusinessAccess())return;setClients(list);sv('oracle-crm',list,ownerId);}
  function saveR(list:Reminder[]){if(!requireBusinessAccess())return;setReminders(list);sv('oracle-rem',list,ownerId);}
  function saveAuto(next:AutoSettings){if(!requireBusinessAccess())return;setAutoSettings(next);sv('oracle-crm-auto',next,ownerId);}
  function copyBusinessLink(){if(!requireBusinessAccess())return;navigator.clipboard?.writeText(businessLink).then(()=>notify('Lien copié.', 'success')).catch(()=>{});}
  function shareBusinessLink(){if(!requireBusinessAccess())return;navigator.share?.({title:'Oracle Messenger',text:'Contactez-moi directement sur Oracle Messenger.',url:businessLink}).catch(()=>copyBusinessLink());}
  function formatTemplate(template:string, client?:Client){
    return template
      .replace(/\{nom\}/gi, client?.name || 'client')
      .replace(/\{lien\}/gi, businessLink)
      .replace(/\{montant\}/gi, client?.value ? `${client.value.toLocaleString()}€` : '')
      .replace(/\{paiement\}/gi, autoSettings.paymentLink || '');
  }
  function exportClientsCsv(){
    if(!requireBusinessAccess())return;
    const rows=[
      ['Nom','Téléphone','Email','Tags','Valeur','Notes','Prochain rappel','Message auto','Créé le'],
      ...clients.map(c=>[c.name,c.phone,c.email,c.tags.join(' | '),c.value,c.notes,c.nextReminder||'',c.autoMessage||'',c.createdAt]),
    ];
    downloadTextFile(`oracle-crm-clients-${new Date().toISOString().slice(0,10)}.csv`, rows.map(r=>r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }
  function exportClientsExcel(){
    if(!requireBusinessAccess())return;
    const rows=clients.map(c=>`<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.email}</td><td>${c.tags.join(' | ')}</td><td>${c.value}</td><td>${c.notes}</td><td>${c.nextReminder||''}</td><td>${c.createdAt}</td></tr>`).join('');
    downloadTextFile(`oracle-crm-clients-${new Date().toISOString().slice(0,10)}.xls`, `<html><meta charset="utf-8"><body><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Tags</th><th>Valeur</th><th>Notes</th><th>Prochain rappel</th><th>Créé le</th></tr></thead><tbody>${rows}</tbody></table></body></html>`, 'application/vnd.ms-excel;charset=utf-8');
  }
  function openClientMessage(c:Client) {
    if(!requireBusinessAccess())return;
    const msg=c.autoMessage||formatTemplate(autoSettings.welcomeMessage,c);
    window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');
  }

  function createDemoWorkspace() {
    const now = Date.now();
    const demoClients: Client[] = [
      {
        id: DEMO_CLIENT_IDS[0],
        name: 'Prospect conférence',
        phone: '+225 07 00 00 00 01',
        email: '',
        tags: ['chaud', 'relancer'],
        notes: "IA : intérêt fort détecté. Le client demande le prix et veut une réponse rapide.",
        nextReminder: new Date(now + 86400000).toISOString().slice(0, 16),
        reminderNote: 'Relancer avec une offre claire et un lien de paiement.',
        autoMessage: 'Bonjour {nom}, merci pour votre intérêt. Je peux vous envoyer l’offre complète et finaliser votre réservation aujourd’hui.',
        value: 35000,
        createdAt: new Date(now).toISOString(),
      },
      {
        id: DEMO_CLIENT_IDS[1],
        name: 'Cliente boutique',
        phone: '+225 07 00 00 00 02',
        email: '',
        tags: ['payé', 'vip'],
        notes: 'IA : paiement confirmé. Client à conserver en priorité pour les prochaines offres.',
        autoMessage: 'Bonjour {nom}, votre paiement est bien noté. Merci pour votre confiance.',
        value: 25000,
        createdAt: new Date(now - 3600000).toISOString(),
      },
      {
        id: DEMO_CLIENT_IDS[2],
        name: 'Contact à réchauffer',
        phone: '+225 07 00 00 00 03',
        email: '',
        tags: ['froid'],
        notes: 'IA : intérêt faible. Recommandation : relance douce dans quelques jours.',
        autoMessage: 'Bonjour {nom}, je reviens vers vous avec une proposition simple et adaptée à votre budget.',
        value: 12000,
        createdAt: new Date(now - 7200000).toISOString(),
      },
    ];
    const demoReminders: Reminder[] = [
      {
        id: 'demo-rem-1',
        clientId: DEMO_CLIENT_IDS[0],
        clientName: 'Prospect conférence',
        date: new Date(now + 86400000).toISOString().slice(0, 16),
        note: 'Relancer avec le tarif et le lien de paiement.',
        done: false,
      },
    ];
    const withoutDemoClients = clients.filter(client => !DEMO_CLIENT_IDS.includes(client.id));
    const withoutDemoReminders = reminders.filter(reminder => !String(reminder.id).startsWith('demo-rem-'));
    const nextClients = [...demoClients, ...withoutDemoClients];
    const nextReminders = [...demoReminders, ...withoutDemoReminders];
    setClients(nextClients);
    setReminders(nextReminders);
    sv('oracle-crm', nextClients, ownerId);
    sv('oracle-rem', nextReminders, ownerId);
    setTab('clients');
    setAiConversation([
      {role:'client',text:'Bonjour, je veux connaître le tarif et réserver rapidement.'},
      {role:'agent',text:'Bonjour Prospect conférence, merci pour votre intérêt. Je prépare une réponse claire avec tarif, disponibilité et lien de paiement.'},
      {role:'agent',text:'Action automatique proposée : classer le client en chaud, programmer une relance demain et préparer le message WhatsApp.'},
    ]);
    setAiPanelNotice('Démo chargée. L’agent IA peut préparer réponses, statuts, rappels et prochaines actions sans que vous restiez sur cette page.');
    setAiPanelOpen(true);
    notify('Espace de démonstration IA chargé.', 'success');
  }

  function previewAiMessage(kind: 'reply' | 'followup' | 'priority') {
    if (!businessAccess?.isAdmin && aiTestCount >= FREE_AI_TEST_LIMIT) {
      setAiConversation([
        {role:'system',text:'Vos tests gratuits sont terminés. Activez Business pour laisser l’agent IA travailler automatiquement sur vos clients.'},
      ]);
      setAiPanelNotice('Limite atteinte. Ce panneau va se fermer automatiquement.');
      setAiPanelOpen(true);
      window.setTimeout(()=>setAiPanelOpen(false), 1800);
      return;
    }
    const client = clients[0] || {
      name: 'Prospect',
      value: 0,
      autoMessage: '',
      tags: ['prospect'],
    } as Client;
    const clientMessage = kind === 'reply'
      ? 'Bonjour, je suis intéressé. Quel est le prix et comment réserver ?'
      : kind === 'followup'
        ? 'Je n’ai pas encore confirmé, je vais réfléchir.'
        : 'Je veux payer aujourd’hui si vous me confirmez la disponibilité.';
    const message = kind === 'reply'
      ? `Bonjour ${client.name}, merci pour votre message. Je peux vous envoyer l’offre claire, le tarif et le lien de paiement pour finaliser rapidement.`
      : kind === 'followup'
        ? `Bonjour ${client.name}, je reviens vers vous simplement. Voulez-vous finaliser aujourd’hui ou recevoir une dernière précision avant de décider ?`
        : `${client.name} est une priorité : intention d’achat forte, action recommandée maintenant avec lien de paiement et réponse rapide.`;
    setAiConversation([
      {role:'client',text:clientMessage},
      {role:'agent',text:message},
      {role:'agent',text:'Je peux aussi enregistrer la priorité, préparer la relance et proposer le prochain message sans intervention manuelle.'},
    ]);
    const nextCount = businessAccess?.isAdmin ? aiTestCount : Math.min(FREE_AI_TEST_LIMIT, aiTestCount + 1);
    setAiTestCount(nextCount);
    sv('oracle-business-ai-test-count', nextCount, ownerId);
    setAiPanelNotice(`Aperçu gratuit ${nextCount}/${FREE_AI_TEST_LIMIT}. L’agent prépare les réponses, classe les prospects et propose les actions même sans votre présence.`);
    setAiPanelOpen(true);
  }

  const filtered=clients.filter(c=>{
    const ms=matchesSearch([c.name,c.phone,c.email,c.notes,c.tags.join(' ')],search);
    const mt=filterTag==='all'||c.tags.includes(filterTag);
    return ms&&mt;
  });

  const totalValue=clients.reduce((s,c)=>s+(c.value||0),0);
  const paidClients=clients.filter(c=>c.tags.includes('payé'));
  const hotClients=clients.filter(c=>c.tags.includes('chaud'));
  const paidValue=paidClients.reduce((s,c)=>s+(c.value||0),0);
  const forecastValue=clients.filter(c=>!c.tags.includes('payé')&&!c.tags.includes('perdu')).reduce((s,c)=>s+(c.value||0),0);
  const conversionBase=paidClients.length+hotClients.length;
  const conversionRate=conversionBase?Math.round(paidClients.length/conversionBase*100):0;
  const pending=reminders.filter(r=>!r.done&&reminderTimestamp(r.date)>=Date.now()).length;

  if(!mounted||status==='loading')return <Spinner/>;

  return(
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'var(--bg-app)'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .om-business-scroll::-webkit-scrollbar{display:none}
        .om-business-scroll{scrollbar-width:none;-ms-overflow-style:none}
        @keyframes aiPulse{0%,100%{box-shadow:0 0 0 0 rgba(217,183,91,.36)}50%{box-shadow:0 0 0 8px rgba(217,183,91,0)}}
        @media(max-width:420px){
          .om-business-title{font-size:20px!important}
          .om-business-subtitle{font-size:12.5px!important}
          .om-business-tab{font-size:13px!important;padding:10px 8px!important}
          .om-business-chip{font-size:13px!important;padding:8px 12px!important}
        }
      `}</style>
      {/* Header */}
      <div style={{background:'var(--header-bg)',padding:'calc(13px + env(safe-area-inset-top, 0px)) 16px 15px',display:'flex',alignItems:'center',gap:12,flexShrink:0,boxShadow:'0 8px 22px rgba(16,42,42,0.16)'}}>
        <button onClick={()=>router.back()} aria-label="Retour" style={{width:42,height:42,minHeight:42,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.14)',background:'rgba(255,255,255,0.12)',cursor:'pointer',color:'#fff',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>←</button>
        <div style={{flex:1,minWidth:0}}>
          <h1 className="om-business-title" style={{fontSize:22,lineHeight:1.1,fontWeight:900,color:'#fff',margin:0,letterSpacing:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Business & CRM</h1>
          <p className="om-business-subtitle" style={{fontSize:13,lineHeight:1.35,color:'rgba(255,255,255,0.76)',margin:'5px 0 0',fontWeight:650,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{clients.length} clients · {pending} rappels · {totalValue.toLocaleString()}€</p>
        </div>
        <button onClick={()=>{setEditClient(null);setShowForm(true);}} aria-label="Ajouter un client" style={{width:42,height:42,minHeight:42,borderRadius:'50%',border:'none',background:'var(--accent)',cursor:'pointer',color:'var(--accent-text)',fontSize:26,lineHeight:1,fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 8px 20px rgba(0,0,0,0.16)'}}>+</button>
      </div>
      {/* Tabs */}
      <div style={{background:'var(--bg-surface)',borderBottom:'1px solid var(--border)',flexShrink:0,padding:'10px 10px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:7}}>
        {tabs.map(([id,lbl])=>(
          <button className="om-business-tab" key={id} onClick={()=>setTab(id)} style={{minWidth:0,padding:'10px 8px',border:'1px solid var(--border)',borderRadius:999,background:tab===id?'var(--header-bg)':'var(--bg-app)',cursor:'pointer',fontSize:13,fontWeight:tab===id?900:800,color:tab===id?'#fff':'var(--text-secondary)',boxShadow:tab===id?'0 8px 18px rgba(16,42,42,0.15)':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{lbl}</button>
        ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'12px 12px 0'}}>
          <div style={{background:'linear-gradient(135deg,#0B2F2C,#123F38)',border:'1px solid rgba(217,183,91,.34)',borderRadius:20,padding:16,boxShadow:'0 14px 32px rgba(16,42,42,.22)',marginBottom:10,color:'#fff',overflow:'hidden',position:'relative'}}>
            <div style={{position:'absolute',right:-34,top:-42,width:130,height:130,borderRadius:'50%',background:'rgba(217,183,91,.13)'}} />
            <div style={{display:'flex',alignItems:'flex-start',gap:12,position:'relative'}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:'#D9B75B',color:'#102A2A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,fontWeight:950,flexShrink:0,animation:'aiPulse 2.2s ease-in-out infinite'}}>IA</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:5}}>
                  <span style={{border:'1px solid rgba(217,183,91,.5)',background:'rgba(217,183,91,.14)',borderRadius:999,padding:'4px 9px',fontSize:11.5,fontWeight:950,color:'#F8E6A0'}}>Assistant IA Business</span>
                  <span style={{fontSize:11.5,fontWeight:850,color:'rgba(255,255,255,.68)'}}>Aperçu gratuit</span>
                </div>
                <p style={{margin:'0 0 7px',fontSize:20,fontWeight:950,lineHeight:1.12}}>Votre assistant commercial intelligent</p>
                <p style={{margin:'0 0 13px',fontSize:13,lineHeight:1.45,color:'rgba(255,255,255,.78)',fontWeight:650}}>
                  L’IA vous aide à répondre, classer les prospects, programmer les relances et comprendre les prochaines actions à faire.
                </p>
                <p style={{margin:'0 0 13px',fontSize:12.5,lineHeight:1.4,color:'#F8E6A0',fontWeight:850}}>
                  Elle suit vos règles, attend le délai choisi, puis prépare les actions clients même quand vous n’êtes pas devant l’écran.
                </p>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,position:'relative',marginBottom:12}}>
              {aiBusinessFeatures.slice(0,6).map(feature=>(
                <div key={feature} style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.10)',borderRadius:12,padding:'9px 10px',fontSize:12,lineHeight:1.35,fontWeight:750,color:'rgba(255,255,255,.88)'}}>
                  {feature}
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,position:'relative'}}>
              <button onClick={createDemoWorkspace} style={{border:'none',borderRadius:14,background:'#D9B75B',color:'#102A2A',padding:'12px 10px',fontSize:13.5,fontWeight:950,cursor:'pointer'}}>Tester avec démo</button>
              <button onClick={()=>setTab('auto')} style={{border:'1px solid rgba(255,255,255,.18)',borderRadius:14,background:'rgba(255,255,255,.10)',color:'#fff',padding:'12px 10px',fontSize:13.5,fontWeight:950,cursor:'pointer'}}>Voir Auto IA</button>
            </div>
          </div>
          <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:18,padding:14,boxShadow:'var(--shadow)',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
              <div>
                <p style={{margin:'0 0 3px',fontSize:15,fontWeight:950,color:'var(--text-primary)'}}>Essayer l’IA avant paiement</p>
                <p style={{margin:0,fontSize:12.8,lineHeight:1.38,color:'var(--text-muted)',fontWeight:650}}>Testez en conversation. L’agent ferme le test après {FREE_AI_TEST_LIMIT} essais gratuits ou 45 s d’inactivité.</p>
              </div>
              <span style={{flex:'0 0 auto',borderRadius:999,background:'#EAF4F1',color:'#102A2A',padding:'6px 9px',fontSize:11.5,fontWeight:950}}>Gratuit</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7}}>
              <button onClick={()=>previewAiMessage('reply')} style={previewButtonStyle}>Réponse IA</button>
              <button onClick={()=>previewAiMessage('followup')} style={previewButtonStyle}>Relance</button>
              <button onClick={()=>previewAiMessage('priority')} style={previewButtonStyle}>Priorité</button>
            </div>
          </div>
          <div style={{background:canUseBusinessActions?'#EAF4F1':'#FFF7ED',border:`1px solid ${canUseBusinessActions?'rgba(16,42,42,.14)':'#FED7AA'}`,borderRadius:18,padding:14,boxShadow:'var(--shadow)',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <div style={{width:40,height:40,borderRadius:14,background:canUseBusinessActions?'var(--header-bg)':'#9A3412',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>🔐</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{margin:'0 0 4px',fontSize:15,fontWeight:950,color:'var(--text-primary)',lineHeight:1.25}}>
                  {businessAccess?.isAdmin ? 'Business illimité administrateur' : canUseBusinessActions ? 'Business actif' : 'Business en mode aperçu'}
                </p>
                <p style={{margin:0,fontSize:12.8,lineHeight:1.42,color:canUseBusinessActions?'var(--text-secondary)':'#9A3412',fontWeight:750}}>
                  {businessAccess?.isAdmin
                    ? 'Aucun abonnement ni crédit IA ne sera demandé pour ce compte.'
                    : canUseBusinessActions
                      ? `Actions débloquées${businessAccess?.activeUntil ? ` jusqu’au ${new Date(businessAccess.activeUntil).toLocaleDateString('fr')}` : ''}.`
                      : `${businessBlockedText || 'Vous pouvez consulter et tester l’interface. Les actions réelles demandent Business actif et crédit IA.'}`}
                </p>
              </div>
            </div>
            {!canUseBusinessActions && !businessAccess?.isAdmin && (
              <div style={{marginTop:12,display:'grid',gap:9}}>
                <button onClick={payBusinessSubscription} disabled={payingBusiness || !token} style={{width:'100%',border:'none',borderRadius:13,background:'var(--header-bg)',color:'#fff',padding:'12px 14px',fontSize:14,fontWeight:950,cursor:token?'pointer':'default',opacity:token?1:.5}}>
                  {payingBusiness ? 'Ouverture du paiement...' : 'Activer par Paystack'}
                </button>
                {westernUnion?.available !== false && (
                  <button onClick={openWesternUnionPanel} disabled={!token} style={{width:'100%',border:'2px solid #F6C800',borderRadius:13,background:'#111',color:'#F6C800',padding:'11px 14px',fontSize:14,fontWeight:950,cursor:token?'pointer':'default',opacity:token?1:.5,display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                    <img src="/icons/western-union-logo.svg" alt="Western Union" style={{height:26,width:'auto',display:'block'}} />
                    <span>Payer par Western Union - 50 000 FCFA</span>
                  </button>
                )}
              </div>
            )}
            {canUseBusinessActions && businessAccess?.premiumBadge && (
              <div style={{marginTop:12,display:'inline-flex',alignItems:'center',gap:8,border:'1px solid rgba(37,99,235,.28)',background:'#DBEAFE',color:'#1D4ED8',borderRadius:999,padding:'7px 11px',fontSize:12.5,fontWeight:950}}>
                ✓ Compte premium vérifié
              </div>
            )}
          </div>
          {wuOpen && (
            <div style={{background:'#fff',border:'2px solid #F6C800',borderRadius:18,padding:14,boxShadow:'0 18px 46px rgba(0,0,0,.16)',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <img src="/icons/western-union-logo.svg" alt="Western Union" style={{width:78,height:'auto',display:'block',flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:'0 0 3px',fontSize:17,fontWeight:950,color:'var(--text-primary)'}}>Payer par Western Union</p>
                  <p style={{margin:0,fontSize:12.5,lineHeight:1.35,color:'var(--text-muted)',fontWeight:750}}>Forfait entreprise Messenger · réservé hors Côte d’Ivoire</p>
                </div>
                <button onClick={()=>setWuOpen(false)} style={{border:'none',background:'var(--bg-input)',borderRadius:999,width:32,height:32,cursor:'pointer',fontSize:18,fontWeight:900,color:'var(--text-primary)'}}>×</button>
              </div>

              <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:14,padding:12,marginBottom:12}}>
                <p style={{margin:'0 0 8px',fontSize:13.5,fontWeight:950,color:'#92400E'}}>Instructions de paiement</p>
                {(westernUnion?.instructions || []).map((line:string)=>(
                  <p key={line} style={{margin:'0 0 5px',fontSize:12.5,lineHeight:1.4,color:'#92400E',fontWeight:750}}>• {line}</p>
                ))}
                <div style={{display:'grid',gridTemplateColumns:'1fr',gap:6,marginTop:10}}>
                  <p style={{margin:0,fontSize:13,fontWeight:900,color:'var(--text-primary)'}}>Bénéficiaire : {westernUnion?.config?.beneficiaryFullName || '—'}</p>
                  <p style={{margin:0,fontSize:13,fontWeight:900,color:'var(--text-primary)'}}>Téléphone : {westernUnion?.config?.beneficiaryPhone || '—'}</p>
                  <p style={{margin:0,fontSize:13,fontWeight:900,color:'var(--text-primary)'}}>Pays : {westernUnion?.config?.beneficiaryCountry || '—'}</p>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:12}}>
                {[
                  `IA ${Number(westernUnion?.config?.dailyAiWords || 8000).toLocaleString('fr-FR')} mots/jour`,
                  '1 session conférence/semaine',
                  '3 vidéos 45s/semaine',
                  '6 flyers/semaine',
                  'Badge bleu vérifié',
                  'Assistance administrateur directe',
                ].map(item=>(
                  <div key={item} style={{border:'1px solid var(--border)',borderRadius:12,padding:'9px 10px',fontSize:12.2,lineHeight:1.3,fontWeight:850,color:'var(--text-secondary)',background:'var(--bg-input)'}}>{item}</div>
                ))}
              </div>

              <div style={{display:'grid',gap:9}}>
                <input value={wuForm.transactionNumber} onChange={e=>setWuForm(v=>({...v,transactionNumber:e.target.value.toUpperCase()}))} placeholder="Numéro de transaction Western Union" style={wuInputStyle}/>
                <input value={wuForm.senderFullName} onChange={e=>setWuForm(v=>({...v,senderFullName:e.target.value}))} placeholder="Votre nom complet sur le reçu" style={wuInputStyle}/>
                <input value={wuForm.senderCountry} onChange={e=>setWuForm(v=>({...v,senderCountry:e.target.value}))} placeholder="Votre pays d’envoi" style={wuInputStyle}/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <input value={wuForm.amountFcfa} onChange={e=>setWuForm(v=>({...v,amountFcfa:e.target.value.replace(/\D/g,'')}))} placeholder="50000" inputMode="numeric" style={wuInputStyle}/>
                  <input value={wuForm.paymentDate} onChange={e=>setWuForm(v=>({...v,paymentDate:e.target.value}))} placeholder="YYYY-MM-DD" style={wuInputStyle}/>
                </div>
                <input ref={wuCameraRef} type="file" accept="image/*" capture="environment" onChange={e=>pickWesternUnionReceipt(e.target.files?.[0])} style={{display:'none'}}/>
                <button onClick={()=>wuCameraRef.current?.click()} style={{border:'none',borderRadius:13,background:'#F6C800',color:'#111',padding:'12px 14px',fontSize:14,fontWeight:950,cursor:'pointer'}}>
                  {wuForm.receiptDataUrl ? 'Reprendre la photo du reçu' : 'Ouvrir la caméra pour photographier le reçu'}
                </button>
                {wuForm.receiptDataUrl && (
                  <p style={{margin:0,fontSize:12.5,color:'#047857',fontWeight:850}}>Photo prête : {wuForm.width || '—'} x {wuForm.height || '—'}</p>
                )}
                <button onClick={submitWesternUnionReceipt} disabled={wuReceiptStatus==='submitting'} style={{border:'none',borderRadius:13,background:'#102A2A',color:'#fff',padding:'13px 14px',fontSize:14,fontWeight:950,cursor:wuReceiptStatus==='submitting'?'wait':'pointer',opacity:wuReceiptStatus==='submitting'?0.65:1}}>
                  {wuReceiptStatus==='submitting' ? 'Vérification en deux contrôles...' : 'Envoyer mon reçu Western Union'}
                </button>
                {wuMessage && (
                  <p style={{margin:0,borderRadius:12,padding:'10px 11px',fontSize:12.5,lineHeight:1.4,fontWeight:800,background:wuReceiptStatus==='approved'?'#DCFCE7':wuReceiptStatus==='rejected'||wuReceiptStatus==='error'?'#FEE2E2':'#EFF6FF',color:wuReceiptStatus==='approved'?'#166534':wuReceiptStatus==='rejected'||wuReceiptStatus==='error'?'#991B1B':'#1D4ED8'}}>
                    {wuMessage}
                  </p>
                )}
              </div>
            </div>
          )}
          <div style={{background:'linear-gradient(135deg, #102A2A, #17413C)',borderRadius:18,padding:16,boxShadow:'0 12px 28px rgba(16,42,42,0.18)',color:'#fff',marginBottom:10}}>
            <p style={{margin:'0 0 5px',fontSize:18,fontWeight:950,lineHeight:1.15}}>Commencez votre business ici</p>
            <p style={{margin:'0 0 13px',fontSize:13,lineHeight:1.4,color:'rgba(255,255,255,.78)',fontWeight:650}}>
              Ajoutez un client, donnez-lui un statut, puis programmez la prochaine relance.
            </p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:8}}>
              <button onClick={()=>{setEditClient(null);setShowForm(true);}} style={{border:'none',borderRadius:14,background:'#D9B75B',color:'#102A2A',padding:'11px 8px',fontSize:12.5,fontWeight:950,cursor:'pointer',lineHeight:1.15}}>+ Client</button>
              <button onClick={()=>setTab('reminders')} style={{border:'1px solid rgba(255,255,255,.18)',borderRadius:14,background:'rgba(255,255,255,.10)',color:'#fff',padding:'11px 8px',fontSize:12.5,fontWeight:900,cursor:'pointer',lineHeight:1.15}}>Rappels</button>
              <button onClick={()=>setTab('stats')} style={{border:'1px solid rgba(255,255,255,.18)',borderRadius:14,background:'rgba(255,255,255,.10)',color:'#fff',padding:'11px 8px',fontSize:12.5,fontWeight:900,cursor:'pointer',lineHeight:1.15}}>Stats</button>
            </div>
          </div>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:18,padding:14,boxShadow:'var(--shadow)'}}>
            <button onClick={()=>setGuideOpen(v=>!v)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,border:'none',background:'transparent',padding:0,cursor:'pointer',textAlign:'left'}}>
              <span style={{width:38,height:38,borderRadius:14,background:'rgba(16,42,42,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>💼</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{margin:0,fontSize:15,fontWeight:900,color:'var(--text-primary)',lineHeight:1.2}}>Mode d'emploi rapide</p>
                <p style={{margin:'3px 0 0',fontSize:12.5,color:'var(--text-secondary)',fontWeight:650,lineHeight:1.35}}>À utiliser comme un carnet client intelligent.</p>
              </div>
              <span style={{fontSize:18,color:'var(--text-muted)',transform:guideOpen?'rotate(180deg)':'none',transition:'transform .18s'}}>⌄</span>
            </button>
            {guideOpen&&(
              <div style={{marginTop:12,borderTop:'1px solid var(--border)',paddingTop:12}}>
                <div style={{display:'grid',gap:8,marginBottom:12}}>
                  {[
                    '1. Clients : ajoutez les personnes à suivre.',
                    '2. Statut : chaud, froid, payé, VIP ou à relancer.',
                    '3. Rappels : notez la prochaine action à faire.',
                    '4. Auto : préparez vos messages et liens de paiement.',
                  ].map(line=><p key={line} style={{margin:0,fontSize:12.8,lineHeight:1.45,color:'var(--text-secondary)',fontWeight:650}}>{line}</p>)}
                </div>
                <p style={{margin:'0 0 6px',fontSize:12,fontWeight:900,color:'var(--brand)',textTransform:'uppercase',letterSpacing:.4}}>Votre lien à partager</p>
                <div style={{background:'#F8FAFC',border:'1px solid var(--border)',borderRadius:12,padding:'10px 12px',marginBottom:10}}>
                  <p style={{margin:0,fontSize:12.5,lineHeight:1.45,color:'var(--text-primary)',fontWeight:800,wordBreak:'break-all'}}>{businessLink}</p>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={copyBusinessLink} style={{flex:1,border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'10px 8px',fontSize:13,fontWeight:900,color:'var(--text-primary)',cursor:'pointer'}}>📋 Copier</button>
                  <button onClick={shareBusinessLink} style={{flex:1,border:'none',background:'var(--header-bg)',borderRadius:12,padding:'10px 8px',fontSize:13,fontWeight:900,color:'#fff',cursor:'pointer'}}>📤 Partager</button>
                </div>
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  <button onClick={exportClientsCsv} disabled={!clients.length} style={{flex:1,border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'10px 8px',fontSize:13,fontWeight:900,color:'var(--text-primary)',cursor:clients.length?'pointer':'default',opacity:clients.length?1:.48}}>CSV</button>
                  <button onClick={exportClientsExcel} disabled={!clients.length} style={{flex:1,border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'10px 8px',fontSize:13,fontWeight:900,color:'var(--text-primary)',cursor:clients.length?'pointer':'default',opacity:clients.length?1:.48}}>Excel</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {tab==='clients'&&(
          <>
            {/* Search + filter */}
            <div style={{padding:'12px 12px 10px',background:'var(--bg-surface)',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:9,background:'var(--bg-app)',border:'1px solid var(--border)',borderRadius:22,padding:'9px 13px',marginBottom:9}}>
                <svg width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" viewBox="0 0 24 24" style={{flexShrink:0}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m1.7-4.8a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/>
                </svg>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un client" style={{flex:1,minWidth:0,border:'none',outline:'none',background:'transparent',fontSize:15,color:'var(--text-primary)',fontWeight:500}}/>
              </div>
              <div className="om-business-scroll" style={{display:'flex',gap:7,overflowX:'auto',WebkitOverflowScrolling:'touch',padding:'2px 2px 6px',margin:'0 -2px'}}>
                {filterOrder.map(t=>(
                  <button className="om-business-chip" key={t} onClick={()=>setFilterTag(t as any)} style={{flex:'0 0 auto',maxWidth:150,padding:'8px 13px',borderRadius:999,border:'1px solid var(--border)',background:filterTag===t?'var(--header-bg)':'var(--bg-app)',color:filterTag===t?'#fff':'var(--text-primary)',fontSize:13,cursor:'pointer',fontWeight:850,whiteSpace:'nowrap',boxShadow:filterTag===t?'0 6px 14px rgba(16,42,42,0.13)':'none'}}>
                    {t==='all'?'Tous':TAG_META[t as Tag].label}
                  </button>
                ))}
              </div>
            </div>
            {filtered.length===0?(
              <div style={{minHeight:'48vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'34px 28px',textAlign:'center',color:'var(--text-muted)'}}>
                <div style={{width:72,height:72,borderRadius:24,background:'rgba(16,42,42,0.08)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16,color:'var(--header-bg)'}}>
                  <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V6a3 3 0 116 0v1m-9 4h12M5 7h14a2 2 0 012 2v8a3 3 0 01-3 3H6a3 3 0 01-3-3V9a2 2 0 012-2z"/>
                  </svg>
                </div>
                <p style={{fontWeight:900,color:'var(--text-primary)',fontSize:18,lineHeight:1.2,margin:'0 0 7px'}}>Aucun client</p>
                <p style={{fontSize:14,lineHeight:1.45,margin:'0 0 18px',maxWidth:280}}>Ajoutez votre premier client pour suivre vos rappels, relances et paiements.</p>
                <button onClick={()=>{setEditClient(null);setShowForm(true);}} style={{border:'none',borderRadius:999,background:'var(--header-bg)',color:'#fff',padding:'12px 18px',fontSize:14,fontWeight:900,cursor:'pointer',boxShadow:'0 8px 18px rgba(16,42,42,0.15)'}}>Ajouter un client</button>
              </div>
            ):(
              filtered.map(c=>(
                <div key={c.id} style={{background:'var(--bg-surface)',margin:'4px 8px',borderRadius:16,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                    <div style={{width:48,height:48,borderRadius:'50%',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:20,flexShrink:0}}>{c.name[0]?.toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',margin:0}}>{c.name}</p>
                        {c.value>0&&<span style={{fontSize:12,color:'var(--accent-text)',fontWeight:600}}>{c.value.toLocaleString()}€</span>}
                      </div>
                      {c.phone&&<p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 4px'}}>{c.phone}</p>}
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>
                        {c.tags.map(t=>(
                          <span key={t} style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:TAG_META[t].bg,color:TAG_META[t].color,fontWeight:600}}>{TAG_META[t].label}</span>
                        ))}
                      </div>
                      {c.notes&&<p style={{fontSize:12,color:'var(--text-secondary)',margin:'0 0 8px',lineHeight:1.4}}>{c.notes}</p>}
                      {c.nextReminder&&<p style={{fontSize:11,color:'#e65100',margin:'0 0 8px'}}>⏰ Rappel : {new Date(c.nextReminder).toLocaleDateString('fr')}</p>}
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <button onClick={()=>{setEditClient(c);setShowForm(true);}} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'var(--text-primary)'}}>✏️ Modifier</button>
                        <button onClick={()=>{setShowRemind(c);setRemDate('');setRemNote('');}} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'var(--text-primary)'}}>⏰ Rappel</button>
                        {c.phone&&<button onClick={()=>openClientMessage(c)} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'none',background:'#25D366',cursor:'pointer',color:'#fff'}}>💬 Envoyer</button>}
                        <button onClick={()=>saveC(clients.filter(x=>x.id!==c.id))} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'none',background:'#fce4ec',cursor:'pointer',color:'#c62828'}}>🗑</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
        {tab==='reminders'&&(
          <div style={{padding:8}}>
            {reminders.length===0?(
              <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}><div style={{fontSize:48}}>⏰</div><p>Aucun rappel programmé</p></div>
            ):(
              reminders.sort((a,b)=>reminderTimestamp(a.date)-reminderTimestamp(b.date)).map(r=>{
                const overdue=!r.done&&reminderTimestamp(r.date)<Date.now();
                const soon=!r.done&&(reminderTimestamp(r.date)-Date.now())<172800000;
                return(
                  <div key={r.id} style={{background:'var(--bg-surface)',margin:'4px 0',borderRadius:16,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',opacity:r.done?0.5:1,borderLeft:`4px solid ${overdue?'#c62828':soon?'#e65100':'var(--accent)'}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1}}>
                        <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',margin:'0 0 2px'}}>{r.clientName}</p>
                        <p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 4px'}}>{r.note}</p>
                        <p style={{fontSize:12,color:overdue?'#c62828':soon?'#e65100':'var(--accent)',fontWeight:600,margin:0}}>
                          {overdue?'⚠️ En retard':'📅'} {reminderDateLabel(r.date)}
                        </p>
                      </div>
                      {!r.done&&<button onClick={()=>saveR(reminders.map(x=>x.id===r.id?{...x,done:true}:x))} style={{background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:10,padding:'6px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>✓ Fait</button>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        {tab==='stats'&&(
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                {label:'Total clients',value:clients.length,icon:'👥',color:'var(--accent-text)'},
                {label:'CA encaissé',value:`${paidValue.toLocaleString()}€`,icon:'💰',color:'#2e7d32'},
                {label:'Prévisionnel',value:`${forecastValue.toLocaleString()}€`,icon:'📈',color:'#1565c0'},
                {label:'Rappels actifs',value:pending,icon:'⏰',color:'#e65100'},
                {label:'Conversion',value:`${conversionRate}%`,icon:'🎯',color:'#c62828'},
              ].map(s=>(
                <div key={s.label} style={{background:'var(--bg-surface)',borderRadius:16,padding:'16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',textAlign:'center'}}>
                  <div style={{fontSize:32,marginBottom:6}}>{s.icon}</div>
                  <p style={{fontSize:22,fontWeight:800,color:s.color,margin:'0 0 4px'}}>{s.value}</p>
                  <p style={{fontSize:12,color:'var(--text-muted)',margin:0}}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{background:'var(--bg-surface)',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',marginBottom:12}}>Répartition par statut</p>
              {Object.entries(TAG_META).map(([t,meta])=>{
                const count=clients.filter(c=>c.tags.includes(t as Tag)).length;
                const pct=clients.length?Math.round(count/clients.length*100):0;
                return(
                  <div key={t} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:13,color:'var(--text-primary)'}}>{meta.label}</span>
                      <span style={{fontSize:13,fontWeight:600,color:meta.color}}>{count}</span>
                    </div>
                    <div style={{height:6,background:'var(--bg-app)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:meta.color,borderRadius:3,transition:'width 0.5s'}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:'var(--bg-surface)',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',margin:'0 0 10px'}}>Sécurité des données</p>
              <p style={{fontSize:13,lineHeight:1.5,color:'var(--text-muted)',margin:'0 0 12px'}}>Exportez votre portefeuille clients pour garder une sauvegarde locale.</p>
              <div style={{display:'flex',gap:8}}>
                <button onClick={exportClientsCsv} disabled={!clients.length} style={{flex:1,border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'11px 8px',fontSize:13,fontWeight:900,color:'var(--text-primary)',cursor:clients.length?'pointer':'default',opacity:clients.length?1:.48}}>Exporter CSV</button>
                <button onClick={exportClientsExcel} disabled={!clients.length} style={{flex:1,border:'none',background:'var(--header-bg)',borderRadius:12,padding:'11px 8px',fontSize:13,fontWeight:900,color:'#fff',cursor:clients.length?'pointer':'default',opacity:clients.length?1:.48}}>Exporter Excel</button>
              </div>
            </div>
          </div>
        )}
        {tab==='auto'&&(
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:'linear-gradient(135deg,#102A2A,#246A5D)',borderRadius:16,padding:16,boxShadow:'0 10px 24px rgba(16,42,42,.16)',color:'#fff'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{width:38,height:38,borderRadius:'50%',background:'#D9B75B',color:'#102A2A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:950}}>IA</span>
                <div>
                  <p style={{margin:0,fontSize:16,fontWeight:950}}>Automatisation commerciale</p>
                  <p style={{margin:'2px 0 0',fontSize:12.5,color:'rgba(255,255,255,.72)',fontWeight:700}}>L’IA prépare, classe et suggère. Vous gardez le contrôle final.</p>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7}}>
                <button onClick={()=>previewAiMessage('reply')} style={{...previewButtonStyle,background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',color:'#fff'}}>Tester réponse</button>
                <button onClick={()=>previewAiMessage('followup')} style={{...previewButtonStyle,background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',color:'#fff'}}>Tester relance</button>
                <button onClick={()=>previewAiMessage('priority')} style={{...previewButtonStyle,background:'rgba(255,255,255,.10)',border:'1px solid rgba(255,255,255,.16)',color:'#fff'}}>Voir priorité</button>
              </div>
            </div>
            <div style={{background:'var(--bg-surface)',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',margin:'0 0 4px'}}>⚙️ Accueil automatique</p>
              <p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 12px',lineHeight:1.5}}>Message type utilisé pour accueillir ou relancer un prospect. Variables disponibles : {'{nom}'}, {'{lien}'}, {'{montant}'}, {'{paiement}'}.</p>
              <textarea
                value={autoSettings.welcomeMessage}
                onChange={e=>saveAuto({...autoSettings,welcomeMessage:e.target.value})}
                rows={3}
                style={{width:'100%',border:'1px solid var(--border)',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box'}}
              />
            </div>
            <div style={{background:'var(--bg-surface)',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',marginBottom:4}}>🤖 Messages automatiques</p>
              <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:16,lineHeight:1.5}}>Configurez un message personnalisé par client. Vous gardez toujours la main : le message s’ouvre prêt à envoyer.</p>
              {clients.map(c=>(
                <div key={c.id} style={{borderBottom:'1px solid var(--bg-app)',paddingBottom:12,marginBottom:12}}>
                  <p style={{fontWeight:600,fontSize:14,color:'var(--text-primary)',marginBottom:6}}>{c.name}</p>
                  <textarea
                    defaultValue={c.autoMessage||formatTemplate(autoSettings.welcomeMessage,c)}
                    onBlur={e=>{const updated=clients.map(x=>x.id===c.id?{...x,autoMessage:e.target.value}:x);saveC(updated);}}
                    rows={2} style={{width:'100%',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',resize:'none',boxSizing:'border-box',marginBottom:6}}/>
                  {c.phone&&<button onClick={()=>openClientMessage(c)} style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'6px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>📤 Ouvrir le message</button>}
                </div>
              ))}
              {clients.length===0&&<p style={{color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>Ajoutez des clients pour configurer les messages auto.</p>}
            </div>
            <div style={{background:'var(--bg-surface)',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',margin:'0 0 4px'}}>💳 Paiements</p>
              <p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 12px',lineHeight:1.5}}>Collez ici votre lien CinetPay, Babimo, Flutterwave ou autre. Il sera ajouté dans les messages avec {'{paiement}'}.</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <select value={autoSettings.paymentProvider} onChange={e=>saveAuto({...autoSettings,paymentProvider:e.target.value})} style={{border:'1px solid var(--border)',borderRadius:12,padding:'10px 12px',fontSize:13,background:'var(--bg-app)',color:'var(--text-primary)',fontWeight:800}}>
                  <option>CinetPay</option>
                  <option>Babimo</option>
                  <option>Flutterwave</option>
                  <option>Autre</option>
                </select>
                <button onClick={()=>navigator.clipboard?.writeText('{paiement}').then(()=>notify('Variable copiée.', 'success'))} style={{border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'10px 8px',fontSize:13,fontWeight:900,color:'var(--text-primary)',cursor:'pointer'}}>Copier {'{paiement}'}</button>
              </div>
              <input value={autoSettings.paymentLink} onChange={e=>saveAuto({...autoSettings,paymentLink:e.target.value})} placeholder="https://lien-de-paiement..." style={{width:'100%',border:'1px solid var(--border)',borderRadius:12,padding:'10px 12px',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{background:'var(--bg-surface)',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',marginBottom:4}}>📋 Clients à relancer</p>
              {clients.filter(c=>c.tags.includes('relancer')).map(c=>(
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--bg-app)'}}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:'#fce4ec',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,color:'#c62828',flexShrink:0}}>{c.name[0]}</div>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:600,fontSize:14,color:'var(--text-primary)',margin:0}}>{c.name}</p>
                    <p style={{fontSize:12,color:'var(--text-muted)',margin:0}}>{c.phone}</p>
                  </div>
                  {c.phone&&<button onClick={()=>openClientMessage(c)} style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'6px 12px',cursor:'pointer',fontSize:12}}>💬</button>}
                </div>
              ))}
              {clients.filter(c=>c.tags.includes('relancer')).length===0&&<p style={{color:'var(--text-muted)',fontSize:13}}>Aucun client à relancer.</p>}
            </div>
          </div>
        )}
      </div>

      <BusinessAiPanel
        open={aiPanelOpen}
        notice={aiPanelNotice}
        messages={aiConversation}
        onClose={()=>setAiPanelOpen(false)}
      />

      {/* Modal rappel */}
      {showRemind&&(
        <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end'}}>
          <div style={{width:'100%',background:'var(--bg-surface)',borderRadius:'20px 20px 0 0',padding:24}}>
            <h3 style={{fontSize:17,fontWeight:700,color:'var(--text-primary)',margin:'0 0 16px'}}>⏰ Rappel pour {showRemind.name}</h3>
            <input type="datetime-local" value={remDate} onChange={e=>setRemDate(e.target.value)} min={new Date().toISOString().slice(0,16)}
              style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid var(--border)',fontSize:15,outline:'none',marginBottom:12,boxSizing:'border-box'}}/>
            <textarea value={remNote} onChange={e=>setRemNote(e.target.value)} placeholder="Note du rappel…" rows={3}
              style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid var(--border)',fontSize:14,outline:'none',resize:'none',marginBottom:16,boxSizing:'border-box'}}/>
            <button onClick={()=>{
              if(!requireBusinessAccess())return;
              if(!remDate)return;
              const r:Reminder={id:`rem_${Date.now()}`,clientId:showRemind.id,clientName:showRemind.name,date:remDate,note:remNote,done:false};
              saveR([...reminders,r]);
              saveC(clients.map(c=>c.id===showRemind.id?{...c,nextReminder:remDate,reminderNote:remNote}:c));
              if('Notification' in window&&Notification.permission!=='granted') Notification.requestPermission().catch(()=>{});
              notify('Rappel client programmé.', 'success');
              setShowRemind(null);
            }} style={{width:'100%',background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:14,padding:16,fontSize:16,fontWeight:700,cursor:'pointer',marginBottom:10}}>
              Programmer le rappel
            </button>
            <button onClick={()=>setShowRemind(null)} style={{width:'100%',background:'transparent',border:'1px solid var(--border)',borderRadius:14,padding:14,fontSize:15,color:'var(--text-secondary)',cursor:'pointer'}}>Annuler</button>
          </div>
        </div>
      )}

      {/* Modal client */}
      {showForm&&<ClientForm initial={editClient} onSave={c=>{
        const updated=editClient?clients.map(x=>x.id===c.id?c:x):[...clients,{...c,id:`cli_${Date.now()}`,createdAt:new Date().toISOString()}];
        saveC(updated);setShowForm(false);
      }} onClose={()=>setShowForm(false)}/>}
    </div>
  );
}

const previewButtonStyle: CSSProperties = {
  border:'1px solid var(--border)',
  borderRadius:12,
  background:'var(--bg-app)',
  color:'var(--text-primary)',
  padding:'10px 7px',
  fontSize:12.5,
  fontWeight:900,
  cursor:'pointer',
  minHeight:42,
};

const wuInputStyle: CSSProperties = {
  width:'100%',
  boxSizing:'border-box',
  border:'1px solid var(--border)',
  borderRadius:12,
  background:'var(--bg-input)',
  color:'var(--text-primary)',
  padding:'11px 12px',
  fontSize:13.5,
  fontWeight:800,
  outline:'none',
};

function BusinessAiPanel({open, notice, messages, onClose}:{open:boolean;notice:string;messages:BusinessAiMessage[];onClose:()=>void}) {
  if(!open)return null;
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:420,background:'rgba(5,18,18,.58)',display:'flex',alignItems:'flex-end',padding:'0 10px 10px'}}>
      <div onClick={event=>event.stopPropagation()} style={{width:'100%',maxWidth:560,margin:'0 auto',background:'#fff',borderRadius:'22px 22px 18px 18px',boxShadow:'0 24px 70px rgba(0,0,0,.30)',overflow:'hidden',border:'1px solid rgba(255,255,255,.55)'}}>
        <div style={{background:'linear-gradient(135deg,#102A2A,#246A5D)',color:'#fff',padding:16,display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:42,height:42,borderRadius:14,background:'#D9B75B',color:'#102A2A',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:950,flexShrink:0}}>IA</div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{margin:0,fontSize:17,fontWeight:950}}>Test assistant Business</p>
            <p style={{margin:'3px 0 0',fontSize:12.5,color:'rgba(255,255,255,.74)',fontWeight:700}}>Simulation client / agent IA</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{width:36,height:36,borderRadius:'50%',border:'1px solid rgba(255,255,255,.18)',background:'rgba(255,255,255,.10)',color:'#fff',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{padding:14,maxHeight:'58vh',overflowY:'auto',background:'#F8FAFC'}}>
          {notice&&<div style={{margin:'0 0 12px',border:'1px solid rgba(217,183,91,.45)',background:'#FFF9E8',color:'#7A4F00',borderRadius:12,padding:'9px 11px',fontSize:12.5,lineHeight:1.4,fontWeight:800}}>{notice}</div>}
          <div style={{display:'grid',gap:10}}>
            {messages.map((message,index)=>{
              const isClient=message.role==='client';
              const isSystem=message.role==='system';
              return(
                <div key={`${message.role}-${index}`} style={{display:'flex',justifyContent:isClient?'flex-end':'flex-start'}}>
                  <div style={{maxWidth:'82%',borderRadius:isClient?'16px 16px 4px 16px':'16px 16px 16px 4px',background:isClient?'#102A2A':isSystem?'#FEF2F2':'#fff',color:isClient?'#fff':isSystem?'#991B1B':'var(--text-primary)',border:isClient?'none':`1px solid ${isSystem?'#FECACA':'var(--border)'}`,padding:'10px 12px',boxShadow:isClient?'0 10px 24px rgba(16,42,42,.16)':'0 1px 3px rgba(0,0,0,.05)'}}>
                    <p style={{margin:'0 0 4px',fontSize:11,fontWeight:950,color:isClient?'rgba(255,255,255,.68)':isSystem?'#B42318':'var(--brand)',textTransform:'uppercase'}}>{isClient?'Client':isSystem?'Système':'Agent IA'}</p>
                    <p style={{margin:0,fontSize:13.5,lineHeight:1.48,fontWeight:650,whiteSpace:'pre-wrap'}}>{message.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientForm({initial,onSave,onClose}:{initial:Client|null;onSave:(c:Client)=>void;onClose:()=>void}) {
  const [name,setName]=useState(initial?.name||'');
  const [phone,setPhone]=useState(initial?.phone||'');
  const [email,setEmail]=useState(initial?.email||'');
  const [notes,setNotes]=useState(initial?.notes||'');
  const [value,setValue]=useState(String(initial?.value||0));
  const [tags,setTags]=useState<Tag[]>(initial?.tags||[]);

  function toggleTag(t:Tag){setTags(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]);}

  return(
    <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end'}}>
      <div style={{width:'100%',background:'var(--bg-surface)',borderRadius:'20px 20px 0 0',padding:24,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <button onClick={onClose} style={{border:'none',background:'transparent',cursor:'pointer',fontSize:22,color:'var(--text-primary)'}}>×</button>
          <h3 style={{margin:0,fontSize:18,fontWeight:700,color:'var(--text-primary)',flex:1}}>{initial?'Modifier':'Nouveau client'}</h3>
          <button onClick={()=>{if(!name.trim())return;onSave({id:initial?.id||'',name,phone,email,notes,tags,value:Number(value)||0,createdAt:initial?.createdAt||new Date().toISOString()});}}
            style={{background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:12,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:14}}>Sauver</button>
        </div>
        {[{label:'Nom *',val:name,set:setName,ph:'Nom du client'},{label:'Téléphone',val:phone,set:setPhone,ph:'+225 07...'},{label:'Email',val:email,set:setEmail,ph:'email@...'},{label:'Valeur (€)',val:value,set:setValue,ph:'0'}].map(f=>(
          <div key={f.label} style={{marginBottom:12}}>
            <p style={{fontSize:12,fontWeight:850,color:'var(--brand)',margin:'0 0 4px',textTransform:'uppercase',letterSpacing:0.5}}>{f.label}</p>
            <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
              style={{width:'100%',padding:'10px 14px',borderRadius:12,border:'1px solid var(--border)',fontSize:15,outline:'none',boxSizing:'border-box'}}/>
          </div>
        ))}
        <p style={{fontSize:12,fontWeight:850,color:'var(--brand)',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:0.5}}>Tags</p>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {(Object.keys(TAG_META) as Tag[]).map(t=>(
            <button key={t} onClick={()=>toggleTag(t)} style={{padding:'5px 12px',borderRadius:16,border:'none',background:tags.includes(t)?TAG_META[t].bg:'var(--bg-app)',color:tags.includes(t)?TAG_META[t].color:'var(--text-muted)',fontSize:12,cursor:'pointer',fontWeight:tags.includes(t)?700:400}}>
              {TAG_META[t].label}
            </button>
          ))}
        </div>
        <p style={{fontSize:12,fontWeight:850,color:'var(--brand)',margin:'0 0 4px',textTransform:'uppercase',letterSpacing:0.5}}>Notes</p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Notes sur ce client…"
          style={{width:'100%',padding:'10px 14px',borderRadius:12,border:'1px solid var(--border)',fontSize:14,outline:'none',resize:'none',boxSizing:'border-box'}}/>
      </div>
    </div>
  );
}

function Spinner(){return(<div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-app)'}}><div style={{width:32,height:32,border:'3px solid var(--border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);}
