import { closeElectronApp, expect, getStableWindow, test as baseTest } from './fixtures/electron';

// Override userDataDir fixture to tolerate EBUSY cleanup errors on Windows
// (Chromium DIPS/WAL files may still be locked after process.kill)
const test = baseTest.extend({
  userDataDir: async ({}, provideUserDataDir) => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'clawx-e2e-user-data-'));
    try {
      await provideUserDataDir(dir);
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 }).catch(() => {});
    }
  },
});

/** Helper: navigate from main layout to the Pipeline Wizard page. */
async function gotoPipelineWizard(page: import('@playwright/test').Page) {
  await page.getByTestId('sidebar-nav-amazon').click();
  await page.waitForTimeout(1000);
  await page.getByText('Pipeline 向导').click();
  await expect(page.getByTestId('pipeline-wizard')).toBeVisible({ timeout: 10000 });
}

test.describe('Amazon Pipeline Wizard — full user flow', () => {
  test('step 1: configures session, market, and phases', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();

      await gotoPipelineWizard(page);

      // Session name
      const sessionInput = page.getByTestId('pipeline-session-name');
      await expect(sessionInput).toBeVisible();
      await sessionInput.clear();
      await sessionInput.fill('e2e-test-session');
      await expect(sessionInput).toHaveValue('e2e-test-session');

      // CDP port
      const cdpInput = page.getByTestId('pipeline-cdp-port');
      await expect(cdpInput).toBeVisible();
      await cdpInput.clear();
      await cdpInput.fill('9222');
      await expect(cdpInput).toHaveValue('9222');

      // Select JP market
      await page.getByText('日本 (Amazon.co.jp)').click();

      // Phase 1 always on
      await expect(page.getByText('(必需)')).toBeVisible();

      // All 6 phase cards visible
      await expect(page.getByText('搜索采样')).toBeVisible();
      await expect(page.getByText('卖家验证')).toBeVisible();
      await expect(page.getByText('店铺分析')).toBeVisible();
      await expect(page.getByText('产品详情')).toBeVisible();
      await expect(page.getByText('关键词分析')).toBeVisible();
      await expect(page.getByText('生成报告')).toBeVisible();

    } finally {
      await closeElectronApp(app);
    }
  });

  test('step 2: navigates to filters and shows filter form', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();

      await gotoPipelineWizard(page);

      // Go to filters
      await page.getByTestId('pipeline-next-button').click();

      // Filters step rendered
      await expect(page.getByRole('heading', { name: '筛选参数' })).toBeVisible();
      await expect(page.getByText('按阶段配置各项筛选阈值')).toBeVisible();

      // "开始执行" button visible
      await expect(page.getByTestId('pipeline-next-button')).toContainText('开始执行');

      // Can go back to config
      await page.getByText('上一步').click();
      await expect(page.getByRole('heading', { name: '会话配置' })).toBeVisible();

    } finally {
      await closeElectronApp(app);
    }
  });

  test('step 3: execution monitoring UI renders correctly', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();

      await gotoPipelineWizard(page);

      // Config → Filters → Execute
      await page.getByTestId('pipeline-next-button').click();
      await expect(page.getByRole('heading', { name: '筛选参数' })).toBeVisible();
      await page.getByTestId('pipeline-next-button').click();

      // Execution monitoring UI
      await expect(page.getByRole('heading', { name: '执行监控' })).toBeVisible({ timeout: 15000 });

      // Status and progress
      await expect(page.getByTestId('pipeline-status')).toHaveText('执行中...');
      await expect(page.getByTestId('pipeline-progress')).toHaveText('0%');

      // Stop button visible
      await expect(page.getByTestId('pipeline-stop-button')).toBeVisible();

      // Phase timeline: first phase running
      await expect(page.getByText('运行中')).toBeVisible();

    } finally {
      // Force kill to avoid hanging on Python subprocess, then wait briefly
      // for file handles to release before fixture cleanup
      try {
        app.process().kill();
        await new Promise(r => setTimeout(r, 2000));
      } catch { /* ignore */ }
    }
  });
});
