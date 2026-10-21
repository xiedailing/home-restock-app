// Isolated context only; never reads or resets an existing browser profile.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch()
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const base = process.env.BUBU_PREVIEW_URL || 'http://127.0.0.1:5210'
    await page.goto(base + '/shopping')
    await page.locator('#shopping-title').waitFor()
    const family = await page.evaluate(() => JSON.parse(localStorage.getItem('home-restock:v1:items')).data.spaces.find(s => s.shared).id)
    await page.goto(base + '/settings/spaces/' + family)
    const avatars = page.locator('.member-avatar-button')
    await avatars.first().waitFor()
    const before = await avatars.first().boundingBox()
    const snapshot = await page.evaluate(() => localStorage.getItem('home-restock:v1:items'))
    for (let index = 0; index < await avatars.count(); index++) {
      const trigger = avatars.nth(index)
      const originalSrc = await trigger.locator('img').getAttribute('src')
      await trigger.click()
      const dialog = page.locator('.member-avatar-dialog[open]')
      await dialog.waitFor()
      assert.equal(await dialog.locator('img').getAttribute('src'), originalSrc)
      assert.ok((await dialog.locator('img').boundingBox()).width > 200)
      await page.getByRole('button', { name: '關閉頭貼預覽', exact: true }).click()
      assert.equal(await dialog.count(), 0)
      await trigger.focus(); await page.keyboard.press('Enter'); await dialog.waitFor()
      await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0)
      await trigger.click(); await dialog.waitFor()
      await page.mouse.click(4, 4); assert.equal(await dialog.count(), 0)
    }
    assert.deepEqual(await avatars.first().boundingBox(), before)
    assert.equal(await page.evaluate(() => localStorage.getItem('home-restock:v1:items')), snapshot)
    await context.close()
  }
  console.log('PASS mobile/desktop member avatar enlargement, per-member source, button/Esc/backdrop/keyboard closure, unchanged layout and item data')
} finally { await browser.close() }
