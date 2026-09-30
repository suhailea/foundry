import { db } from '../db.js';
import { decrypt } from '../lib/crypto.js';

// Fetch and decrypt the GitHub access token for a tenant.
// This is the only place in the codebase that produces a plaintext GitHub token.
async function getToken(tenantId: string): Promise<string> {
  const result = await db.query(
    `SELECT encrypted_token, token_iv, token_tag FROM integrations
     WHERE tenant_id = $1 AND provider = 'github'`,
    [tenantId],
  );
  if (result.rows.length === 0) {
    throw new Error('Integration not connected: github');
  }
  const { encrypted_token, token_iv, token_tag } = result.rows[0];
  return decrypt(token_iv, encrypted_token, token_tag);
}

async function githubFetch(
  token: string,
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }

  return res.json();
}

// --- Tool handlers ---

export interface ListPrsArgs {
  owner: string;
  repo: string;
}

export async function listPrs(tenantId: string, args: ListPrsArgs, signal: AbortSignal): Promise<unknown> {
  const token = await getToken(tenantId);
  return githubFetch(token, `/repos/${args.owner}/${args.repo}/pulls?state=open&per_page=20`, {}, signal);
}

export interface GetPrArgs {
  owner: string;
  repo: string;
  pull_number: number;
}

export async function getPr(tenantId: string, args: GetPrArgs, signal: AbortSignal): Promise<unknown> {
  const token = await getToken(tenantId);
  return githubFetch(token, `/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}`, {}, signal);
}

export interface AddCommentArgs {
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
}

export async function addComment(tenantId: string, args: AddCommentArgs, signal: AbortSignal): Promise<unknown> {
  const token = await getToken(tenantId);
  return githubFetch(
    token,
    `/repos/${args.owner}/${args.repo}/issues/${args.pull_number}/comments`,
    { method: 'POST', body: JSON.stringify({ body: args.body }) },
    signal,
  );
}

export interface MergePrArgs {
  owner: string;
  repo: string;
  pull_number: number;
  merge_method: 'merge' | 'squash' | 'rebase';
}

export async function mergePr(tenantId: string, args: MergePrArgs, signal: AbortSignal): Promise<unknown> {
  const token = await getToken(tenantId);
  return githubFetch(
    token,
    `/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}/merge`,
    { method: 'PUT', body: JSON.stringify({ merge_method: args.merge_method }) },
    signal,
  );
}
