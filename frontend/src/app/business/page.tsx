'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { matchesSearch } from '../../lib/search';

type Tag = 'chaud'|'froid'|'payé'|'relancer'|'prospect'|'vip'|'perdu';
interface Client {
  id:string; name:string; phone:string; email:string; tags:Tag[];
  notes:string; nextReminder?:string; reminderNote?:string;
  autoMessage?:string; value:number; createdAt:string;
}
interface Reminder { id:string; clientId:string; clientName:string; date:string; note:string; done:boolean; }
interface AutoSettings { welcomeMessage:string; paymentProvider:string; paymentLink:string; }

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
  ['auto', 'Auto'],
] as const;

const filterOrder = ['all', 'chaud', 'froid', 'payé', 'relancer', 'prospect', 'vip', 'perdu'] as const;

function ld<T>(k:string,d:T):T{if(typeof window==='undefined')return d;try{return JSON.parse(localStorage.getItem(k)??'null')??d;}catch{return d;}}
function sv(k:string,v:any){if(typeof window!=='undefined')localStorage.setItem(k,JSON.stringify(v));}
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

export default function BusinessPage() {
  const {data:session,status}=useSession();
  const router=useRouter();
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
  const [guideOpen,setGuideOpen]=useState(true);
  const [autoSettings,setAutoSettings]=useState<AutoSettings>({welcomeMessage:'Bonjour {nom}, merci pour votre intérêt. Je reviens vers vous rapidement.',paymentProvider:'Flutterwave',paymentLink:''});
  const username=(session?.user as any)?.username ?? '';
  const businessLink=username
    ? `https://messenger.oracle-plus.online/u/${encodeURIComponent(username)}`
    : 'https://messenger.oracle-plus.online/install';

  useEffect(()=>{setMounted(true);if(status==='unauthenticated')router.replace('/login');},[status]);
  useEffect(()=>{if(!mounted)return;setClients(ld('oracle-crm',[]) );setReminders(ld('oracle-rem',[]));setAutoSettings(ld('oracle-crm-auto',{welcomeMessage:'Bonjour {nom}, merci pour votre intérêt. Je reviens vers vous rapidement.',paymentProvider:'Flutterwave',paymentLink:''}));checkReminders();},[mounted]);

  function checkReminders(){
    const rems:Reminder[]=ld('oracle-rem',[]);
    const now=new Date();
    rems.filter(r=>!r.done).forEach(r=>{
      const diff=(new Date(r.date).getTime()-now.getTime())/(86400000);
      if(diff<=2&&diff>=0&&'Notification' in window&&Notification.permission==='granted'){
        new Notification(`⏰ Rappel : ${r.clientName}`,{body:r.note,icon:'/icons/icon-192-v20260804.png'});
      }
    });
  }

  function saveC(list:Client[]){setClients(list);sv('oracle-crm',list);}
  function saveR(list:Reminder[]){setReminders(list);sv('oracle-rem',list);}
  function saveAuto(next:AutoSettings){setAutoSettings(next);sv('oracle-crm-auto',next);}
  function copyBusinessLink(){navigator.clipboard?.writeText(businessLink).then(()=>alert('Lien copié !')).catch(()=>{});}
  function shareBusinessLink(){navigator.share?.({title:'Oracle Messenger',text:'Contactez-moi directement sur Oracle Messenger.',url:businessLink}).catch(()=>copyBusinessLink());}
  function formatTemplate(template:string, client?:Client){
    return template
      .replace(/\{nom\}/gi, client?.name || 'client')
      .replace(/\{lien\}/gi, businessLink)
      .replace(/\{montant\}/gi, client?.value ? `${client.value.toLocaleString()}€` : '')
      .replace(/\{paiement\}/gi, autoSettings.paymentLink || '');
  }
  function exportClientsCsv(){
    const rows=[
      ['Nom','Téléphone','Email','Tags','Valeur','Notes','Prochain rappel','Message auto','Créé le'],
      ...clients.map(c=>[c.name,c.phone,c.email,c.tags.join(' | '),c.value,c.notes,c.nextReminder||'',c.autoMessage||'',c.createdAt]),
    ];
    downloadTextFile(`oracle-crm-clients-${new Date().toISOString().slice(0,10)}.csv`, rows.map(r=>r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }
  function exportClientsExcel(){
    const rows=clients.map(c=>`<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.email}</td><td>${c.tags.join(' | ')}</td><td>${c.value}</td><td>${c.notes}</td><td>${c.nextReminder||''}</td><td>${c.createdAt}</td></tr>`).join('');
    downloadTextFile(`oracle-crm-clients-${new Date().toISOString().slice(0,10)}.xls`, `<html><meta charset="utf-8"><body><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Tags</th><th>Valeur</th><th>Notes</th><th>Prochain rappel</th><th>Créé le</th></tr></thead><tbody>${rows}</tbody></table></body></html>`, 'application/vnd.ms-excel;charset=utf-8');
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
  const pending=reminders.filter(r=>!r.done&&new Date(r.date)>=new Date()).length;

  if(!mounted||status==='loading')return <Spinner/>;

  return(
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'var(--bg-app)'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .om-business-scroll::-webkit-scrollbar{display:none}
        .om-business-scroll{scrollbar-width:none;-ms-overflow-style:none}
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
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:18,padding:14,boxShadow:'var(--shadow)'}}>
            <button onClick={()=>setGuideOpen(v=>!v)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,border:'none',background:'transparent',padding:0,cursor:'pointer',textAlign:'left'}}>
              <span style={{width:38,height:38,borderRadius:14,background:'rgba(16,42,42,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>💼</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{margin:0,fontSize:15,fontWeight:900,color:'var(--text-primary)',lineHeight:1.2}}>À quoi sert Business & CRM ?</p>
                <p style={{margin:'3px 0 0',fontSize:12.5,color:'var(--text-secondary)',fontWeight:650,lineHeight:1.35}}>Suivre vos clients, rappels, ventes, paiements et relances depuis un seul espace.</p>
              </div>
              <span style={{fontSize:18,color:'var(--text-muted)',transform:guideOpen?'rotate(180deg)':'none',transition:'transform .18s'}}>⌄</span>
            </button>
            {guideOpen&&(
              <div style={{marginTop:12,borderTop:'1px solid var(--border)',paddingTop:12}}>
                <div style={{display:'grid',gap:8,marginBottom:12}}>
                  {[
                    '1. Ajoutez chaque prospect ou client avec son numéro, sa valeur et ses notes.',
                    '2. Classez-le avec un statut : chaud, froid, payé, VIP, perdu ou à relancer.',
                    '3. Programmez un rappel pour ne jamais oublier une relance importante.',
                    '4. Préparez un message type, ajoutez votre lien de paiement, puis envoyez la relance quand vous êtes prêt.',
                    '5. Partagez votre lien client sur vos pages, publicités, SMS ou supports commerciaux.',
                  ].map(line=><p key={line} style={{margin:0,fontSize:12.8,lineHeight:1.45,color:'var(--text-secondary)',fontWeight:650}}>{line}</p>)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:8,marginBottom:12}}>
                  {[
                    ['Clients','Ajoutez et qualifiez vos contacts.'],
                    ['Rappels','Planifiez les relances à faire.'],
                    ['Stats','Suivez ventes et conversion.'],
                  ].map(([title,body])=>(
                    <div key={title} style={{border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'9px 8px'}}>
                      <p style={{margin:'0 0 3px',fontSize:12.5,fontWeight:900,color:'var(--text-primary)',lineHeight:1.15}}>{title}</p>
                      <p style={{margin:0,fontSize:11.2,fontWeight:650,color:'var(--text-muted)',lineHeight:1.25}}>{body}</p>
                    </div>
                  ))}
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
                        {c.phone&&<button onClick={()=>{const msg=c.autoMessage||formatTemplate(autoSettings.welcomeMessage,c);window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'none',background:'#25D366',cursor:'pointer',color:'#fff'}}>💬 Envoyer</button>}
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
              reminders.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).map(r=>{
                const overdue=!r.done&&new Date(r.date)<new Date();
                const soon=!r.done&&(new Date(r.date).getTime()-Date.now())<172800000;
                return(
                  <div key={r.id} style={{background:'var(--bg-surface)',margin:'4px 0',borderRadius:16,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',opacity:r.done?0.5:1,borderLeft:`4px solid ${overdue?'#c62828':soon?'#e65100':'var(--accent)'}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1}}>
                        <p style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',margin:'0 0 2px'}}>{r.clientName}</p>
                        <p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 4px'}}>{r.note}</p>
                        <p style={{fontSize:12,color:overdue?'#c62828':soon?'#e65100':'var(--accent)',fontWeight:600,margin:0}}>
                          {overdue?'⚠️ En retard':'📅'} {new Date(r.date).toLocaleDateString('fr',{day:'numeric',month:'long',year:'numeric'})}
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
                  {c.phone&&<button onClick={()=>{const msg=c.autoMessage||formatTemplate(autoSettings.welcomeMessage,c);window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'6px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>📤 Ouvrir le message</button>}
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
                <button onClick={()=>navigator.clipboard?.writeText('{paiement}').then(()=>alert('Variable copiée'))} style={{border:'1px solid var(--border)',background:'var(--bg-app)',borderRadius:12,padding:'10px 8px',fontSize:13,fontWeight:900,color:'var(--text-primary)',cursor:'pointer'}}>Copier {'{paiement}'}</button>
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
                  {c.phone&&<button onClick={()=>window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}?text=${encodeURIComponent(formatTemplate(autoSettings.welcomeMessage,c))}`,'_blank')} style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'6px 12px',cursor:'pointer',fontSize:12}}>💬</button>}
                </div>
              ))}
              {clients.filter(c=>c.tags.includes('relancer')).length===0&&<p style={{color:'var(--text-muted)',fontSize:13}}>Aucun client à relancer.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Modal rappel */}
      {showRemind&&(
        <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end'}}>
          <div style={{width:'100%',background:'var(--bg-surface)',borderRadius:'20px 20px 0 0',padding:24}}>
            <h3 style={{fontSize:17,fontWeight:700,color:'var(--text-primary)',margin:'0 0 16px'}}>⏰ Rappel pour {showRemind.name}</h3>
            <input type="date" value={remDate} onChange={e=>setRemDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
              style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid var(--border)',fontSize:15,outline:'none',marginBottom:12,boxSizing:'border-box'}}/>
            <textarea value={remNote} onChange={e=>setRemNote(e.target.value)} placeholder="Note du rappel…" rows={3}
              style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid var(--border)',fontSize:14,outline:'none',resize:'none',marginBottom:16,boxSizing:'border-box'}}/>
            <button onClick={()=>{
              if(!remDate)return;
              const r:Reminder={id:`rem_${Date.now()}`,clientId:showRemind.id,clientName:showRemind.name,date:remDate,note:remNote,done:false};
              saveR([...reminders,r]);
              saveC(clients.map(c=>c.id===showRemind.id?{...c,nextReminder:remDate,reminderNote:remNote}:c));
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
