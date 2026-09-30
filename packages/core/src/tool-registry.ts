import { z, type ZodSchema } from 'zod';

export type ToolRisk = 'read' | 'write' | 'high';

export interface ToolCard {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  risk: ToolRisk;
  requiredIntegration: string | null;
}

const registry = new Map<string, ToolCard>();

export function registerTool(card: ToolCard): void {
  registry.set(card.name, card);
}

export function getTool(name: string): ToolCard | undefined {
  return registry.get(name);
}

export function listTools(): ToolCard[] {
  return [...registry.values()];
}

// --- GitHub tools ---

registerTool({
  name: 'github.list_prs',
  description: 'List open pull requests for a repository.',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
  }),
  risk: 'read',
  requiredIntegration: 'github',
});

registerTool({
  name: 'github.get_pr',
  description: 'Get details and diff for a pull request.',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number().int().positive(),
  }),
  risk: 'read',
  requiredIntegration: 'github',
});

registerTool({
  name: 'github.add_comment',
  description: 'Post a comment on a pull request.',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number().int().positive(),
    body: z.string().min(1),
  }),
  risk: 'write',
  requiredIntegration: 'github',
});

registerTool({
  name: 'github.merge_pr',
  description: 'Merge a pull request.',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number().int().positive(),
    merge_method: z.enum(['merge', 'squash', 'rebase']).default('squash'),
  }),
  risk: 'high',
  requiredIntegration: 'github',
});
