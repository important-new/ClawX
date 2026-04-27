#!/usr/bin/env zx

/**
 * download-bundled-python.mjs
 *
 * Downloads a standalone Python build (via uv) for offline bundling.
 * The downloaded Python is placed in resources/python/ and will be
 * copied into the installer via electron-builder extraResources.
 *
 * Usage:
 *   pnpm run python:download          # current platform
 *   pnpm run python:download:win      # Windows x64
 */

import 'zx/globals';

const ROOT_DIR = path.resolve(__dirname, '..');
const PYTHON_VERSION = '3.12';
const OUTPUT_DIR = path.join(ROOT_DIR, 'resources', 'python');

// Determine platform
const args = argv;
let platform = `${process.platform}-${process.arch}`;
if (args.platform === 'win') platform = 'win32-x64';
else if (args.platform === 'mac') platform = 'darwin-arm64';
else if (args.platform === 'linux') platform = 'linux-x64';

// Find uv binary
const uvBinName = process.platform === 'win32' ? 'uv.exe' : 'uv';
const target = `${process.platform}-${process.arch}`;
const bundledUv = path.join(ROOT_DIR, 'resources', 'bin', target, uvBinName);

let uvBin = 'uv';
if (fs.existsSync(bundledUv)) {
  uvBin = bundledUv;
  console.log(`Using bundled uv: ${uvBin}`);
} else {
  console.log('Using system uv from PATH');
}

// Ensure output directory exists
await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

// Use uv to download Python to a known location
// uv python install writes to its managed directory; we then copy it
console.log(`Downloading Python ${PYTHON_VERSION} for ${platform}...`);

try {
  // Install Python via uv
  await $`${uvBin} python install ${PYTHON_VERSION}`;

  // Find the installed Python path
  const pythonPath = (await $`${uvBin} python find ${PYTHON_VERSION}`).stdout.trim();
  if (!pythonPath) {
    throw new Error('Could not find installed Python path');
  }

  console.log(`Python ${PYTHON_VERSION} found at: ${pythonPath}`);

  // The Python installation is typically in ~/.local/share/uv/python/ (Linux/Mac)
  // or %APPDATA%\uv\python\ (Windows)
  // We need the entire Python directory, not just the binary
  const pythonBinDir = path.dirname(pythonPath);
  // On Windows: pythonBinDir is the install root
  // On Unix: pythonBinDir is <root>/bin, so go up one level
  const pythonRoot = process.platform === 'win32'
    ? pythonBinDir
    : path.dirname(pythonBinDir);

  console.log(`Python root: ${pythonRoot}`);

  // Copy the Python installation to our resources directory
  const destDir = path.join(OUTPUT_DIR, platform);
  if (fs.existsSync(destDir)) {
    await fs.promises.rm(destDir, { recursive: true });
  }

  console.log(`Copying Python to ${destDir}...`);
  await fs.promises.cp(pythonRoot, destDir, { recursive: true });

  // Verify
  const verifyBin = process.platform === 'win32'
    ? path.join(destDir, 'python.exe')
    : path.join(destDir, 'bin', 'python3');

  if (fs.existsSync(verifyBin)) {
    console.log(`✓ Python ${PYTHON_VERSION} bundled successfully at ${destDir}`);
  } else {
    console.warn(`⚠ Python binary not found at expected location: ${verifyBin}`);
    console.log('Directory contents:', await fs.promises.readdir(destDir));
  }
} catch (err) {
  console.error(`Failed to download Python ${PYTHON_VERSION}:`, err.message);
  process.exit(1);
}
