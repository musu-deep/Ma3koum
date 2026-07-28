const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const requiredSourceFiles = [
  path.join(root, 'src', 'App.tsx'),
  path.join(root, 'server.ts'),
  path.join(root, 'vite.config.ts'),
  path.join(root, 'index.html'),
];

const protectedRootEntries = new Set([
  '.dockerignore',
  '.upload',
  'Dockerfile',
  'README.md',
  'package.json',
  'scripts',
]);

function projectSourcesAreReady() {
  return requiredSourceFiles.every((filePath) => fs.existsSync(filePath));
}

function readArchiveChunks(uploadDir) {
  if (!fs.existsSync(uploadDir)) {
    throw new Error('Project archive directory .upload/ was not found.');
  }

  const chunks = fs.readdirSync(uploadDir)
    .map((name) => {
      const match = /^chunk-(\d+)$/.exec(name);
      return match ? { name, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);

  if (!chunks.length) {
    throw new Error('Project archive chunks were not found in .upload/.');
  }

  if (chunks[0].index !== 0) {
    throw new Error(`Project archive must begin with chunk 0, but begins with ${chunks[0].name}.`);
  }

  for (let position = 0; position < chunks.length; position += 1) {
    if (chunks[position].index !== position) {
      throw new Error(
        `Project archive sequence is incomplete: expected chunk ${position}, found ${chunks[position].name}.`,
      );
    }
  }

  const encoded = chunks
    .map(({ name }) => {
      const content = fs.readFileSync(path.join(uploadDir, name), 'utf8').replace(/\s+/g, '');
      if (!content) {
        throw new Error(`Project archive chunk ${name} is empty.`);
      }
      return content;
    })
    .join('');

  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Project archive chunks do not form valid Base64 data.');
  }

  const archive = Buffer.from(encoded, 'base64');
  const localFileHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const endOfCentralDirectory = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

  if (archive.length < 22 || !archive.subarray(0, 4).equals(localFileHeader)) {
    throw new Error('Decoded project archive does not begin with a valid ZIP header.');
  }

  if (archive.lastIndexOf(endOfCentralDirectory) === -1) {
    throw new Error(
      `Decoded project archive is incomplete: ZIP end marker is missing. ` +
      `Loaded ${chunks.length} chunks (${archive.length} bytes).`,
    );
  }

  return { archive, chunks };
}

function runExtractor(zipPath, extractDir) {
  const options = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };

  if (process.platform === 'win32') {
    const escapePs = (value) => value.replace(/'/g, "''");
    return spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${escapePs(zipPath)}' -DestinationPath '${escapePs(extractDir)}' -Force`,
    ], options);
  }

  return spawnSync('unzip', ['-oq', zipPath, '-d', extractDir], options);
}

function copyProjectSources(sourceDir) {
  fs.cpSync(sourceDir, root, {
    recursive: true,
    force: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(sourceDir, sourcePath);
      if (!relativePath) {
        return true;
      }

      const rootEntry = relativePath.split(path.sep)[0];
      return !protectedRootEntries.has(rootEntry);
    },
  });
}

function unpackSources() {
  if (projectSourcesAreReady()) {
    console.log('Ma3koum sources are already unpacked.');
    return;
  }

  const uploadDir = path.join(root, '.upload');
  const { archive, chunks } = readArchiveChunks(uploadDir);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma3koum-'));
  const zipPath = path.join(workDir, 'Ma3koum-main.zip');
  const extractDir = path.join(workDir, 'extracted');

  try {
    fs.mkdirSync(extractDir);
    fs.writeFileSync(zipPath, archive);

    console.log(
      `Reconstructed project archive from ${chunks.length} chunks (${archive.length} bytes).`,
    );

    const result = runExtractor(zipPath, extractDir);

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error || result.status !== 0) {
      const details = [
        `Archive extraction failed with status ${result.status}.`,
        `Archive: ${zipPath}`,
        `Chunks: ${chunks.map(({ name }) => name).join(', ')}`,
        result.stderr ? `Extractor error: ${result.stderr.trim()}` : null,
      ].filter(Boolean).join('\n');

      throw result.error || new Error(details);
    }

    const sourceDir = path.join(extractDir, 'Ma3koum-main');
    if (!fs.existsSync(sourceDir)) {
      throw new Error('The expected Ma3koum-main directory was not found in the archive.');
    }

    copyProjectSources(sourceDir);

    if (!projectSourcesAreReady()) {
      throw new Error('Project archive was extracted, but required source files are still missing.');
    }

    console.log('Ma3koum project sources unpacked successfully.');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
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
