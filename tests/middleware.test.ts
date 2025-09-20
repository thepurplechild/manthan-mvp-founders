import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import type { NextRequest } from 'next/server';

import { middleware } from '../middleware';
import { getSupabaseClient } from '../lib/auth/supabase-edge';

vi.mock('../lib/auth/supabase-edge', () => ({
  getSupabaseClient: vi.fn(),
}));

const mockedGetSupabaseClient = getSupabaseClient as unknown as Mock;

type SessionLike = {
  user: {
    id: string;
    email?: string;
  };
};

type ProfileLike = {
  role: string;
} | null;

class MockCookies {
  private readonly store = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => {
      this.store.set(key, value);
    });
  }

  get(name: string) {
    const value = this.store.get(name);
    return value ? { name, value } : undefined;
  }

  getAll() {
    return Array.from(this.store.entries()).map(([name, value]) => ({ name, value }));
  }

  set(name: string, value: string) {
    this.store.set(name, value);
  }

  delete(name: string) {
    this.store.delete(name);
  }

  has(name: string) {
    return this.store.has(name);
  }
}

class MockNextUrl {
  private readonly url: URL;

  constructor(url: URL) {
    this.url = url;
  }

  get origin() {
    return this.url.origin;
  }

  get pathname() {
    return this.url.pathname;
  }

  get search() {
    return this.url.search;
  }

  clone() {
    return new MockNextUrl(new URL(this.url.toString()));
  }
}

function createRequest(path: string, origin = 'https://example.com'): NextRequest {
  const url = new URL(path, origin);
  const request = {
    nextUrl: new MockNextUrl(url),
    cookies: new MockCookies(),
    headers: new Headers(),
    method: 'GET',
    url: url.toString(),
  };
  return request as unknown as NextRequest;
}

function setupSupabaseMocks(options: {
  session: SessionLike | null;
  profile: ProfileLike;
  sessionError?: { message: string } | null;
  profileError?: { message: string } | null;
}) {
  const single = vi.fn().mockResolvedValue({
    data: options.profile,
    error: options.profileError ?? null,
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockImplementation(() => ({ select }));

  const authGetSession = vi.fn().mockResolvedValue({
    data: { session: options.session },
    error: options.sessionError ?? null,
  });

  mockedGetSupabaseClient.mockReturnValue({
    auth: { getSession: authGetSession },
    from,
  });

  return { authGetSession, from, select, eq, single };
}

describe('founder route middleware', () => {
  beforeEach(() => {
    mockedGetSupabaseClient.mockReset();
  });

  it('skips non-founder routes', async () => {
    const req = createRequest('/dashboard');
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(mockedGetSupabaseClient).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users to login with redirect param', async () => {
    setupSupabaseMocks({ session: null, profile: null });

    const req = createRequest('/founder/projects?tab=notes');
    const res = await middleware(req);

    expect(mockedGetSupabaseClient).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://example.com/login?redirect=%2Ffounder%2Fprojects%3Ftab%3Dnotes'
    );
  });

  it('redirects authenticated non-founders to /403', async () => {
    setupSupabaseMocks({
      session: { user: { id: 'user-123' } },
      profile: { role: 'member' },
    });

    const req = createRequest('/founder/dashboard');
    const res = await middleware(req);

    expect(mockedGetSupabaseClient).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://example.com/403');
  });

  it('allows founders to proceed', async () => {
    setupSupabaseMocks({
      session: { user: { id: 'founder-1' } },
      profile: { role: 'founder' },
    });

    const req = createRequest('/founder/reports');
    const res = await middleware(req);

    expect(mockedGetSupabaseClient).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('treats profile lookup errors as forbidden', async () => {
    setupSupabaseMocks({
      session: { user: { id: 'founder-2' } },
      profile: null,
      profileError: { message: 'not found' },
    });

    const req = createRequest('/founder/insights');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://example.com/403');
  });
});
