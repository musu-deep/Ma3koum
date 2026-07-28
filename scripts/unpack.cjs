const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const marker = path.join(root, 'src', 'App.tsx');

function unpackSources() {
  if (fs.existsSync(marker)) {
    console.log('Ma3koum sources are already unpacked.');
    return;
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
}

function patchCloudRunPort() {
  const serverPath = path.join(root, 'server.ts');
  if (!fs.existsSync(serverPath)) {
    throw new Error('server.ts was not found after unpacking the project.');
  }

  const source = fs.readFileSync(serverPath, 'utf8');
  if (source.includes('process.env.PORT')) {
    console.log('Cloud Run PORT support is already configured.');
    return;
  }

  const patched = source.replace(
    /const\s+PORT\s*=\s*3000\s*;/,
    'const PORT = Number(process.env.PORT) || 8080;',
  );

  if (patched === source) {
    throw new Error('Could not locate the fixed PORT declaration in server.ts.');
  }

  fs.writeFileSync(serverPath, patched);
  console.log('Cloud Run PORT support configured successfully.');
}

unpackSources();
patchCloudRunPort();
