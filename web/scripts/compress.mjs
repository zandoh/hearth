// Precompress dist/ for the embedded server. The Go binary serves whatever
// vite emits with no runtime compression (std-lib http has none), so the
// build writes .br/.gz siblings next to every compressible asset and the
// server content-negotiates between them. Runs from the Makefile `web`
// target only — the GitHub Pages demo is compressed by Pages itself.
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Text-based formats only: fonts (woff/woff2) and images are already
// internally compressed and re-compressing them wastes binary size.
const COMPRESSIBLE = /\.(js|css|html|svg|json|txt|xml|webmanifest)$/;
const MIN_BYTES = 1024; // below this the headers outweigh the savings

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const dist = new URL("../dist", import.meta.url).pathname;
let files = 0;
let raw = 0;
let br = 0;
for (const path of walk(dist)) {
  if (!COMPRESSIBLE.test(path)) continue;
  if (statSync(path).size < MIN_BYTES) continue;
  const data = readFileSync(path);
  const gz = gzipSync(data, { level: 9 });
  const bro = brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });
  // A variant that fails to shrink is dead weight in the binary; skip it.
  if (gz.length < data.length) writeFileSync(path + ".gz", gz);
  if (bro.length < data.length) writeFileSync(path + ".br", bro);
  files++;
  raw += data.length;
  br += Math.min(bro.length, data.length);
}
console.log(
  `precompressed ${files} files: ${(raw / 1024).toFixed(0)}KB → ${(br / 1024).toFixed(0)}KB brotli`,
);
