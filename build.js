// Joins the source files listed in js/manifest.json into one app.js (single request, loaded with defer).
// Usage: node build.js        (npm run build)
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const { files } = JSON.parse(fs.readFileSync(path.join(root, 'js', 'manifest.json'), 'utf8'));
const out = files.map(f => `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(root, f), 'utf8').replace(/\n*$/, '\n')).join('\n');
fs.writeFileSync(path.join(root, 'app.js'), out);
console.log(`app.js built: ${files.length} files, ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
