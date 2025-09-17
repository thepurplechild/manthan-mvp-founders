import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

// Mock AuthButton to avoid server calls in Navigation
jest.mock('@/components/auth-button', () => ({
  AuthButton: () => <div data-testid="auth-button" />,
}))

describe('Navigation canonical hrefs', () => {
  it('has Dashboard, Projects (if present), and Upload Script hrefs', async () => {
    const Navigation = (await import('@/components/Navigation')).default

    render(<Navigation />)

    // Dashboard → /dashboard
    const dashboard = screen.getByRole('link', { name: /Dashboard/i })
    expect(dashboard).toHaveAttribute('href', '/dashboard')

    // Projects (if present) → /projects
    const projects = screen.queryByRole('link', { name: /Projects/i })
    if (projects) {
      expect(projects).toHaveAttribute('href', '/projects')
    }

    // Upload Script → /upload
    const upload = screen.getByRole('link', { name: /Upload Script/i })
    expect(upload).toHaveAttribute('href', '/upload')
  })
})

describe('Dashboard page links', () => {
  // Mock Supabase server client used by the page
  jest.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } } }),
        getClaims: async () => ({ data: { claims: {} } }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { full_name: 'Tester' } }) }) }),
        eq: () => ({ order: async () => ({ data: [] }) }),
        order: async () => ({ data: [] }),
      }),
    }),
  }))

  it('Create/New Project link points to /projects/new', async () => {
    const Dashboard = (await import('@/app/dashboard/page')).default as () => Promise<JSX.Element>
    const ui = await Dashboard()
    render(ui)

    const create = screen.getByRole('link', { name: /Create Project|New Project/i })
    expect(create).toHaveAttribute('href', '/projects/new')
  })
})

