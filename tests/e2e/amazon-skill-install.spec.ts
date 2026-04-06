import { expect, test } from './fixtures/electron';

test.describe('Amazon Skill Installation Flow', () => {
  test('should show preview after selecting directory and refresh list after confirmation', async ({ page }) => {
    // 1. Skip setup
    await page.getByTestId('setup-skip-button').click();
    await expect(page.getByTestId('main-layout')).toBeVisible();

    // 2. Navigate to Amazon Settings -> Skills tab
    // Note: Adjusting selectors based on AmazonSettings.tsx
    await page.goto('http://localhost:5173/#/amazon/settings'); // Assuming routing
    // Or click sidebar if available
    
    // Wait for the tab to be visible and click 'skills'
    await page.getByRole('button', { name: /Skill/ }).click(); 

    // 3. Mock IPC calls
    await page.evaluate(() => {
      const originalInvoke = window.electron.ipcRenderer.invoke;
      window.electron.ipcRenderer.invoke = async (channel: string, ...args: any[]) => {
        if (channel === 'amazon:selectSkillDir') {
          return { canceled: false, filePaths: ['D:\\Code\\amazon\\.agent\\skills\\sellersprite-search-products'] };
        }
        if (channel === 'amazon:readSkillMeta') {
          return {
            success: true,
            meta: {
              slug: 'sellersprite-search-products',
              name: 'SellerSprite Search Products',
              version: '1.0.0',
              description: 'Search products using SellerSprite API',
              author: 'Antigravity'
            }
          };
        }
        if (channel === 'amazon:installSkillFromPath') {
          return { success: true, slug: 'sellersprite-search-products' };
        }
        if (channel === 'amazon:listUserSkills') {
          // First call might be empty, subsequent call (after install) should have the skill
          // We can use a simple state to toggle
          if ((window as any)._skillInstalled) {
             return { success: true, skills: [{
                slug: 'sellersprite-search-products',
                name: 'SellerSprite Search Products',
                version: '1.0.0',
                description: 'Search products using SellerSprite API'
             }] };
          }
          return { success: true, skills: [] };
        }
        return originalInvoke(channel, ...args);
      };
    });

    // 4. Trigger "Select Skill Directory"
    await page.getByRole('button', { name: '选择 Skill 目录' }).click();

    // 5. Verify Preview Panel appears
    await expect(page.getByText('安装预览')).toBeVisible();
    await expect(page.getByText('SellerSprite Search Products')).toBeVisible();
    await expect(page.getByText('Skill 已读取，请在下方预览并确认安装')).toBeVisible();

    // 6. Click "Confirm Install"
    await page.evaluate(() => { (window as any)._skillInstalled = true; });
    await page.getByRole('button', { name: '确认安装' }).click();

    // 7. Verify Success Toast and List Refresh
    await expect(page.getByText('安装成功')).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^SellerSprite Search Products$/ }).first()).toBeVisible();
  });
});
