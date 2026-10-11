// 배포본 zip 만들기 —  node scripts/pack.mjs
//
// 받는 사람이 압축을 풀고 Vercel에 올리면 바로 쓸 수 있는 소스 묶음을 만든다.
// node_modules·.next·.git·개인 설정(ohome.config.json, .env*)은 제외한다.
import { createWriteStream } from 'node:fs';
import { readdir, stat, readFile, mkdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DIR = join(root, 'dist');

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.vercel', 'coverage']);
const SKIP_FILES = new Set([
  'ohome.config.json',      // 배포한 사람의 DB 연결 정보 — 절대 같이 넣지 않는다
  '.env', '.env.local', '.env.production',
  'tsconfig.tsbuildinfo', '.claude-launch-check', '.DS_Store',
]);

async function walk(dir, zip, base) {
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full).split(sep).join('/');
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const s = await stat(full);
    if (s.isDirectory()) await walk(full, zip, base);
    else zip.file(rel, await readFile(full));
  }
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zip = new JSZip();
await walk(root, zip, root);

await mkdir(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const out = join(OUT_DIR, `ohome-${pkg.version ?? '1.0.0'}-${stamp}.zip`);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await new Promise((res, rej) => {
  const w = createWriteStream(out);
  w.on('finish', res); w.on('error', rej);
  w.end(buf);
});

const files = Object.keys(zip.files).filter(f => !zip.files[f].dir).length;
console.log(`배포본 생성: ${relative(root, out)}  (파일 ${files}개 · ${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
console.log('받는 사람: 압축 해제 → GitHub에 올리기 → Vercel Import → 접속하면 설치 화면');
