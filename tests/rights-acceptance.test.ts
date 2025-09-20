import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import type { NextRequest } from 'next/server';

import { middleware } from '../middleware';

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getSession: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
}));

// Mock cookies
const mockCookies = {
  getAll: vi.fn(() => []),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => mockCookies),
}));

class MockNextUrl {
  constructor(private url: URL) {}

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
    cookies: new Map(),
    headers: new Headers(),
    method: 'GET',
    url: url.toString(),
  };
  return request as unknown as NextRequest;
}

describe('Creator Rights Acceptance Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rights Acceptance Check', () => {
    it('redirects authenticated users without rights acceptance to acceptance page', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      // Mock no rights acceptance found (PGRST116 is "no rows returned")
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      });

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const req = createRequest('/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'https://example.com/auth/accept-rights?redirect=%2Fdashboard'
      );
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('creator_rights_acceptances');
      expect(mockSelect).toHaveBeenCalledWith('id');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('allows access when user has accepted rights', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      // Mock rights acceptance found
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'acceptance-123' },
        error: null,
      });

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const req = createRequest('/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('skips rights check for acceptance page itself', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      const req = createRequest('/auth/accept-rights');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('redirects to login for unauthenticated users', async () => {
      // Mock no session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const req = createRequest('/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'https://example.com/login?redirect=%2Fdashboard'
      );
    });

    it('handles database errors gracefully', async () => {
      // Mock authenticated user
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      // Mock database error (not PGRST116)
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST301', message: 'Database connection error' },
      });

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });

      const req = createRequest('/dashboard');
      const res = await middleware(req);

      // Should allow access when database error occurs (fail open for availability)
      expect(res.status).toBe(200);
    });
  });

  describe('Protected Routes', () => {
    beforeEach(() => {
      // Mock authenticated user with rights acceptance
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'acceptance-123' },
        error: null,
      });

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect });
    });

    it('protects /dashboard routes', async () => {
      const req = createRequest('/dashboard/settings');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled();
    });

    it('protects /projects routes', async () => {
      const req = createRequest('/projects/123');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled();
    });

    it('protects /founder routes', async () => {
      // Mock founder profile
      const mockProfileSingle = vi.fn().mockResolvedValue({
        data: { role: 'founder' },
        error: null,
      });

      const mockProfileEq = vi.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = vi.fn().mockReturnValue({ eq: mockProfileEq });

      // Update mock to handle different table calls
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'creator_rights_acceptances') {
          return { select: mockSelect };
        } else if (table === 'profiles') {
          return { select: mockProfileSelect };
        }
        return { select: vi.fn() };
      });

      const req = createRequest('/founder/reports');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
    });

    it('skips protection for non-protected routes', async () => {
      const req = createRequest('/about');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.auth.getSession).not.toHaveBeenCalled();
    });

    it('skips protection for assets', async () => {
      const req = createRequest('/_next/static/chunks/main.js');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.auth.getSession).not.toHaveBeenCalled();
    });
  });

  describe('Founder Role Validation', () => {
    beforeEach(() => {
      // Mock authenticated user with rights acceptance
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      const mockRightsSingle = vi.fn().mockResolvedValue({
        data: { id: 'acceptance-123' },
        error: null,
      });

      const mockRightsEq = vi.fn().mockReturnValue({ single: mockRightsSingle });
      const mockRightsSelect = vi.fn().mockReturnValue({ eq: mockRightsEq });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'creator_rights_acceptances') {
          return { select: mockRightsSelect };
        }
        // Will be overridden in individual tests for profiles table
        return { select: vi.fn() };
      });
    });

    it('allows founders to access founder routes', async () => {
      const mockProfileSingle = vi.fn().mockResolvedValue({
        data: { role: 'founder' },
        error: null,
      });

      const mockProfileEq = vi.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = vi.fn().mockReturnValue({ eq: mockProfileEq });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'creator_rights_acceptances') {
          const mockRightsSingle = vi.fn().mockResolvedValue({
            data: { id: 'acceptance-123' },
            error: null,
          });
          const mockRightsEq = vi.fn().mockReturnValue({ single: mockRightsSingle });
          return { select: vi.fn().mockReturnValue({ eq: mockRightsEq }) };
        } else if (table === 'profiles') {
          return { select: mockProfileSelect };
        }
        return { select: vi.fn() };
      });

      const req = createRequest('/founder/insights');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(mockProfileSelect).toHaveBeenCalledWith('role');
      expect(mockProfileEq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('redirects non-founders from founder routes', async () => {
      const mockProfileSingle = vi.fn().mockResolvedValue({
        data: { role: 'creator' },
        error: null,
      });

      const mockProfileEq = vi.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = vi.fn().mockReturnValue({ eq: mockProfileEq });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'creator_rights_acceptances') {
          const mockRightsSingle = vi.fn().mockResolvedValue({
            data: { id: 'acceptance-123' },
            error: null,
          });
          const mockRightsEq = vi.fn().mockReturnValue({ single: mockRightsSingle });
          return { select: vi.fn().mockReturnValue({ eq: mockRightsEq }) };
        } else if (table === 'profiles') {
          return { select: mockProfileSelect };
        }
        return { select: vi.fn() };
      });

      const req = createRequest('/founder/reports');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/dashboard');
    });

    it('redirects when profile lookup fails', async () => {
      const mockProfileSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Profile not found' },
      });

      const mockProfileEq = vi.fn().mockReturnValue({ single: mockProfileSingle });
      const mockProfileSelect = vi.fn().mockReturnValue({ eq: mockProfileEq });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'creator_rights_acceptances') {
          const mockRightsSingle = vi.fn().mockResolvedValue({
            data: { id: 'acceptance-123' },
            error: null,
          });
          const mockRightsEq = vi.fn().mockReturnValue({ single: mockRightsSingle });
          return { select: vi.fn().mockReturnValue({ eq: mockRightsEq }) };
        } else if (table === 'profiles') {
          return { select: mockProfileSelect };
        }
        return { select: vi.fn() };
      });

      const req = createRequest('/founder/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://example.com/dashboard');
    });
  });
});