// Generates PWA icons (PNG) with a terminal-window icon design.
// Uses pure Node.js (zlib) — no external dependencies.
import { deflateRawSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "dist", "assets");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crc]);
}

function createPNG(width, height, getPixel) {
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const p = y * stride + 1 + x * 4;
      raw[p] = Math.max(0, Math.min(255, Math.round(r)));
      raw[p+1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[p+2] = Math.max(0, Math.min(255, Math.round(b)));
      raw[p+3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const compressed = deflateRawSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", Buffer.alloc(0))]);
}

function sdist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
}

function generateIcon(size) {
  const ss = 4; // supersample
  const s = size * ss;
  const half = s / 2;

  // Color palette
  const bg = [13, 17, 23];        // #0d1117
  const accent = [125, 211, 252]; // #7dd3fc
  const glow = [30, 60, 90];

  const accum = new Float64Array(size * size * 4);

  for (let sy = 0; sy < s; sy++) {
    for (let sx = 0; sx < s; sx++) {
      // Normalize to -1..1 with aspect ratio
      const x = (sx / s) * 2 - 1;
      const y = (sy / s) * 2 - 1;

      // Terminal window: rounded rect shape
      const rx = 0.85, ry = 0.8, cr = 0.2;
      let dist;
      // Distance to rounded rect
      const ax = Math.abs(x) - (rx - cr), ay = Math.abs(y) - (ry - cr);
      if (ax > 0 && ay > 0) {
        dist = Math.sqrt(ax * ax + ay * ay);
      } else if (ax > 0) {
        dist = ax;
      } else if (ay > 0) {
        dist = ay;
      } else {
        dist = Math.max(ax, ay); // inside
      }

      // Anti-aliased edge
      if (dist > 0.015) continue; // outside, skip
      const alpha = dist < -0.015 ? 1 : (1 - (dist + 0.015) / 0.03);

      // Pixel color
      let r = bg[0], g = bg[1], b = bg[2];

      // Draw a subtle glow inside
      const innerGlow = Math.sqrt(x * x + y * y) / 0.9;
      if (innerGlow < 0.8) {
        const t = 1 - innerGlow / 0.8;
        r += Math.round(glow[0] * t * 0.5);
        g += Math.round(glow[1] * t * 0.5);
        b += Math.round(glow[2] * t * 0.5);
      }

      // Draw ">_" prompt using simple geometric shapes
      // ">" chevron: two angled strokes
      const px = 0.05, py = 0.0;

      // Upper stroke of ">"
      const d1 = sdist(x, y, px - 0.15, py - 0.15, px + 0.15, py + 0.15);
      // Lower stroke of ">"
      const d2 = sdist(x, y, px - 0.15, py + 0.15, px + 0.15, py - 0.15);

      const strokeW = 0.04;
      const strokeGlow = 0.02;

      if (d1 < strokeW + strokeGlow || d2 < strokeW + strokeGlow) {
        const t = Math.min(1, Math.max(0, 1 - (Math.min(d1, d2) - strokeW) / strokeGlow));
        r = Math.round(r + (accent[0] - r) * t);
        g = Math.round(g + (accent[1] - g) * t);
        b = Math.round(b + (accent[2] - b) * t);
      }

      // "_" cursor to the right
      const cu = 0.32, cv = 0.18;
      const dc = Math.abs(y - cv);
      const hc = Math.abs(x - cu);
      const cw = 0.12, ch = 0.03;
      if (hc < cw && dc < ch) {
        const t = Math.min(1, 1 - (dc - ch * 0.6) / (ch * 0.4));
        const t2 = Math.min(1, 1 - Math.max(0, x - (cu - cw * 0.6)) / (cw * 0.4));
        const t3 = Math.min(1, 1 - Math.max(0, (cu + cw * 0.6) - x) / (cw * 0.4));
        const final = Math.min(t, Math.max(t2, t3));
        r = Math.round(r + (accent[0] - r) * final);
        g = Math.round(g + (accent[1] - g) * final);
        b = Math.round(b + (accent[2] - b) * final);
      }

      // Accumulate into output
      const oi = (Math.floor(sy / ss) * size + Math.floor(sx / ss)) * 4;
      accum[oi] += r * alpha;
      accum[oi+1] += g * alpha;
      accum[oi+2] += b * alpha;
      accum[oi+3] += alpha;
    }
  }

  return createPNG(size, size, (x, y) => {
    const i = (y * size + x) * 4;
    const a = accum[i+3];
    if (a === 0) return [0, 0, 0, 0];
    const inv = 1 / (ss * ss);
    return [accum[i] / a, accum[i+1] / a, accum[i+2] / a, Math.round(a * inv * 255)];
  });
}

mkdirSync(ICONS_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = generateIcon(size);
  const outPath = join(ICONS_DIR, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`[generate-icons] wrote ${outPath} (${png.length} bytes)`);
}
