const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const marker = path.join(root, 'src', 'App.tsx');

if (fs.existsSync(marker)) {
  console.log('Ma3koum sources are already unpacked.');
  process.exit(0);
}

const uploadDir = path.join(root, '.upload');
const chunks = fs.readdirSync(uploadDir)
  .filter((name) => /^chunk-\d+$/.test(name))
  .sort();

if (!chunks.length) {
  throw new Error('Project archive chunks were not found in .upload/.');
}

const encoded = chunks
  .map((name) => fs.readFileSync(path.join(uploadDir, name), 'utf8').trim())
  .join('');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma3koum-'));
const zipPath = path.join(workDir, 'Ma3koum-main.zip');
const extractDir = path.join(workDir, 'extracted');
fs.mkdirSync(extractDir);
fs.writeFileSync(zipPath, Buffer.from(encoded, 'base64'));

let result;
if (process.platform === 'win32') {
  const escapePs = (value) => value.replace(/'/g, "''");
  result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -LiteralPath '${escapePs(zipPath)}' -DestinationPath '${escapePs(extractDir)}' -Force`,
  ], { stdio: 'inherit' });
} else {
  result = spawnSync('unzip', ['-oq', zipPath, '-d', extractDir], { stdio: 'inherit' });
}

if (result.error || result.status !== 0) {
  throw result.error || new Error(`Archive extraction failed with status ${result.status}.`);
}

const sourceDir = path.join(extractDir, 'Ma3koum-main');
if (!fs.existsSync(sourceDir)) {
  throw new Error('The expected Ma3koum-main directory was not found in the archive.');
}

fs.cpSync(sourceDir, root, { recursive: true, force: true });
fs.rmSync(workDir, { recursive: true, force: true });
console.log('Ma3koum project sources unpacked successfully.');
