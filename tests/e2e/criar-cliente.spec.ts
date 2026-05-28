import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test('create cliente and see it in the list', async ({ page }) => {
  await login(page)

  await page.goto('/receitas/clientes')
  await page.getByRole('link', { name: /Novo cliente/ }).click()

  await page.getByLabel('Nome *').fill('Acme E2E')
  await page.getByLabel('CNPJ').fill('12345678000190')
  await page.getByRole('button', { name: /Criar cliente/ }).click()

  // Lands on detail page
  await expect(page.getByRole('heading', { name: 'Acme E2E' })).toBeVisible({ timeout: 10000 })

  // Go back to list and verify (use first() in case of duplicate rows from prior runs)
  await page.goto('/receitas/clientes')
  await expect(page.getByText('Acme E2E').first()).toBeVisible()
})
