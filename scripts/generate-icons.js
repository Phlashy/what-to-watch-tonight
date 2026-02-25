#!/usr/bin/env node
/**
 * generate-icons.js
 * Creates client/public/icons/icon-192.png and icon-512.png
 * using only Node built-ins (zlib, fs, path) — no extra dependencies.
 *
 * Design: slate-950 background (#0f172a) with a simple film-strip
 * shape in amber-400 (#fbbf24). Good enough to be recognisable;
 * replace with a real design file later if desired.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'client', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── PNG helpers ───────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len       = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcInput  = Buffer.concat([typeBytes, data]);
  const crcBuf    = Buffer.alloc(4);  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function makePNG(pixels, size) {
  // pixels: Uint8Array of size*size*4 (RGBA)
  // PNG signature
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 2;  // colour type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Image data: one filter byte (0) + RGB per scanline
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter = None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 3) + 1 + x * 3;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Draw function ─────────────────────────────────────────────────────────────

function drawIcon(size) {
  const px  = new Uint8Array(size * size * 4);
  const BG  = [0x0f, 0x17, 0x2a]; // slate-950
  const AMB = [0xfb, 0xbf, 0x24]; // amber-400
  const WHT = [0xf8, 0xfa, 0xfc]; // slate-50

  function setPixel(x, y, rgb) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = rgb[0]; px[i+1] = rgb[1]; px[i+2] = rgb[2]; px[i+3] = 255;
  }
  function fillRect(x, y, w, h, rgb) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, rgb);
  }
  function circle(cx, cy, r, rgb) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx*dx + dy*dy <= r*r) setPixel(cx+dx, cy+dy, rgb);
  }
  function roundRect(x, y, w, h, r, rgb) {
    fillRect(x + r, y,     w - 2*r, h,     rgb);
    fillRect(x,     y + r, w,       h-2*r, rgb);
    circle(x+r,   y+r,   r, rgb);
    circle(x+w-r-1, y+r,   r, rgb);
    circle(x+r,   y+h-r-1, r, rgb);
    circle(x+w-r-1, y+h-r-1, r, rgb);
  }

  // Fill background
  fillRect(0, 0, size, size, BG);

  // Draw a rounded square "screen" in amber
  const pad  = Math.round(size * 0.14);
  const sw   = size - pad * 2;
  const sh   = Math.round(sw * 0.72);
  const sy   = Math.round(size * 0.5 - sh * 0.5) + Math.round(size * 0.05);
  const cr   = Math.round(sw * 0.08);
  roundRect(pad, sy, sw, sh, cr, AMB);

  // Inner dark "screen area"
  const ip   = Math.round(sw * 0.07);
  roundRect(pad + ip, sy + ip, sw - ip*2, sh - ip*2, Math.max(2, cr - ip), BG);

  // Film sprocket holes — top row
  const hSize = Math.round(sw * 0.07);
  const hGap  = Math.round(sw / 5);
  for (let i = 0; i < 4; i++) {
    const hx = pad + ip + i * hGap + Math.round(hGap * 0.1);
    fillRect(hx, sy + Math.round(ip * 0.2), hSize, Math.round(ip * 0.6), BG);
  }
  // Film sprocket holes — bottom row
  for (let i = 0; i < 4; i++) {
    const hx = pad + ip + i * hGap + Math.round(hGap * 0.1);
    fillRect(hx, sy + sh - Math.round(ip * 0.8), hSize, Math.round(ip * 0.6), BG);
  }

  // Play triangle in the centre
  const tx   = Math.round(size * 0.5);
  const ty   = Math.round(size * 0.5) + Math.round(size * 0.04);
  const tr   = Math.round(sw * 0.14);
  for (let dy = -tr; dy <= tr; dy++) {
    const halfW = Math.round(tr * (1 - Math.abs(dy) / tr) * 0.75);
    for (let dx = Math.round(-halfW * 0.3); dx <= halfW; dx++) {
      setPixel(tx + dx, ty + dy, WHT);
    }
  }

  return px;
}

// ── Generate both sizes ───────────────────────────────────────────────────────

for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png    = makePNG(pixels, size);
  const out    = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ ${out} (${png.length} bytes)`);
}

console.log('\nIcons written to client/public/icons/');
