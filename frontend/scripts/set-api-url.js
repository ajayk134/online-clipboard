const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts');
const apiUrl = process.env.API_URL;

if (!apiUrl) {
  console.warn('[set-api-url] API_URL env var not set; leaving environment.prod.ts unchanged');
  process.exit(0);
}

let content = fs.readFileSync(envFile, 'utf8');

// Replace the apiUrl line (quoted value) with the API_URL env var.
content = content.replace(
  /apiUrl:\s*'[^']*'/,
  `apiUrl: '${apiUrl}'`
);

fs.writeFileSync(envFile, content, 'utf8');
console.log(`[set-api-url] Set apiUrl to ${apiUrl} in ${envFile}`);
