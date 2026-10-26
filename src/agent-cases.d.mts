export type AgentCase = {source?: unknown; parentId?: string | null; internal?: boolean; title?: string; scope?: string; project?: string; cwd?: string; role?: string | null; nickname?: string | null; status?: string; review?: {result?: string; questions?: unknown[]} | null};
export type CaseFilters = {project?: string; query?: string; filter?: string};
export function isPublicSubagent(task: AgentCase): boolean;
export function matchesTaskFilters(task: AgentCase, filters?: CaseFilters): boolean;
export function exploreSubagents<T extends AgentCase>(tasks: T[], filters?: CaseFilters): {total: number; visible: T[]; groups: {role: string; tasks: T[]}[]};
