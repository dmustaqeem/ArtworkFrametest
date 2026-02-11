import { existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

const requiredFiles = [
  'assets/hdr/studio3.hdr',
  'assets/hdr/studio2.hdr',
  'assets/hdr/studio.hdr'
];

console.log('Verifying required assets in dist folder...\n');

let allFilesExist = true;

for (const file of requiredFiles) {
  const filePath = join(distDir, file);
  if (existsSync(filePath)) {
    const stats = statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✓ ${file} exists (${sizeMB} MB)`);
  } else {
    console.error(`✗ ${file} is MISSING from dist folder!`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error('\n❌ Some required assets are missing from dist folder!');
  console.error('This will cause 404 errors on Vercel.');
  console.error('Check that files in public/ are being copied correctly.');
  process.exit(1);
}

console.log('\n✅ All required assets are present in dist folder.');
