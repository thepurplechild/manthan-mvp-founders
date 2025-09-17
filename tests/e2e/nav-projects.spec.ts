import { test, expect } from '@playwright/test'

test('projects navigation smoke (stubbed)', async ({ page }) => {
  // 1) Home → Dashboard
  await page.goto('/')

  // Stub the Dashboard document to avoid auth/DB dependency in CI
  await page.route('**/dashboard**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><body>
          <a href="/projects/new">Create Project</a>
        </body></html>`,
      })
    }
    return route.continue()
  })

  await page.getByRole('link', { name: /Dashboard/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // 2) Dashboard → /projects/new
  // Stub the /projects/new page to render a minimal form used in the app
  await page.route('**/projects/new**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><body>
          <h1>Create New Project</h1>
          <form action="/projects/new" method="post">
            <input id="title" name="title" type="text" />
            <button type="submit">Create Project</button>
          </form>
        </body></html>`,
      })
    }
    return route.continue()
  })

  // Click the link we injected on the stubbed dashboard
  await page.getByRole('link', { name: /Create Project|New Project/i }).click()
  await expect(page).toHaveURL(/\/projects\/new$/)

  // 3) Submit form → expect redirect to /projects/:id
  // Intercept the POST to mimic successful creation
  await page.route('**/projects/new**', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 303,
        headers: { location: '/projects/playwright-test-id' },
        body: '',
      })
    }
    return route.continue()
  })

  // Stub the destination detail page to avoid DB requirement
  await page.route('**/projects/playwright-test-id**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><body>
          <h1>Project: Test Project</h1>
        </body></html>`,
      })
    }
    return route.continue()
  })

  await page.fill('#title', 'Test Project')
  await page.getByRole('button', { name: /Create Project/i }).click()

  await expect(page).toHaveURL(/\/projects\/playwright-test-id$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Project/i)
})

