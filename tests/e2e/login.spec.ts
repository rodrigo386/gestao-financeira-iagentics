import { test, expect } from '@playwright/test'

test('unauthenticated user is redirected to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText(/Entrar — IAgentics Finanças/)).toBeVisible()
})

test('submitting email shows confirmation message', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('e2e@iagentics.test')
  await page.getByRole('button', { name: /Enviar link de acesso/ }).click()
  await expect(page.getByText(/Link de acesso enviado para/)).toBeVisible({ timeout: 10_000 })
})
