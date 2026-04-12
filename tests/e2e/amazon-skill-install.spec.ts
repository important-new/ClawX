import { expect, test } from './fixtures/electron';

test.describe('Amazon Skill Installation Flow', () => {
  test('should show preview after selecting directory and refresh list after confirmation', async ({ page }) => {
    // 1. Skip setup
    await page.getByTestId('setup-skip-button').click();
    await expect(page.getByTestId('main-layout')).toBeVisible();

    // 2. Mock IPC calls (before navigation to catch automatic loading calls)
    await page.evaluate(() => {
      const originalInvoke = (window as any).electron.ipcRenderer.invoke;
      (window as any)._skillInstalled = false;
      (window as any).electron.ipcRenderer.invoke = async (channel: string, ...args: any[]) => {
        if (channel === 'amazon:listUserSkills') {
          if ((window as any)._skillInstalled) {
             return { success: true, skills: [{
                slug: 'sellersprite-search-products',
                name: 'SellerSprite Search Products',
                version: '1.0.0',
                description: 'Search products using SellerSprite API',
                installedAt: Date.now()
             }] };
          }
          return { success: true, skills: [] };
        }
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
          (window as any)._skillInstalled = true;
          return { success: true, slug: 'sellersprite-search-products' };
        }
        return originalInvoke(channel, ...args);
      };
    });

    // 3. Navigate to Amazon -> Settings -> Skills tab using UI interaction
    await page.getByTestId('sidebar-nav-amazon').click();
    await expect(page.getByRole('heading', { name: '选品助手' })).toBeVisible(); 
    await page.getByTestId('amazon-settings-button').click();
    
    // Wait for the Settings page and select "自定义 Skill" tab
    await page.getByTestId('amazon-settings-tab-skills').click(); 

    // 4. Trigger "Select Skill Directory"
    await page.getByTestId('amazon-select-skill-dir-button').click();

    // 5. Verify Preview Panel appears
    await expect(page.getByText('安装预览')).toBeVisible();
    await expect(page.getByText('SellerSprite Search Products')).toBeVisible();
    
    // 6. Click "Confirm Install"
    await page.getByTestId('amazon-confirm-install-button').click();

    // 7. Verify Success Toast and List Refresh
    await expect(page.getByText(/安装成功/)).toBeVisible();
    await expect(page.getByText('SellerSprite Search Products', { exact: false })).toBeVisible();
    await expect(page.getByText('1.0.0')).toBeVisible();
  });
});
