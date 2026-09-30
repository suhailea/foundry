import type { Run } from '@foundry/shared';
import { authHeaders } from './auth.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Auth
export function register(email: string, password: string): Promise<{ token: string; userId: string; tenantId: string }> {
  return request('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function login(email: string, password: string): Promise<{ token: string; userId: string; tenantId: string }> {
  return request('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function getMe(): Promise<{ id: string; email: string; tenantId: string }> {
  return request('/v1/auth/me');
}

// Runs
export function createRun(input: string): Promise<{ runId: string; status: string }> {
  return request('/v1/runs', { method: 'POST', body: JSON.stringify({ input }) });
}

export function getRuns(): Promise<Run[]> {
  return request('/v1/runs');
}

export function getRunById(runId: string): Promise<Run> {
  return request(`/v1/runs/${runId}`);
}

// Integrations
export function getIntegrations(): Promise<{ provider: string; scope: string; connectedAt: string }[]> {
  return request('/v1/integrations');
}

export function disconnectIntegration(provider: string): Promise<{ ok: boolean }> {
  return request(`/v1/integrations/${provider}`, { method: 'DELETE' });
}
