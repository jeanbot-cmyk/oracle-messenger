const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function iconSvg(size = 1024, options = {}) {
  const text = options.text === true;
  const drawBackground = options.background !== false;
  const scale = size / 1024;
  const logoScale = options.logoScale ?? (text ? 0.78 : 0.78);
  const logoOffset = (1024 - 1024 * logoScale) / 2;
  const logoOffsetY = logoOffset + (text ? -44 : 0);
  const s = (n) => Math.round(n * scale * logoScale);
  const y = (n) => Math.round(n * scale * logoScale);
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#20B49F"/>
      <stop offset="0.45" stop-color="#087968"/>
      <stop offset="1" stop-color="#03564E"/>
    </linearGradient>
    <radialGradient id="glow" cx="42%" cy="34%" r="62%">
      <stop offset="0" stop-color="#46D3BD" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#087E70" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#022E2B" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF4A8"/>
      <stop offset="0.42" stop-color="#E2B532"/>
      <stop offset="1" stop-color="#9F7414"/>
    </linearGradient>
    <linearGradient id="bubble" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#F3F7F5"/>
    </linearGradient>
    <filter id="shadow" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="${Math.round(28 * scale)}" stdDeviation="${Math.round(34 * scale)}" flood-color="#0B3A36" flood-opacity="0.32"/>
    </filter>
    <filter id="bubbleShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${Math.round(18 * scale)}" stdDeviation="${Math.round(16 * scale)}" flood-color="#062F2C" flood-opacity="0.26"/>
    </filter>
    <filter id="goldShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(8 * scale)}" stdDeviation="${Math.round(8 * scale)}" flood-color="#533A04" flood-opacity="0.28"/>
    </filter>
  </defs>
  ${drawBackground ? `<rect width="${size}" height="${size}" rx="${Math.round(116 * scale)}" fill="url(#bg)"/>
  <rect x="${Math.round(18 * scale)}" y="${Math.round(18 * scale)}" width="${Math.round(988 * scale)}" height="${Math.round(988 * scale)}" rx="${Math.round(104 * scale)}" fill="url(#glow)" opacity="0.86"/>
  <path d="M ${Math.round(206 * scale)} ${Math.round(84 * scale)}
           C ${Math.round(448 * scale)} ${Math.round(8 * scale)}, ${Math.round(784 * scale)} ${Math.round(86 * scale)}, ${Math.round(930 * scale)} ${Math.round(326 * scale)}
           C ${Math.round(800 * scale)} ${Math.round(224 * scale)}, ${Math.round(476 * scale)} ${Math.round(188 * scale)}, ${Math.round(158 * scale)} ${Math.round(244 * scale)}
           C ${Math.round(150 * scale)} ${Math.round(178 * scale)}, ${Math.round(168 * scale)} ${Math.round(124 * scale)}, ${Math.round(206 * scale)} ${Math.round(84 * scale)} Z" fill="#FFFFFF" opacity="0.10"/>
  ` : ''}
  <g transform="translate(${Math.round(logoOffset * scale)} ${Math.round(logoOffsetY * scale)})">
    <circle cx="${s(512)}" cy="${y(512)}" r="${s(428)}" fill="none" stroke="url(#gold)" stroke-width="${s(60)}" filter="url(#goldShadow)"/>
    <circle cx="${s(512)}" cy="${y(512)}" r="${s(340)}" fill="#FFFFFF" opacity="0.08"/>
    <circle cx="${s(512)}" cy="${y(512)}" r="${s(338)}" fill="none" stroke="#95E2D2" stroke-width="${s(4)}" opacity="0.45"/>
    <path d="M ${s(250)} ${y(468)}
      C ${s(250)} ${y(386)}, ${s(316)} ${y(326)}, ${s(402)} ${y(326)}
      L ${s(736)} ${y(326)}
      C ${s(824)} ${y(326)}, ${s(884)} ${y(386)}, ${s(884)} ${y(468)}
      L ${s(884)} ${y(552)}
      C ${s(884)} ${y(636)}, ${s(824)} ${y(696)}, ${s(736)} ${y(696)}
      L ${s(568)} ${y(696)}
      L ${s(438)} ${y(820)}
      C ${s(398)} ${y(858)}, ${s(346)} ${y(820)}, ${s(370)} ${y(768)}
      L ${s(404)} ${y(696)}
      L ${s(402)} ${y(696)}
      C ${s(316)} ${y(696)}, ${s(250)} ${y(636)}, ${s(250)} ${y(552)}
      Z" fill="url(#bubble)" filter="url(#bubbleShadow)"/>
    <circle cx="${s(428)}" cy="${y(514)}" r="${s(38)}" fill="#006958"/>
    <circle cx="${s(512)}" cy="${y(514)}" r="${s(38)}" fill="#006958"/>
    <circle cx="${s(596)}" cy="${y(514)}" r="${s(38)}" fill="#006958"/>
    <rect x="${s(374)}" y="${y(736)}" width="${s(300)}" height="${s(58)}" rx="${s(29)}" fill="url(#gold)" filter="url(#goldShadow)"/>
  </g>
  ${text ? `<text x="${Math.round(512 * scale)}" y="${Math.round(842 * scale)}" font-family="Inter, Arial, sans-serif" font-size="${Math.round(76 * scale)}" font-weight="800" fill="#FFFFFF" text-anchor="middle">Oracle Messenger</text>` : ''}
</svg>`;
}

async function writePng(target, size, text = false) {
  ensureDir(target);
  await sharp(Buffer.from(iconSvg(size, { text }))).png({ quality: 96 }).toFile(target);
}

async function writeForegroundPng(target, size) {
  ensureDir(target);
  await sharp(Buffer.from(iconSvg(size, { background: false, logoScale: 0.64 }))).png({ quality: 96 }).toFile(target);
}

async function writeSplash(target, width, height) {
  ensureDir(target);
  const icon = Buffer.from(iconSvg(512));
  const iconPng = await sharp(icon).png().toBuffer();
  const bg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#40B7AC"/>
      <stop offset="0.58" stop-color="#6BB79C"/>
      <stop offset="1" stop-color="#2E8177"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.12)}" r="${Math.round(Math.min(width, height) * 0.34)}" fill="#FFFFFF" opacity="0.11"/>
  <circle cx="${Math.round(width * 0.86)}" cy="${Math.round(height * 0.88)}" r="${Math.round(Math.min(width, height) * 0.36)}" fill="#063A35" opacity="0.10"/>
</svg>`;
  const iconSize = Math.round(Math.min(width, height) * 0.24);
  await sharp(Buffer.from(bg))
    .composite([{ input: await sharp(iconPng).resize(iconSize, iconSize).png().toBuffer(), left: Math.round((width - iconSize) / 2), top: Math.round((height - iconSize) / 2) }])
    .png({ quality: 96 })
    .toFile(target);
}

async function main() {
  const publicIcons = [48, 72, 96, 128, 144, 152, 192, 384, 512, 1024];
  for (const size of publicIcons) {
    await writePng(path.join(root, 'public', 'icons', `icon-${size}.png`), size);
    await writePng(path.join(root, 'public', 'icons', `icon-${size}-v20260809-premium.png`), size);
    await writePng(path.join(root, 'public', 'icons', `icon-${size}-v20260806-no-badge.png`), size);
  }
  await fs.promises.writeFile(path.join(root, 'public', 'icons', 'icon.svg'), iconSvg(1024));
  await writePng(path.join(root, 'public', 'apple-touch-icon.png'), 180);
  await writePng(path.join(root, 'public', 'favicon.ico'), 64);

  const densities = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192],
  ];
  for (const [dir, size] of densities) {
    await writePng(path.join(root, 'android', 'app', 'src', 'main', 'res', dir, 'ic_launcher.png'), size);
    await writePng(path.join(root, 'android', 'app', 'src', 'main', 'res', dir, 'ic_launcher_round.png'), size);
    await writeForegroundPng(path.join(root, 'android', 'app', 'src', 'main', 'res', dir, 'ic_launcher_foreground.png'), size);
  }

  await writeSplash(path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash.png'), 2732, 2732);
  const splash = [
    ['drawable-port-mdpi', 320, 480],
    ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600],
    ['drawable-port-xxxhdpi', 1280, 1920],
    ['drawable-land-mdpi', 480, 320],
    ['drawable-land-hdpi', 800, 480],
    ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960],
    ['drawable-land-xxxhdpi', 1920, 1280],
  ];
  for (const [dir, width, height] of splash) {
    await writeSplash(path.join(root, 'android', 'app', 'src', 'main', 'res', dir, 'splash.png'), width, height);
  }

  console.log('Premium Oracle Messenger icons generated.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
