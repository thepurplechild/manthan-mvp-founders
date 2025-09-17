import { test, expect } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Manthan/i)
})

test.skip('sign in and create project (requires creds)', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  test.skip(!email || !password, 'Missing E2E credentials')

  await page.goto('/auth/login')
  await page.getByLabel('Email Address').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/dashboard')

  await page.goto('/projects/new')
  await page.getByLabel('Project Title *').fill('E2E Test Project')
  // Select a couple of India fields
  await page.getByText('Bollywood Drama').click()
  await page.getByText('Netflix India').click()
  await page.getByRole('button', { name: /Create Project/i }).click()
  await expect(page).toHaveURL(/\/projects\//)
})

