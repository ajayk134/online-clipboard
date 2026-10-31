// scripts/sync-vendor.js — copies frontend vendor libs from node_modules into public/vendor
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'public', 'vendor');
fs.mkdirSync(path.join(dest, 'css'), { recursive: true });
fs.mkdirSync(path.join(dest, 'js'), { recursive: true });

const copies = [
  ['node_modules/quill/dist/quill.js', 'vendor/js/quill.js'],
  ['node_modules/quill/dist/quill.snow.css', 'vendor/css/quill.snow.css'],
  ['node_modules/@highlightjs/cdn-assets/highlight.min.js', 'vendor/js/highlight.min.js'],
  ['node_modules/@highlightjs/cdn-assets/styles/github.min.css', 'vendor/css/hljs-github.css'],
  ['node_modules/@highlightjs/cdn-assets/styles/github-dark.min.css', 'vendor/css/hljs-github-dark.css'],
];

let ok = 0;
for (const [src, rel] of copies) {
  const from = path.join(root, src);
  const to = path.join(root, 'public', rel);
  try {
    fs.copyFileSync(from, to);
    ok++;
    console.log(`copied ${src} -> public/${rel}`);
  } catch (err) {
    console.error(`FAILED ${src}: ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`${ok}/${copies.length} vendor files synced`);
