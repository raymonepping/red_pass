// signin.spec.ts — Keycloak sign-in through the BFF for each person, the
// persona pill, role gating (host mode) and an axe scan of the sign-in page.
// Passwords are provided at run time by scripts/ui-signin-test.sh (from Vault).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PEOPLE = [
  { uid: 'viewer', role: 'viewer' },
  { uid: 'barend', role: 'operator' },
  { uid: 'raymon', role: 'admin' },
] as const

async function signIn(page: Page, uid: string) {
  const password = process.env[`RED_PASS_PW_${uid.toUpperCase()}`]
  test.skip(!password, 'run through scripts/ui-signin-test.sh')
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByRole('link', { name: 'Continue with Keycloak' }).click()
  await page.locator('#username').fill(uid)
  await page.locator('#password').fill(password!)
  await page.locator('#kc-login').click()
  await page.waitForURL(url => !url.href.includes('/realms/'))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.waitForSelector('.persona')
}

test('@a11y sign-in page', async ({ page }) => {
  await page.goto('/signin')
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map(v => v.id)).toEqual([])
  if (process.env.RED_PASS_SHOTS_DIR) await page.screenshot({ path: `${process.env.RED_PASS_SHOTS_DIR}/signin.png` })
})

for (const person of PEOPLE) {
  test(`sign-in and role gating: ${person.uid}`, async ({ page }) => {
    await signIn(page, person.uid)
    await expect(page.locator('.persona-name')).toHaveText(person.uid)
    await expect(page.locator('.persona-role')).toHaveText(person.role)
    await page.waitForSelector('.instance-card')
    const vm = await page.locator('.env-badge', { hasText: 'VM' }).count() > 0
    const card = page.locator('.instance-card', { hasText: 'red-vault-2' })
    if (vm || person.role === 'viewer') {
      await expect(page.locator('.card-actions')).toHaveCount(0)
    } else {
      await expect(card.getByRole('button', { name: 'Restart' })).toBeVisible()
      await card.getByRole('button', { name: /More actions/ }).click()
      const trash = card.getByRole('menuitem', { name: 'Move to trash' })
      if (person.role === 'admin') await expect(trash).toBeVisible()
      else await expect(trash).toHaveCount(0)
    }
    if (process.env.RED_PASS_SHOTS_DIR) await page.screenshot({ path: `${process.env.RED_PASS_SHOTS_DIR}/${vm ? 'vm' : 'host'}-${person.uid}.png` })
  })
}

test('API refuses requests without a session', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true })
  expect((await anon.get('/api/instances')).status()).toBe(401)
  expect((await anon.get('/api/health')).status()).toBe(200)
  await anon.dispose()
})
