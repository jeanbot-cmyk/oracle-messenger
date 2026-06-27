'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type Tag = 'chaud'|'froid'|'payé'|'relancer'|'prospect'|'vip'|'perdu';
interface Client {
  id:string; name:string; phone:string; email:string; tags:Tag[];
  notes:string; nextReminder?:string; reminderNote?:string;
  autoMessage?:string; value:number; createdAt:string;
}
interface Reminder { id:string; clientId:string; clientName:string; date:string; note:string; done:boolean; }

const TAG_META:Record<Tag,{bg:string;color:string;label:string}> = {
  chaud:   {bg:'#fff3e0',color:'#e65100',label:'🔥 Chaud'},
  froid:   {bg:'#e3f2fd',color:'#1565c0',label:'❄️ Froid'},
  'payé':  {bg:'#e8f5e9',color:'#2e7d32',label:'✅ Payé'},
  relancer:{bg:'#fce4ec',color:'#c62828',label:'📞 Relancer'},
  prospect:{bg:'#f3e5f5',color:'#6a1b9a',label:'👁 Prospect'},
  vip:     {bg:'#fffde7',color:'#f57f17',label:'⭐ VIP'},
  perdu:   {bg:'#f5f5f5',color:'#616161',label:'❌ Perdu'},
};

function ld<T>(k:string,d:T):T{if(typeof window==='undefined')return d;try{return JSON.parse(localStorage.getItem(k)??'null')??d;}catch{return d;}}
function sv(k:string,v:any){if(typeof window!=='undefined')localStorage.setItem(k,JSON.stringify(v));}

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

  useEffect(()=>{setMounted(true);if(status==='unauthenticated')router.replace('/login');},[status]);
  useEffect(()=>{if(!mounted)return;setClients(ld('oracle-crm',[]) );setReminders(ld('oracle-rem',[]));checkReminders();},[mounted]);

  function checkReminders(){
    const rems:Reminder[]=ld('oracle-rem',[]);
    const now=new Date();
    rems.filter(r=>!r.done).forEach(r=>{
      const diff=(new Date(r.date).getTime()-now.getTime())/(86400000);
      if(diff<=2&&diff>=0&&'Notification' in window&&Notification.permission==='granted'){
        new Notification(`⏰ Rappel : ${r.clientName}`,{body:r.note,icon:'/icons/icon-192.png'});
      }
    });
  }

  function saveC(list:Client[]){setClients(list);sv('oracle-crm',list);}
  function saveR(list:Reminder[]){setReminders(list);sv('oracle-rem',list);}

  const filtered=clients.filter(c=>{
    const ms=c.name.toLowerCase().includes(search.toLowerCase())||c.phone.includes(search);
    const mt=filterTag==='all'||c.tags.includes(filterTag);
    return ms&&mt;
  });

  const totalValue=clients.reduce((s,c)=>s+(c.value||0),0);
  const pending=reminders.filter(r=>!r.done&&new Date(r.date)>=new Date()).length;

  if(!mounted||status==='loading')return <Spinner/>;

  return(
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#f0f2f5'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {/* Header */}
      <div style={{background:'#00a884',padding:'14px 16px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={()=>router.back()} style={{width:36,height:36,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.2)',cursor:'pointer',color:'#fff',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <div style={{flex:1}}>
          <h1 style={{fontSize:18,fontWeight:700,color:'#fff',margin:0}}>Business & CRM</h1>
          <p style={{fontSize:12,color:'rgba(255,255,255,0.8)',margin:0}}>{clients.length} clients · {pending} rappels · {totalValue.toLocaleString()}€</p>
        </div>
        <button onClick={()=>{setEditClient(null);setShowForm(true);}} style={{width:36,height:36,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.2)',cursor:'pointer',color:'#fff',fontSize:22,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
      </div>
      {/* Tabs */}
      <div style={{display:'flex',background:'#fff',borderBottom:'1px solid #f0f2f5',flexShrink:0}}>
        {([['clients','👥 Clients'],['reminders','⏰ Rappels'],['stats','📊 Stats'],['auto','🤖 Auto']] as const).map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'12px 4px',border:'none',background:'transparent',cursor:'pointer',fontSize:12,fontWeight:tab===id?700:400,color:tab===id?'#00a884':'#8696a0',borderBottom:tab===id?'2px solid #00a884':'2px solid transparent'}}>{lbl}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        {tab==='clients'&&(
          <>
            {/* Search + filter */}
            <div style={{padding:'8px 12px',background:'#fff',borderBottom:'1px solid #f0f2f5'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,background:'#f0f2f5',borderRadius:24,padding:'8px 14px',marginBottom:8}}>
                <span style={{color:'#8696a0'}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…" style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:14,color:'#111b21'}}/>
              </div>
              <div style={{display:'flex',gap:6,overflowX:'auto'}}>
                {(['all',...Object.keys(TAG_META)] as const).map(t=>(
                  <button key={t} onClick={()=>setFilterTag(t as any)} style={{flexShrink:0,padding:'4px 12px',borderRadius:16,border:'none',background:filterTag===t?'#00a884':'#f0f2f5',color:filterTag===t?'#fff':'#111b21',fontSize:12,cursor:'pointer',fontWeight:500}}>
                    {t==='all'?'Tous':TAG_META[t as Tag].label}
                  </button>
                ))}
              </div>
            </div>
            {filtered.length===0?(
              <div style={{padding:40,textAlign:'center',color:'#8696a0'}}>
                <div style={{fontSize:48,marginBottom:12}}>💼</div>
                <p style={{fontWeight:600,color:'#111b21'}}>Aucun client</p>
                <p style={{fontSize:13}}>Ajoutez votre premier client avec le bouton +</p>
              </div>
            ):(
              filtered.map(c=>(
                <div key={c.id} style={{background:'#fff',margin:'4px 8px',borderRadius:16,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                    <div style={{width:48,height:48,borderRadius:'50%',background:'#00a884',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:20,flexShrink:0}}>{c.name[0]?.toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <p style={{fontWeight:700,fontSize:15,color:'#111b21',margin:0}}>{c.name}</p>
                        {c.value>0&&<span style={{fontSize:12,color:'#00a884',fontWeight:600}}>{c.value.toLocaleString()}€</span>}
                      </div>
                      {c.phone&&<p style={{fontSize:13,color:'#8696a0',margin:'0 0 4px'}}>{c.phone}</p>}
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>
                        {c.tags.map(t=>(
                          <span key={t} style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:TAG_META[t].bg,color:TAG_META[t].color,fontWeight:600}}>{TAG_META[t].label}</span>
                        ))}
                      </div>
                      {c.notes&&<p style={{fontSize:12,color:'#667781',margin:'0 0 8px',lineHeight:1.4}}>{c.notes}</p>}
                      {c.nextReminder&&<p style={{fontSize:11,color:'#e65100',margin:'0 0 8px'}}>⏰ Rappel : {new Date(c.nextReminder).toLocaleDateString('fr')}</p>}
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <button onClick={()=>{setEditClient(c);setShowForm(true);}} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'1px solid #e9edef',background:'transparent',cursor:'pointer',color:'#111b21'}}>✏️ Modifier</button>
                        <button onClick={()=>{setShowRemind(c);setRemDate('');setRemNote('');}} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'1px solid #e9edef',background:'transparent',cursor:'pointer',color:'#111b21'}}>⏰ Rappel</button>
                        {c.phone&&<button onClick={()=>{const msg=c.autoMessage||`Bonjour ${c.name}, je vous contacte pour faire le point.`;window.open(`https://wa.me/${c.phone.replace(/\s/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{fontSize:12,padding:'5px 12px',borderRadius:10,border:'none',background:'#25D366',cursor:'pointer',color:'#fff'}}>💬 WhatsApp</button>}
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
              <div style={{padding:40,textAlign:'center',color:'#8696a0'}}><div style={{fontSize:48}}>⏰</div><p>Aucun rappel programmé</p></div>
            ):(
              reminders.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).map(r=>{
                const overdue=!r.done&&new Date(r.date)<new Date();
                const soon=!r.done&&(new Date(r.date).getTime()-Date.now())<172800000;
                return(
                  <div key={r.id} style={{background:'#fff',margin:'4px 0',borderRadius:16,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',opacity:r.done?0.5:1,borderLeft:`4px solid ${overdue?'#c62828':soon?'#e65100':'#00a884'}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1}}>
                        <p style={{fontWeight:700,fontSize:15,color:'#111b21',margin:'0 0 2px'}}>{r.clientName}</p>
                        <p style={{fontSize:13,color:'#8696a0',margin:'0 0 4px'}}>{r.note}</p>
                        <p style={{fontSize:12,color:overdue?'#c62828':soon?'#e65100':'#00a884',fontWeight:600,margin:0}}>
                          {overdue?'⚠️ En retard':'📅'} {new Date(r.date).toLocaleDateString('fr',{day:'numeric',month:'long',year:'numeric'})}
                        </p>
                      </div>
                      {!r.done&&<button onClick={()=>saveR(reminders.map(x=>x.id===r.id?{...x,done:true}:x))} style={{background:'#00a884',color:'#fff',border:'none',borderRadius:10,padding:'6px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>✓ Fait</button>}
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
                {label:'Total clients',value:clients.length,icon:'👥',color:'#00a884'},
                {label:'Valeur totale',value:`${totalValue.toLocaleString()}€`,icon:'💰',color:'#f57f17'},
                {label:'Rappels actifs',value:pending,icon:'⏰',color:'#e65100'},
                {label:'Clients actifs',value:clients.filter(c=>c.tags.includes('chaud')||c.tags.includes('vip')).length,icon:'🔥',color:'#c62828'},
              ].map(s=>(
                <div key={s.label} style={{background:'#fff',borderRadius:16,padding:'16px',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',textAlign:'center'}}>
                  <div style={{fontSize:32,marginBottom:6}}>{s.icon}</div>
                  <p style={{fontSize:22,fontWeight:800,color:s.color,margin:'0 0 4px'}}>{s.value}</p>
                  <p style={{fontSize:12,color:'#8696a0',margin:0}}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{background:'#fff',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'#111b21',marginBottom:12}}>Répartition par tag</p>
              {Object.entries(TAG_META).map(([t,meta])=>{
                const count=clients.filter(c=>c.tags.includes(t as Tag)).length;
                const pct=clients.length?Math.round(count/clients.length*100):0;
                return(
                  <div key={t} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:13,color:'#111b21'}}>{meta.label}</span>
                      <span style={{fontSize:13,fontWeight:600,color:meta.color}}>{count}</span>
                    </div>
                    <div style={{height:6,background:'#f0f2f5',borderRadius:3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:meta.color,borderRadius:3,transition:'width 0.5s'}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab==='auto'&&(
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:'#fff',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'#111b21',marginBottom:4}}>🤖 Messages automatiques</p>
              <p style={{fontSize:13,color:'#8696a0',marginBottom:16,lineHeight:1.5}}>Configurez un message personnalisé par client. Envoyez-le en 1 clic via WhatsApp.</p>
              {clients.map(c=>(
                <div key={c.id} style={{borderBottom:'1px solid #f0f2f5',paddingBottom:12,marginBottom:12}}>
                  <p style={{fontWeight:600,fontSize:14,color:'#111b21',marginBottom:6}}>{c.name}</p>
                  <textarea
                    defaultValue={c.autoMessage||`Bonjour ${c.name}, je vous contacte pour faire le point sur notre collaboration.`}
                    onBlur={e=>{const updated=clients.map(x=>x.id===c.id?{...x,autoMessage:e.target.value}:x);saveC(updated);}}
                    rows={2} style={{width:'100%',border:'1px solid #e9edef',borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',resize:'none',boxSizing:'border-box',marginBottom:6}}/>
                  {c.phone&&<button onClick={()=>{const msg=c.autoMessage||`Bonjour ${c.name}, je vous contacte.`;window.open(`https://wa.me/${c.phone.replace(/\s/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'6px 16px',cursor:'pointer',fontSize:13,fontWeight:600}}>📤 Envoyer WhatsApp</button>}
                </div>
              ))}
              {clients.length===0&&<p style={{color:'#8696a0',fontSize:13,textAlign:'center'}}>Ajoutez des clients pour configurer les messages auto.</p>}
            </div>
            <div style={{background:'#fff',borderRadius:16,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
              <p style={{fontWeight:700,fontSize:15,color:'#111b21',marginBottom:4}}>📋 Clients à relancer</p>
              {clients.filter(c=>c.tags.includes('relancer')).map(c=>(
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid #f0f2f5'}}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:'#fce4ec',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,color:'#c62828',flexShrink:0}}>{c.name[0]}</div>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:600,fontSize:14,color:'#111b21',margin:0}}>{c.name}</p>
                    <p style={{fontSize:12,color:'#8696a0',margin:0}}>{c.phone}</p>
                  </div>
                  {c.phone&&<button onClick={()=>window.open(`https://wa.me/${c.phone.replace(/\s/g,'')}?text=${encodeURIComponent(`Bonjour ${c.name}, je vous recontacte.`)}`,'_blank')} style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'6px 12px',cursor:'pointer',fontSize:12}}>💬</button>}
                </div>
              ))}
              {clients.filter(c=>c.tags.includes('relancer')).length===0&&<p style={{color:'#8696a0',fontSize:13}}>Aucun client à relancer.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Modal rappel */}
      {showRemind&&(
        <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'flex-end'}}>
          <div style={{width:'100%',background:'#fff',borderRadius:'20px 20px 0 0',padding:24}}>
            <h3 style={{fontSize:17,fontWeight:700,color:'#111b21',margin:'0 0 16px'}}>⏰ Rappel pour {showRemind.name}</h3>
            <input type="date" value={remDate} onChange={e=>setRemDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
              style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid #e9edef',fontSize:15,outline:'none',marginBottom:12,boxSizing:'border-box'}}/>
            <textarea value={remNote} onChange={e=>setRemNote(e.target.value)} placeholder="Note du rappel…" rows={3}
              style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid #e9edef',fontSize:14,outline:'none',resize:'none',marginBottom:16,boxSizing:'border-box'}}/>
            <button onClick={()=>{
              if(!remDate)return;
              const r:Reminder={id:`rem_${Date.now()}`,clientId:showRemind.id,clientName:showRemind.name,date:remDate,note:remNote,done:false};
              saveR([...reminders,r]);
              saveC(clients.map(c=>c.id===showRemind.id?{...c,nextReminder:remDate,reminderNote:remNote}:c));
              setShowRemind(null);
            }} style={{width:'100%',background:'#00a884',color:'#fff',border:'none',borderRadius:14,padding:16,fontSize:16,fontWeight:700,cursor:'pointer',marginBottom:10}}>
              Programmer le rappel
            </button>
            <button onClick={()=>setShowRemind(null)} style={{width:'100%',background:'transparent',border:'1px solid #e9edef',borderRadius:14,padding:14,fontSize:15,color:'#667781',cursor:'pointer'}}>Annuler</button>
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
      <div style={{width:'100%',background:'#fff',borderRadius:'20px 20px 0 0',padding:24,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <button onClick={onClose} style={{border:'none',background:'transparent',cursor:'pointer',fontSize:22,color:'#111b21'}}>×</button>
          <h3 style={{margin:0,fontSize:18,fontWeight:700,color:'#111b21',flex:1}}>{initial?'Modifier':'Nouveau client'}</h3>
          <button onClick={()=>{if(!name.trim())return;onSave({id:initial?.id||'',name,phone,email,notes,tags,value:Number(value)||0,createdAt:initial?.createdAt||new Date().toISOString()});}}
            style={{background:'#00a884',color:'#fff',border:'none',borderRadius:12,padding:'8px 20px',cursor:'pointer',fontWeight:700,fontSize:14}}>Sauver</button>
        </div>
        {[{label:'Nom *',val:name,set:setName,ph:'Nom du client'},{label:'Téléphone',val:phone,set:setPhone,ph:'+225 07...'},{label:'Email',val:email,set:setEmail,ph:'email@...'},{label:'Valeur (€)',val:value,set:setValue,ph:'0'}].map(f=>(
          <div key={f.label} style={{marginBottom:12}}>
            <p style={{fontSize:12,fontWeight:600,color:'#00a884',margin:'0 0 4px',textTransform:'uppercase',letterSpacing:0.5}}>{f.label}</p>
            <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
              style={{width:'100%',padding:'10px 14px',borderRadius:12,border:'1px solid #e9edef',fontSize:15,outline:'none',boxSizing:'border-box'}}/>
          </div>
        ))}
        <p style={{fontSize:12,fontWeight:600,color:'#00a884',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:0.5}}>Tags</p>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {(Object.keys(TAG_META) as Tag[]).map(t=>(
            <button key={t} onClick={()=>toggleTag(t)} style={{padding:'5px 12px',borderRadius:16,border:'none',background:tags.includes(t)?TAG_META[t].bg:'#f0f2f5',color:tags.includes(t)?TAG_META[t].color:'#8696a0',fontSize:12,cursor:'pointer',fontWeight:tags.includes(t)?700:400}}>
              {TAG_META[t].label}
            </button>
          ))}
        </div>
        <p style={{fontSize:12,fontWeight:600,color:'#00a884',margin:'0 0 4px',textTransform:'uppercase',letterSpacing:0.5}}>Notes</p>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Notes sur ce client…"
          style={{width:'100%',padding:'10px 14px',borderRadius:12,border:'1px solid #e9edef',fontSize:14,outline:'none',resize:'none',boxSizing:'border-box'}}/>
      </div>
    </div>
  );
}

function Spinner(){return(<div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f2f5'}}><div style={{width:32,height:32,border:'3px solid #e9edef',borderTopColor:'#00a884',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);}
