/**
 * Build script that works around Node.js v24 + Rollup native crash
 * when the project path contains non-ASCII (e.g. Chinese) characters.
 *
 * Root cause: Node.js v24's fs.cpSync with recursive:true and native
 * Rollup bindings crash (STATUS_STACK_BUFFER_OVERRUN / exit 127) on
 * Windows when the path contains non-ASCII characters.
 *
 * Strategy: use robocopy (Windows native) to copy source to a temp
 * ASCII path, build there, copy output back.
 */
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// Check if path contains non-ASCII characters
const hasNonAscii = /[^\x00-\x7F]/.test(PROJECT_ROOT);

if (!hasNonAscii) {
  console.log('ASCII path detected, running vite build directly...');
  execSync('npx vite build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  // SPA fallback: copy 200.html → index.html for Cloudflare Pages
  const fallback = resolve(PROJECT_ROOT, 'build', '200.html');
  if (existsSync(fallback)) {
    copyFileSync(fallback, resolve(PROJECT_ROOT, 'build', 'index.html'));
    console.log('[build] Copied 200.html → index.html (SPA fallback)');
  }
  process.exit(0);
}

console.log('[build] Non-ASCII path detected, using temp directory workaround...');
const TEMP_DIR = resolve(tmpdir(), 'powerreader-next-build');

/**
 * Use robocopy for file copying (handles non-ASCII paths natively on Windows).
 * robocopy exit codes: 0=no files copied, 1=files copied OK, >=8=error
 */
function robocopy(src, dest, flags = '/E /NJH /NJS /NDL /NP') {
  try {
    execSync(`robocopy "${src}" "${dest}" ${flags}`, {
      stdio: 'pipe',
      windowsHide: true
    });
  } catch (e) {
    // robocopy returns exit code 1 for success (files copied), only >=8 is error
    if (e.status >= 8) {
      throw new Error(`robocopy failed with exit code ${e.status}: ${src} -> ${dest}`);
    }
  }
}

function robocopyFile(srcDir, destDir, filename) {
  try {
    execSync(`robocopy "${srcDir}" "${destDir}" "${filename}" /NJH /NJS /NDL /NP`, {
      stdio: 'pipe',
      windowsHide: true
    });
  } catch (e) {
    if (e.status >= 8) {
      throw new Error(`robocopy file failed: ${filename}`);
    }
  }
}

try {
  // Step 1: Clean and create temp dir
  if (existsSync(TEMP_DIR)) {
    execSync(`rmdir /s /q "${TEMP_DIR}"`, { stdio: 'pipe', windowsHide: true, shell: 'cmd.exe' });
  }
  mkdirSync(TEMP_DIR, { recursive: true });

  // Step 2: Copy project files using robocopy
  console.log('[build] Copying source files...');
  robocopy(resolve(PROJECT_ROOT, 'src'), resolve(TEMP_DIR, 'src'));
  robocopy(resolve(PROJECT_ROOT, 'static'), resolve(TEMP_DIR, 'static'));

  // Copy individual config files
  const configFiles = ['package.json', 'package-lock.json', 'svelte.config.js', 'vite.config.js', 'jsconfig.json'];
  for (const f of configFiles) {
    if (existsSync(resolve(PROJECT_ROOT, f))) {
      robocopyFile(PROJECT_ROOT, TEMP_DIR, f);
    }
  }

  console.log('[build] Files copied to', TEMP_DIR);

  // Step 3: Install dependencies
  console.log('[build] Installing dependencies...');
  execSync('npm install', { cwd: TEMP_DIR, stdio: 'inherit', timeout: 180000 });

  // Step 4: Run vite build
  console.log('[build] Running vite build...');
  execSync('npx vite build', { cwd: TEMP_DIR, stdio: 'inherit', timeout: 180000 });

  // Step 5: Copy build output back using robocopy
  const buildSrc = resolve(TEMP_DIR, 'build');
  const buildDest = resolve(PROJECT_ROOT, 'build');
  if (existsSync(buildSrc)) {
    console.log('[build] Copying build output back...');
    robocopy(buildSrc, buildDest, '/E /PURGE /NJH /NJS /NDL /NP');
    console.log('[build] Build output at', buildDest);
  }

  // SPA fallback: copy 200.html → index.html for Cloudflare Pages
  const fallbackFile = resolve(buildDest, '200.html');
  if (existsSync(fallbackFile)) {
    copyFileSync(fallbackFile, resolve(buildDest, 'index.html'));
    console.log('[build] Copied 200.html → index.html (SPA fallback)');
  }

  console.log('[build] Build completed successfully!');

} finally {
  // Step 6: Cleanup
  try {
    execSync(`rmdir /s /q "${TEMP_DIR}"`, { stdio: 'pipe', windowsHide: true, shell: 'cmd.exe' });
    console.log('[build] Temp directory cleaned up.');
  } catch {
    console.warn('[build] Warning: Could not clean temp dir at', TEMP_DIR);
  }
}
