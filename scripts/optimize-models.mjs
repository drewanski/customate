#!/usr/bin/env node
/**
 * Optimize every .glb in public/models/ and public/oversized-t-shirt/
 * using gltfpack with meshopt compression. Outputs to public/models-optimized/.
 *
 * Usage:
 *   npm run optimize:models           # produce optimized files (alongside originals)
 *   npm run optimize:models -- --replace   # replace originals (BACKS UP first)
 *
 * Tip: drei's useGLTF already supports the resulting meshopt-compressed GLBs
 * via MeshoptDecoder, which is bundled.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const publicDir = join(repoRoot, 'public');
const outputDir = join(publicDir, 'models-optimized');
const replace = process.argv.includes('--replace');

const sourceDirs = [
  join(publicDir, 'models'),
  join(publicDir, 'oversized-t-shirt'),
];

function collectGlbs() {
  const list = [];
  for (const dir of sourceDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.glb')) list.push(join(dir, name));
    }
  }
  return list;
}

function fmt(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

const files = collectGlbs();
if (files.length === 0) {
  console.log('No .glb files found.');
  process.exit(0);
}

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

console.log(`\nOptimizing ${files.length} GLB files...\n`);
let totalBefore = 0;
let totalAfter = 0;

for (const src of files) {
  const name = basename(src);
  const dst = join(outputDir, name);
  const before = statSync(src).size;
  totalBefore += before;

  try {
    // -cc = meshopt compression (drei supports natively)
    // -tc = convert textures to KTX2 (often makes texture files smaller but
    //       needs additional loader config; commented out by default)
    execSync(`npx -y --package=gltfpack gltfpack -cc -i "${src}" -o "${dst}"`, {
      stdio: 'inherit',
    });
    const after = statSync(dst).size;
    totalAfter += after;
    const pct = ((1 - after / before) * 100).toFixed(0);
    console.log(`  ${name}: ${fmt(before)} → ${fmt(after)}  (-${pct}%)`);
  } catch (err) {
    console.error(`  ${name}: FAILED`, err.message);
  }
}

const totalPct = ((1 - totalAfter / totalBefore) * 100).toFixed(0);
console.log(`\nTotal: ${fmt(totalBefore)} → ${fmt(totalAfter)}  (-${totalPct}%)`);

if (replace) {
  console.log('\nReplacing originals (backing up to *.original.glb)...');
  for (const src of files) {
    const name = basename(src);
    const optimized = join(outputDir, name);
    if (!existsSync(optimized)) continue;
    const backup = src.replace('.glb', '.original.glb');
    renameSync(src, backup);
    renameSync(optimized, src);
    console.log(`  ${name} replaced; original kept at ${basename(backup)}`);
  }
  console.log('\nDone. Test the app — if anything looks broken, restore by renaming *.original.glb back.');
} else {
  console.log(`\nOptimized files are in public/models-optimized/.`);
  console.log('To replace originals: npm run optimize:models -- --replace');
}
