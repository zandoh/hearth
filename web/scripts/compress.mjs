// Precompresses dist/ for the embedded server. The Go std-lib server has no runtime
// compression, so the build writes .br/.gz siblings next to each compressible asset,
// and the server picks one per request. Only the Makefile `web` target runs this.
// GitHub Pages compresses the demo itself.
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Text formats only. Fonts (woff, woff2) and images are already compressed, and
// compressing again wastes binary size.
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
  // A variant that doesn't shrink is dead weight in the binary. Skip it.
  if (gz.length < data.length) writeFileSync(path + ".gz", gz);
  if (bro.length < data.length) writeFileSync(path + ".br", bro);
  files++;
  raw += data.length;
  br += Math.min(bro.length, data.length);
}
console.log(
  `precompressed ${files} files: ${(raw / 1024).toFixed(0)}KB → ${(br / 1024).toFixed(0)}KB brotli`,
);
