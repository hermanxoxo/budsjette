/**
 * Genererer app-ikoner (PNG) uten eksterne avhengigheter.
 * Tegner en avrundet firkant med gradient og et enkelt søylediagram-glyf.
 *
 * Kjør: node build/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');

const TOP = [99, 102, 241]; // indigo-500
const BOTTOM = [56, 189, 248]; // sky-400
const WHITE = [255, 255, 255];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Avstand til avrundet rektangel (negativ = inni). */
function roundedRectSdf(x, y, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
}

/** Myk kant: 1 inni, 0 utenfor. */
function coverage(sdf, feather = 1.2) {
  return Math.min(1, Math.max(0, 0.5 - sdf / feather));
}

function blend(dst, i, color, alpha) {
  if (alpha <= 0) return;
  const a = Math.min(1, alpha);
  dst[i] = Math.round(dst[i] * (1 - a) + color[0] * a);
  dst[i + 1] = Math.round(dst[i + 1] * (1 - a) + color[1] * a);
  dst[i + 2] = Math.round(dst[i + 2] * (1 - a) + color[2] * a);
  dst[i + 3] = Math.max(dst[i + 3], Math.round(255 * a));
}

function drawIcon(size, { padding = 0 } = {}) {
  const px = new Uint8Array(size * size * 4); // RGBA, start transparent
  const inset = size * padding;
  const boxHalf = (size - inset * 2) / 2;
  const c = size / 2;
  const radius = boxHalf * 0.46;

  // Bakgrunn med vertikal gradient
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const rowColor = lerp(TOP, BOTTOM, t * 0.95);
    for (let x = 0; x < size; x++) {
      const cov = coverage(roundedRectSdf(x + 0.5, y + 0.5, c, c, boxHalf, boxHalf, radius), size * 0.004 + 1);
      if (cov > 0) blend(px, (y * size + x) * 4, rowColor, cov);
    }
  }

  // Søylediagram-glyf: tre søyler med avrundede hjørner
  const inner = boxHalf * 2 * 0.56;
  const baseY = c + inner * 0.52;
  const barW = inner * 0.2;
  const gap = inner * 0.12;
  const heights = [0.42, 0.72, 1.0];
  const totalW = barW * 3 + gap * 2;
  const startX = c - totalW / 2 + barW / 2;

  heights.forEach((h, idx) => {
    const barH = inner * h;
    const bx = startX + idx * (barW + gap);
    const by = baseY - barH / 2;
    for (let y = Math.floor(by - barH); y < Math.ceil(by + barH); y++) {
      if (y < 0 || y >= size) continue;
      for (let x = Math.floor(bx - barW); x < Math.ceil(bx + barW); x++) {
        if (x < 0 || x >= size) continue;
        const cov = coverage(
          roundedRectSdf(x + 0.5, y + 0.5, bx, by, barW / 2, barH / 2, Math.min(barW / 2, inner * 0.06)),
          size * 0.004 + 1,
        );
        if (cov > 0) blend(px, (y * size + x) * 4, WHITE, cov * 0.96);
      }
    }
  });

  // Liten "mynt"/prikk oppe til venstre for å antyde penger
  const dotR = inner * 0.11;
  const dx = c - inner * 0.42;
  const dy = c - inner * 0.42;
  for (let y = Math.floor(dy - dotR - 2); y <= Math.ceil(dy + dotR + 2); y++) {
    if (y < 0 || y >= size) continue;
    for (let x = Math.floor(dx - dotR - 2); x <= Math.ceil(dx + dotR + 2); x++) {
      if (x < 0 || x >= size) continue;
      const d = Math.hypot(x + 0.5 - dx, y + 0.5 - dy) - dotR;
      const cov = coverage(d, size * 0.004 + 1);
      if (cov > 0) blend(px, (y * size + x) * 4, WHITE, cov * 0.9);
    }
  }

  return px;
}

/* ---------- Minimal PNG-encoder ---------- */
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
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- Skriv filer ---------- */
mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.12 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0 },
  { file: 'favicon-64.png', size: 64, padding: 0 },
];

for (const t of targets) {
  const px = drawIcon(t.size, { padding: t.padding });
  writeFileSync(resolve(outDir, t.file), encodePng(t.size, t.size, px));
  console.log(`✓ ${t.file} (${t.size}x${t.size})`);
}

// Vektorikon for favicon i moderne nettlesere
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#38bdf8"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="118" fill="url(#g)"/>
  <circle cx="186" cy="186" r="32" fill="#fff" fill-opacity="0.9"/>
  <g fill="#fff" fill-opacity="0.96">
    <rect x="166" y="274" width="58" height="76" rx="18"/>
    <rect x="249" y="236" width="58" height="114" rx="18"/>
    <rect x="332" y="186" width="58" height="164" rx="18"/>
  </g>
</svg>`;
writeFileSync(resolve(outDir, 'icon.svg'), svg);
console.log('✓ icon.svg');
