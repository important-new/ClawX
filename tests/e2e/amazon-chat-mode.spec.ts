import { closeElectronApp, expect, getStableWindow, test as baseTest } from './fixtures/electron';

// Same Windows EBUSY tolerance as the pipeline-wizard spec.
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

/** Helper: navigate from main layout to the Amazon ChatMode page. */
async function gotoChatMode(page: import('@playwright/test').Page) {
  await page.getByTestId('sidebar-nav-amazon').click();
  await page.waitForTimeout(800);
  // ModeCard headings (rendered by ModeCard component); click the 对话模式 card.
  await page.getByText('对话模式', { exact: true }).first().click();
  // Wait for ChatMode landing — look for the welcome banner produced by ChatMode.tsx.
  await expect(page.getByText('ClawX 选品 AI 助手')).toBeVisible({ timeout: 10000 });
}

test.describe('Amazon ChatMode — landing & basic interactions', () => {
  test('navigates from sidebar → 对话模式 → renders welcome', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await gotoChatMode(page);

      // Pipeline-data toggle button is the gateway for loading prior sessions.
      await expect(page.getByText('Pipeline 数据')).toBeVisible();

      // Composer should be present and ready to accept text.
      const composer = page.locator('textarea, input[type="text"]').filter({
        hasText: '',
      }).last();
      await expect(composer).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('opens the Pipeline session picker on click', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await gotoChatMode(page);

      // Click the 'Pipeline 数据' chip — it should expand a panel that either
      // lists scanned sessions or an empty-state message.
      await page.getByText('Pipeline 数据').click();

      // Either we see existing sessions or the empty-state — both are valid.
      const panel = page.locator('text=暂无 Pipeline 会话')
        .or(page.locator('text=刷新'));
      await expect(panel).toBeVisible({ timeout: 5000 });
    } finally {
      await closeElectronApp(app);
    }
  });
});
