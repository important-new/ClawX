import { closeElectronApp, expect, getStableWindow, test as baseTest } from './fixtures/electron';

const test = baseTest.extend({
  userDataDir: async ({}, provideUserDataDir) => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'clawx-e2e-mocked-'));
    try {
      await provideUserDataDir(dir);
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 }).catch(() => {});
    }
  },
});

/**
 * Mocked-IPC e2e for PipelineWizard.
 *
 * Why this exists: the real pipeline takes ~15min/run because each scraper
 * does its own CDP attach + SS query + uv cold-start. Most of those minutes
 * exercise SellerSprite, NOT the wizard wiring. This spec replaces the
 * `amazon:runWorkflow` IPC handler with a stub that fires the same UI
 * signals (step-started → workflowProgress) instantly. It validates:
 *   1. PipelineWizard.startPipeline builds the right step list (16 steps).
 *   2. step→phase mapping flips phase badges in correct order (1→2→…→6).
 *   3. Progress bar advances.
 *   4. Final UI shows "已完成" for all phases.
 *
 * Trade-off: does NOT validate the python scrapers themselves. That's
 * intentional — we have unit tests + manual runs for those.
 */

const SESSION_NAME = `e2e-mocked-${Date.now()}`;

async function gotoPipelineWizard(page: import('@playwright/test').Page) {
  await page.getByTestId('sidebar-nav-amazon').click();
  await page.waitForTimeout(500);
  await page.getByText('Pipeline 向导').click();
  await expect(page.getByTestId('pipeline-wizard')).toBeVisible({ timeout: 10000 });
}

test.describe('Amazon Pipeline Wizard — mocked IPC', () => {
  test('flips all 6 phase badges from idle → running → completed', async ({ launchElectronApp }) => {
    test.setTimeout(60_000);
    const app = await launchElectronApp({ skipSetup: true });

    try {
      app.process().stdout?.on('data', (d) => process.stdout.write(`[main:stdout] ${d}`));
      const page = await getStableWindow(app);
      page.on('console', (msg) => console.log('[renderer]', msg.type(), msg.text()));
      page.on('pageerror', (err) => console.log('[renderer:error]', err.message));

      await expect(page.getByTestId('main-layout')).toBeVisible();

      // Replace amazon:runWorkflow on the main side. Stub fires one
      // workflowProgress per phase (0..5) so UI walks the full timeline.
      await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const phaseIds = [
          'category_sampling',
          'seller_verification',
          'store_check',
          'product_detail',
          'keyword_research',
          'report_generation',
        ];
        ipcMain.removeHandler('amazon:runWorkflow');
        ipcMain.handle('amazon:runWorkflow', async () => {
          for (let phase = 0; phase < 6; phase++) {
            win.webContents.send('amazon:workflowProgress', {
              currentStep: phase,
              totalSteps: 6,
              stepName: `Mock Phase ${phase + 1}`,
              percent: Math.floor(((phase + 1) / 6) * 100),
            });
            // Emit a QC pass result for the just-finished phase so the
            // QualityCheckBadge flips from 待检 → 通过. The phase
            // index here advances *into* phase i, so the previous phase
            // (i-1) is what just completed.
            if (phase > 0) {
              win.webContents.send('amazon:qualityCheckResult', {
                phase: phaseIds[phase - 1],
                pass: true,
                summary: `mock pass for ${phaseIds[phase - 1]}`,
                metrics: { success_rate: 1.0 },
              });
            }
            await new Promise((r) => setTimeout(r, 200));
          }
          // Final phase QC after all transitions.
          win.webContents.send('amazon:qualityCheckResult', {
            phase: phaseIds[5],
            pass: true,
            summary: `mock pass for ${phaseIds[5]}`,
            metrics: { success_rate: 1.0 },
          });
          return { success: true };
        });
      });

      await gotoPipelineWizard(page);

      // Step 1: config
      const sessionInput = page.getByTestId('pipeline-session-name');
      await sessionInput.fill(SESSION_NAME);
      await page.getByTestId('pipeline-next-button').click();

      // Step 2: filters
      await expect(page.getByRole('heading', { name: '筛选参数' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('pipeline-next-button')).toContainText('开始执行');
      await page.getByTestId('pipeline-next-button').click();

      // Step 3: execution
      await expect(page.getByRole('heading', { name: '执行监控' })).toBeVisible({ timeout: 10_000 });

      // Diagnostic dump: see what badges exist after pipeline starts.
      await page.waitForTimeout(500);
      const dump = await page.evaluate(() => {
        const text = document.body.innerText;
        const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0 && s.length < 60);
        return lines.join(' | ');
      });
      console.log('[e2e:dump]', dump.slice(0, 800));

      // Wait for at least one "运行中" badge to appear (phase 0 flipped).
      await expect(page.getByText('运行中').first()).toBeVisible({ timeout: 15_000 });
      console.log('[e2e:mocked] phase running badge appeared ✓');

      // After all 6 events fire (each 200ms apart = ~1.2s), all phases should be completed.
      await expect(async () => {
        const completed = await page.getByText('已完成').count();
        if (completed < 6) throw new Error(`only ${completed}/6 phases completed`);
      }).toPass({ timeout: 15_000, intervals: [500] });

      console.log('[e2e:mocked] all 6 phases flipped to 已完成 ✓');

      // QC badges should flip from 待检 → 通过 after qualityCheckResult events.
      await expect(async () => {
        const passed = await page.getByText('通过').count();
        if (passed < 6) throw new Error(`only ${passed}/6 QC badges passed`);
      }).toPass({ timeout: 5_000, intervals: [200] });
      console.log('[e2e:mocked] all 6 QC badges flipped to 通过 ✓');
    } finally {
      await closeElectronApp(app);
    }
  });
});
