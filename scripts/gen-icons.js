// scripts/gen-icons.js — generates PNG app icons (pure Node, no image deps)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- geometry helpers ----
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}
function blend(dst, r, g, b, a) {
  if (a <= 0) return;
  dst[0] = Math.round(r * a + dst[0] * (1 - a));
  dst[1] = Math.round(g * a + dst[1] * (1 - a));
  dst[2] = Math.round(b * a + dst[2] * (1 - a));
  dst[3] = Math.max(dst[3], Math.round(a * 255));
}

function drawIcon(size, { maskable = false, transparentCorners = false } = {}) {
  const img = Buffer.alloc(size * size * 4);
  const S = size / 512; // scale relative to design space
  // maskable safe zone: keep art within ~78% of canvas
  const pad = maskable ? 0.82 : 1;
  const corner = 96 * S;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const dst = img.subarray((y * size + x) * 4, (y * size + x) * 4 + 4);

      // background gradient (rounded or square)
      const bgd = transparentCorners ? sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, corner) : -1;
      const bgA = transparentCorners ? clamp01(0.5 - bgd) : 1;
      if (bgA > 0) {
        const t = py / size;
        blend(dst,
          0x3b + (0x1e - 0x3b) * t,
          0x82 + (0x40 - 0x82) * t,
          0xf6 + (0xaf - 0xf6) * t,
          bgA);
      }

      if (bgA < 0.01) continue;

      // clipboard body (white) — scaled about center for maskable padding
      const body = (v, c) => size / 2 + (v - size / 2) * pad;
      const bw = sdRoundRect(px, py, body(256, 0), body(280, 0), 140 * S * pad, 172 * S * pad, 28 * S * pad);
      const bwA = clamp01(0.5 - bw / S);
      if (bwA > 0) {
        blend(dst, 0xff, 0xff, 0xff, bwA);
        // clip (top tab, slate)
        const cd = sdRoundRect(px, py, body(256, 0), body(108, 0), 40 * S * pad, 24 * S * pad, 14 * S * pad);
        const cA = clamp01(0.5 - cd / S);
        if (cA > 0) blend(dst, 0x64, 0x74, 0x8b, cA);
        // content lines (light blue) + accent bar
        const lines = [
          [156, 190, 356, 206, 0x93, 0xc5, 0xfd],
          [156, 238, 356, 254, 0x93, 0xc5, 0xfd],
          [156, 286, 296, 302, 0x93, 0xc5, 0xfd],
          [156, 334, 300, 350, 0x1d, 0x4e, 0xd8],
        ];
        for (const [x1, y1, x2, y2, r, g, b] of lines) {
          const ld = sdRoundRect(px, py,
            body((x1 + x2) / 2, 0), body((y1 + y2) / 2, 0),
            (x2 - x1) / 2 * S * pad, (y2 - y1) / 2 * S * pad, 8 * S * pad);
          const lA = clamp01(0.5 - ld / S);
          if (lA > 0) blend(dst, r, g, b, lA);
        }
      }
    }
  }
  return encodePNG(size, size, img);
}

const jobs = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-192.png', size: 192, opts: { maskable: true } },
  { file: 'maskable-512.png', size: 512, opts: { maskable: true } },
  { file: 'apple-touch-icon.png', size: 180, opts: { transparentCorners: false } },
  { file: 'favicon-32.png', size: 32, opts: { transparentCorners: true } },
  { file: 'favicon-64.png', size: 64, opts: { transparentCorners: true } },
];

for (const j of jobs) {
  const png = drawIcon(j.size, j.opts || {});
  fs.writeFileSync(path.join(outDir, j.file), png);
  console.log(`wrote public/icons/${j.file} (${png.length} bytes)`);
}
console.log('icons generated');
