import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const cookiesMock = vi.fn();
vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

const createServerClientMock = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

const COOKIE_RESPONSE = { getAll: () => [] };

describe('founder middleware', () => {
  beforeEach(() => {
    cookiesMock.mockResolvedValue(COOKIE_RESPONSE);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('redirects unauthenticated users to login', async () => {
    createServerClientMock.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: null } }) },
      from: vi.fn(),
    });

    const req = NextRequest.from(new Request('https://app.local/founder/projects'));
    const { middleware } = await import('@/middleware');
    const res = await middleware(req);

    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects non-founders to dashboard', async () => {
    const fromMock = vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: 'member' }, error: null }) }),
      }),
    }));
    createServerClientMock.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: fromMock,
    });

    const req = NextRequest.from(new Request('https://app.local/founder/projects'));
    const { middleware } = await import('@/middleware');
    const res = await middleware(req);

    expect(res.headers.get('location')).toContain('/dashboard');
  });

  it('allows founders to proceed', async () => {
    const fromMock = vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: 'founder' }, error: null }) }),
      }),
    }));
    createServerClientMock.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      from: fromMock,
    });

    const req = NextRequest.from(new Request('https://app.local/founder/projects'));
    const { middleware } = await import('@/middleware');
    const res = await middleware(req);

    expect(res.headers.get('location')).toBeNull();
  });
});
