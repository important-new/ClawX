import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SKILLS_ROOT = 'D:\\Code\\ClawX\\resources\\amazon-skills';
const WARMUP_MARKER = join(SKILLS_ROOT, '.uv-warmup-done');

async function findPep723Scripts(root: string): Promise<string[]> {
  // Warm every .py with a PEP 723 inline-deps block, not just public
  // .ui.json tools. Some pipeline scripts (e.g. search_by_category) invoke
  // internal workers (ss_search.py) via `uv run`; those workers have their
  // own deps and would otherwise cold-start during the pipeline.
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.py')) {
        try {
          const head = (await readFile(p, 'utf-8')).slice(0, 200);
          if (head.startsWith('# /// script')) out.push(p);
        } catch { /* unreadable, skip */ }
      }
    }
  }
  await walk(root);
  return out;
}

function warmOne(scriptPath: string): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn('uv', ['run', scriptPath, '--help'], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    p.on('exit', finish);
    p.on('error', finish);
    setTimeout(finish, 120_000); // 2min cap per script
  });
}

export default async function globalSetup() {
  // One-shot guard: if marker exists and is < 24h old, skip warmup.
  try {
    const s = await stat(WARMUP_MARKER);
    if (Date.now() - s.mtimeMs < 24 * 3600 * 1000) {
      console.log('[warmup] uv envs already warm (marker < 24h), skipping.');
      return;
    }
  } catch { /* no marker, proceed */ }

  const scripts = await findPep723Scripts(SKILLS_ROOT);
  console.log(`[warmup] priming uv envs for ${scripts.length} scripts in parallel...`);
  const t0 = Date.now();
  await Promise.all(scripts.map(warmOne));
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[warmup] done in ${dt}s.`);

  // Stamp marker (best effort)
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(WARMUP_MARKER, new Date().toISOString());
  } catch { /* ignore */ }
}
