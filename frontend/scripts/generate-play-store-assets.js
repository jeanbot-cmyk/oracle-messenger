const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'downloads', 'play-store-assets-20260808');
const zipPath = path.join(root, 'public', 'downloads', 'oracle-messenger-play-store-assets-20260808.zip');
const iconPath = path.join(root, 'public', 'icons', 'icon-1024-v20260806-no-badge.png');

fs.mkdirSync(outDir, { recursive: true });

const brand = '#102A2A';
const brand2 = '#174446';
const green = '#25D366';
const pale = '#F6F7F9';
const text = '#151A23';
const muted = '#64748B';
const border = '#DDE5E8';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function line(txt, x, y, size = 34, weight = 700, fill = text, extra = '') {
  return `<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(txt)}</text>`;
}

function rounded(x, y, w, h, r, fill, stroke = 'none', sw = 0, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
}

function bubble(x, y, w, h, mine, label, sub = '') {
  const fill = mine ? '#E4F7DF' : '#FFFFFF';
  const anchor = mine ? 'end' : 'start';
  const tx = mine ? x + w - 28 : x + 28;
  return `
    ${rounded(x, y, w, h, 28, fill, mine ? '#C9EBC0' : '#E8EEF1', 2)}
    ${line(label, tx, y + 44, 26, 750, text, `text-anchor="${anchor}"`)}
    ${sub ? line(sub, tx, y + 80, 20, 650, muted, `text-anchor="${anchor}"`) : ''}
  `;
}

function phoneFrame(content) {
  return `
    <rect x="70" y="70" width="940" height="1780" rx="86" fill="#0B1718"/>
    <rect x="96" y="98" width="888" height="1724" rx="68" fill="${pale}"/>
    <rect x="430" y="120" width="220" height="28" rx="14" fill="#0B1718" opacity=".9"/>
    ${content}
  `;
}

function baseSvg(title, subtitle, content, badge = '') {
  return `
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F7FBFA"/>
        <stop offset=".55" stop-color="#EEF7F2"/>
        <stop offset="1" stop-color="#FFFFFF"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#102A2A" flood-opacity=".18"/>
      </filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="950" cy="130" r="220" fill="#DDEFEA" opacity=".55"/>
    <circle cx="90" cy="1780" r="260" fill="#E4F7DF" opacity=".65"/>
    <g filter="url(#shadow)">${phoneFrame(content)}</g>
    <rect x="72" y="1710" width="936" height="126" rx="38" fill="#FFFFFF" opacity=".94"/>
    ${badge ? rounded(94, 1732, 210, 58, 29, brand) + line(badge, 199, 1770, 22, 850, '#FFFFFF', 'text-anchor="middle"') : ''}
    ${line(title, badge ? 330 : 108, 1758, 38, 900, brand)}
    ${line(subtitle, badge ? 330 : 108, 1802, 23, 650, muted)}
  </svg>`;
}

async function writeSvgPng(file, svg, width, height) {
  await sharp(Buffer.from(svg)).resize(width, height).png({ quality: 95 }).toFile(path.join(outDir, file));
}

async function copyIcon() {
  await sharp(iconPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(outDir, '01-app-icon-512.png'));
}

async function featureGraphic() {
  const iconData = fs.readFileSync(iconPath).toString('base64');
  const svg = `
  <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#102A2A"/>
        <stop offset=".58" stop-color="#174446"/>
        <stop offset="1" stop-color="#DDEFEA"/>
      </linearGradient>
      <filter id="s"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-opacity=".24"/></filter>
    </defs>
    <rect width="1024" height="500" fill="url(#hero)"/>
    <circle cx="862" cy="86" r="180" fill="#FFFFFF" opacity=".12"/>
    <circle cx="100" cy="440" r="230" fill="#25D366" opacity=".12"/>
    <image x="88" y="116" width="188" height="188" href="data:image/png;base64,${iconData}" filter="url(#s)"/>
    ${line('Oracle Messenger', 314, 168, 48, 950, '#FFFFFF')}
    ${line('Messages, appels video, IA et Business', 318, 226, 28, 700, '#DDEFEA')}
    ${rounded(318, 282, 250, 56, 28, '#25D366')}
    ${line('Pret pour Android', 443, 319, 22, 850, '#102A2A', 'text-anchor="middle"')}
    ${rounded(318, 376, 180, 46, 23, '#FFFFFF', 'none', 0, 'opacity=".92"')}
    ${line('Appels', 408, 406, 19, 850, brand, 'text-anchor="middle"')}
    ${rounded(520, 376, 210, 46, 23, '#FFFFFF', 'none', 0, 'opacity=".9"')}
    ${line('Outils IA', 625, 406, 19, 850, brand, 'text-anchor="middle"')}
    ${rounded(752, 376, 198, 46, 23, '#FFFFFF', 'none', 0, 'opacity=".88"')}
    ${line('Business', 851, 406, 19, 850, brand, 'text-anchor="middle"')}
  </svg>`;
  await writeSvgPng('02-feature-graphic-1024x500.png', svg, 1024, 500);
}

function chatScreen() {
  const content = `
    ${rounded(96, 98, 888, 142, 68, brand)}
    ${line('Oracle Messenger', 146, 188, 34, 900, '#FFFFFF')}
    ${rounded(850, 154, 78, 44, 22, '#25D366')}
    ${line('3', 889, 184, 24, 900, brand, 'text-anchor="middle"')}
    ${rounded(126, 282, 828, 72, 32, '#FFFFFF', border, 2)}
    ${line('Rechercher un contact ou un message', 168, 328, 25, 650, muted)}
    ${rounded(126, 390, 828, 172, 32, '#FFFFFF', border, 2)}
    <circle cx="190" cy="476" r="44" fill="#DDEFEA"/>
    ${line('A', 190, 487, 34, 900, brand, 'text-anchor="middle"')}
    ${line('Awa Boutique', 262, 452, 28, 850)}
    ${line('Votre commande est prete.', 262, 492, 23, 650, muted)}
    ${rounded(852, 432, 58, 38, 19, green)}
    ${line('2', 881, 458, 21, 900, '#FFFFFF', 'text-anchor="middle"')}
    ${rounded(126, 592, 828, 172, 32, '#FFFFFF', border, 2)}
    <circle cx="190" cy="678" r="44" fill="#E4F7DF"/>
    ${line('K', 190, 689, 34, 900, brand, 'text-anchor="middle"')}
    ${line('Koffi Services', 262, 654, 28, 850)}
    ${line('Appel video termine', 262, 694, 23, 650, muted)}
    ${rounded(126, 794, 828, 644, 32, '#FFFFFF', border, 2)}
    ${line('Discussion', 166, 854, 30, 900, brand)}
    ${bubble(164, 900, 510, 104, false, 'Bonjour, le devis est disponible ?')}
    ${bubble(404, 1038, 508, 116, true, 'Oui, je vous envoie ca maintenant.', 'Double coche - livre')}
    ${bubble(164, 1188, 420, 104, false, 'Merci beaucoup.')}
    ${rounded(150, 1482, 780, 92, 46, '#FFFFFF', border, 2)}
    ${line('Message', 206, 1540, 28, 650, muted)}
    <circle cx="868" cy="1528" r="38" fill="${brand}"/>
    ${line('>', 868, 1540, 34, 900, '#FFFFFF', 'text-anchor="middle"')}
  `;
  return baseSvg('Messagerie rapide', 'Messages prives, groupes et fichiers', content, 'CHAT');
}

function callScreen() {
  const content = `
    ${rounded(96, 98, 888, 1724, 68, '#0C191A')}
    <rect x="96" y="98" width="888" height="1724" rx="68" fill="#0C191A"/>
    <circle cx="540" cy="560" r="180" fill="#DDEFEA"/>
    ${line('AG', 540, 600, 88, 900, brand, 'text-anchor="middle"')}
    ${line('Awa Georges', 540, 820, 44, 900, '#FFFFFF', 'text-anchor="middle"')}
    ${line('Appel video en cours - 08:24', 540, 872, 26, 700, '#DDEFEA', 'text-anchor="middle"')}
    ${rounded(342, 918, 396, 52, 26, '#173D3E')}
    ${line('Connexion stable', 540, 952, 22, 800, '#DDEFEA', 'text-anchor="middle"')}
    ${rounded(690, 250, 220, 310, 34, '#183839', '#2A5A5B', 2)}
    ${line('Vous', 800, 410, 28, 850, '#FFFFFF', 'text-anchor="middle"')}
    ${rounded(156, 1380, 768, 184, 48, '#FFFFFF', 'none', 0, 'opacity=".96"')}
    ${['Micro','Camera','Speaker','Changer'].map((t,i)=>`${rounded(188+i*176, 1424, 96, 96, 48, i===3?green:'#EEF3F4')} ${line(t, 236+i*176, 1548, 18, 780, brand, 'text-anchor="middle"')}`).join('')}
    <circle cx="540" cy="1648" r="58" fill="#EF4444"/>
    ${line('Fin', 540, 1658, 24, 900, '#FFFFFF', 'text-anchor="middle"')}
  `;
  return baseSvg('Appels audio et video', 'Controle micro, camera et haut-parleur', content, 'APPEL');
}

function toolsScreen() {
  const card = (x, y, title, sub, fill = '#FFFFFF') => `
    ${rounded(x, y, 372, 214, 34, fill, border, 2)}
    <circle cx="${x + 64}" cy="${y + 66}" r="36" fill="${brand}"/>
    ${line('IA', x + 64, y + 78, 22, 950, '#FFFFFF', 'text-anchor="middle"')}
    ${line(title, x + 28, y + 132, 28, 900, brand)}
    ${line(sub, x + 28, y + 170, 20, 650, muted)}
  `;
  const content = `
    ${rounded(96, 98, 888, 142, 68, brand)}
    ${line('Outils', 146, 188, 38, 900, '#FFFFFF')}
    ${line('Creer plus vite avec Oracle', 128, 308, 30, 850, brand)}
    ${line('Des modules utiles pour communiquer et vendre.', 128, 350, 22, 650, muted)}
    ${card(128, 410, 'Creer IA Image', 'Flyers et affiches', '#FDFEFE')}
    ${card(560, 410, 'IA Video', 'Videos de presentation', '#FDFEFE')}
    ${card(128, 674, 'Traduction', 'Messages multilingues', '#FDFEFE')}
    ${card(560, 674, 'Reponse IA', 'Texte professionnel', '#FDFEFE')}
    ${rounded(128, 982, 824, 300, 38, '#FFFFFF', border, 2)}
    ${line('Assistant dans le chat', 178, 1060, 34, 900, brand)}
    ${line('Redige, corrige et adapte vos messages.', 178, 1110, 24, 650, muted)}
    ${rounded(178, 1164, 260, 58, 29, green)}
    ${line('Tester maintenant', 308, 1202, 22, 900, brand, 'text-anchor="middle"')}
  `;
  return baseSvg('Outils IA integres', 'Image, video, traduction et reponses', content, 'OUTILS');
}

function businessScreen() {
  const content = `
    ${rounded(96, 98, 888, 142, 68, brand)}
    ${line('Business IA', 146, 188, 38, 900, '#FFFFFF')}
    ${rounded(128, 292, 824, 156, 34, '#FFFFFF', border, 2)}
    ${line('Assistant IA Business', 174, 360, 34, 900, brand)}
    ${line('Classe les prospects, relance et aide a vendre.', 174, 404, 23, 650, muted)}
    ${rounded(128, 496, 250, 146, 32, '#E4F7DF')}
    ${line('12', 253, 562, 42, 950, brand, 'text-anchor="middle"')}
    ${line('Clients chauds', 253, 604, 22, 850, brand, 'text-anchor="middle"')}
    ${rounded(416, 496, 250, 146, 32, '#FFFFFF', border, 2)}
    ${line('8', 541, 562, 42, 950, brand, 'text-anchor="middle"')}
    ${line('Rappels', 541, 604, 22, 850, muted, 'text-anchor="middle"')}
    ${rounded(704, 496, 248, 146, 32, '#FFFFFF', border, 2)}
    ${line('5', 828, 562, 42, 950, brand, 'text-anchor="middle"')}
    ${line('Payes', 828, 604, 22, 850, muted, 'text-anchor="middle"')}
    ${rounded(128, 704, 824, 610, 34, '#FFFFFF', border, 2)}
    ${line('Clients', 174, 774, 32, 900, brand)}
    ${['Marie Konan|Chaud|Demande de prix','David Shop|A relancer|Mardi 10h','Koffi Pro|Paye|Abonnement actif'].map((s,i)=>{const [a,b,c]=s.split('|'); const y=840+i*144; return `${rounded(166, y, 748, 112, 28, i===0?'#F1FFF0':'#F8FAFC', '#E2EAED', 2)}${line(a, 206, y+42, 26, 850, text)}${line(c, 206, y+78, 20, 650, muted)}${rounded(720, y+30, 154, 46, 23, i===0?green:'#DDEFEA')}${line(b, 797, y+61, 18, 850, brand, 'text-anchor="middle"')}`}).join('')}
    ${rounded(180, 1370, 720, 82, 41, brand)}
    ${line('Activer Business', 540, 1424, 27, 900, '#FFFFFF', 'text-anchor="middle"')}
  `;
  return baseSvg('Business intelligent', 'CRM, rappels et assistant commercial', content, 'BUSINESS');
}

function contactsScreen() {
  const content = `
    ${rounded(96, 98, 888, 142, 68, brand)}
    ${line('Contacts', 146, 188, 38, 900, '#FFFFFF')}
    ${rounded(128, 292, 824, 76, 36, '#FFFFFF', border, 2)}
    ${line('Rechercher par nom ou telephone', 176, 342, 25, 650, muted)}
    ${rounded(128, 422, 824, 206, 34, '#FFFFFF', border, 2)}
    ${line('Retrouver vos proches', 178, 500, 34, 900, brand)}
    ${line('Importez, invitez et demarrez une discussion.', 178, 548, 23, 650, muted)}
    ${rounded(178, 574, 250, 58, 29, green)}
    ${line('Inviter', 303, 612, 22, 900, brand, 'text-anchor="middle"')}
    ${rounded(128, 690, 824, 540, 34, '#FFFFFF', border, 2)}
    ${['Awa Boutique','Koffi Services','Equipe Commerce','Famille'].map((name,i)=>{const y=750+i*112; return `<circle cx="190" cy="${y+42}" r="38" fill="${i===2?'#DDEFEA':'#E4F7DF'}"/>${line(name[0],190,y+53,30,900,brand,'text-anchor="middle"')}${line(name,252,y+36,27,850,text)}${line(i===2?'Groupe actif':'Disponible sur Oracle',252,y+72,20,650,muted)}${rounded(792,y+24,96,44,22,i===2?brand:green)}${line(i===2?'Ouvrir':'Chat',840,y+53,17,850,i===2?'#FFFFFF':brand,'text-anchor="middle"')}`}).join('')}
    ${rounded(182, 1330, 716, 80, 40, brand)}
    ${line('Partager Oracle Messenger', 540, 1382, 25, 900, '#FFFFFF', 'text-anchor="middle"')}
  `;
  return baseSvg('Contacts et groupes', 'Retrouvez, invitez et partagez facilement', content, 'CONTACTS');
}

function installScreen() {
  const content = `
    ${rounded(96, 98, 888, 1724, 68, '#FFFFFF')}
    <image x="400" y="350" width="280" height="280" href="data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}"/>
    ${line('Oracle Messenger', 540, 720, 46, 950, brand, 'text-anchor="middle"')}
    ${line('Une app rapide, fluide et disponible hors ligne.', 540, 772, 25, 650, muted, 'text-anchor="middle"')}
    ${rounded(180, 890, 720, 88, 44, brand)}
    ${line("Installer l'application", 540, 947, 28, 900, '#FFFFFF', 'text-anchor="middle"')}
    ${rounded(180, 1004, 720, 72, 36, '#FFFFFF', brand, 2)}
    ${line('Acceder sans installer', 540, 1052, 23, 850, brand, 'text-anchor="middle"')}
    ${rounded(174, 1196, 732, 236, 34, '#F8FAFC', border, 2)}
    ${line('Experience mobile premium', 220, 1272, 30, 900, brand)}
    ${line('Chargement optimise, cache local et notifications.', 220, 1320, 23, 650, muted)}
    ${line('Les anciens fichiers restent consultables hors connexion.', 220, 1360, 23, 650, muted)}
  `;
  return baseSvg('Installation simple', 'PWA et Android avec cache hors connexion', content, 'INSTALL');
}

async function screenshots() {
  const screens = [
    ['03-screenshot-chat-1080x1920.png', chatScreen()],
    ['04-screenshot-call-1080x1920.png', callScreen()],
    ['05-screenshot-tools-ai-1080x1920.png', toolsScreen()],
    ['06-screenshot-business-1080x1920.png', businessScreen()],
    ['07-screenshot-contacts-groups-1080x1920.png', contactsScreen()],
    ['08-screenshot-install-offline-1080x1920.png', installScreen()],
  ];
  for (const [file, svg] of screens) {
    await writeSvgPng(file, svg, 1080, 1920);
  }
}

async function main() {
  await copyIcon();
  await featureGraphic();
  await screenshots();
  try { fs.rmSync(zipPath); } catch {}
  execFileSync('zip', ['-qr', zipPath, path.basename(outDir)], { cwd: path.dirname(outDir) });
  const files = fs.readdirSync(outDir).sort();
  for (const file of files) {
    const meta = await sharp(path.join(outDir, file)).metadata();
    console.log(`${file} ${meta.width}x${meta.height}`);
  }
  console.log(`ZIP ${zipPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
