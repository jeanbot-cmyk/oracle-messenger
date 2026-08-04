const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', '@capacitor', 'cli', 'dist', 'util', 'template.js');

if (!fs.existsSync(file)) {
  process.exit(0);
}

const source = fs.readFileSync(file, 'utf8');
const original = 'await tar_1.default.extract({ file: src, cwd: dir });';
const patched = [
  'const tarModule = tar_1.default || require("tar");',
  '    const extract = tarModule.extract || tarModule.x;',
  '    await extract({ file: src, cwd: dir });',
].join('\n    ');

if (source.includes(patched)) {
  process.exit(0);
}

if (!source.includes(original)) {
  process.exit(0);
}

fs.writeFileSync(file, source.replace(original, patched));
