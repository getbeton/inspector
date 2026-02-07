import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('should navigate to login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/login')
    await expect(page.locator('text=Sign in')).toBeVisible()
  })

  test('should have working health endpoint', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.status).toBe('healthy')
    expect(data.service).toBe('beton-frontend')
  })
})

test.describe('Protected Routes', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    // Attempt to access protected route
    await page.goto('/signals')
    // Should redirect to login (middleware handles this)
    await expect(page).toHaveURL(/.*login.*/)
  })
})

test.describe('Responsive Design', () => {
  test('login page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/login')

    // Check that the login form is visible and properly sized
    const form = page.locator('form')
    await expect(form).toBeVisible()
  })
})
