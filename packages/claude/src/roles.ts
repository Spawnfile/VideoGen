import type { Effort, ModelAlias, RoleName } from '@videogen/shared';

export const SPEC_KINDS = ['research', 'storyboard', 'scene', 'audio'] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

/** MCP tools that exist. M4b adds the scene tools, M4c extract_frames, M5b run_qc; render_draft stays out (plan B7: the draft_render step makes the draft); tts_* … arrive in M5. */
export const IMPLEMENTED_MCP = ['report_progress', 'get_context', 'read_spec', 'write_spec', 'register_artifact', 'build_scene', 'render_preview_stills', 'extract_frames', 'run_qc'] as const;

export interface RoleDef {
  role: RoleName;
  model: ModelAlias;
  effort: Effort;
  maxTurns: number | null;
  /** Built-in tools pre-approved for this role (Bash and Agent are governed by `bash` / `subagents`). */
  tools: string[];
  bash: boolean;
  subagents: boolean;
  mcp: string[];
  /** Write scope inside the run dir: null = whole run dir, [] = read-only, else these sub-directories. */
  writeDirs: string[] | null;
  specWrite: SpecKind[];
  outputSchema: string | null;
}

const READ = ['Read', 'Glob', 'Grep'];
const ALL_MCP = ['report_progress', 'get_context', 'read_spec', 'write_spec', 'register_artifact', 'build_scene', 'render_preview_stills', 'render_draft', 'extract_frames', 'run_qc', 'tts_synthesize', 'align_captions', 'search_assets', 'request_rerender'];

/** Spec §6.2. */
export const ROLES: Record<RoleName, RoleDef> = {
  researcher: { role: 'researcher', model: 'sonnet', effort: 'high', maxTurns: 40, tools: ['WebSearch', 'WebFetch', ...READ, 'Write'], bash: false, subagents: false, mcp: ['report_progress', 'get_context'], writeDirs: ['research'], specWrite: [], outputSchema: 'ProductResearch' },
  storyboarder: { role: 'storyboarder', model: 'opus', effort: 'high', maxTurns: 20, tools: [...READ], bash: false, subagents: false, mcp: ['read_spec', 'report_progress', 'get_context'], writeDirs: [], specWrite: [], outputSchema: 'Storyboard' },
  builder: { role: 'builder', model: 'opus', effort: 'high', maxTurns: 60, tools: [...READ, 'Write', 'Edit'], bash: true, subagents: true, mcp: ['build_scene', 'render_preview_stills', 'read_spec', 'write_spec', 'report_progress', 'register_artifact', 'get_context'], writeDirs: ['scene'], specWrite: ['scene'], outputSchema: 'SceneSpec' },
  audio_director: { role: 'audio_director', model: 'sonnet', effort: 'medium', maxTurns: 25, tools: [...READ], bash: false, subagents: false, mcp: ['tts_synthesize', 'align_captions', 'search_assets', 'read_spec', 'write_spec', 'get_context'], writeDirs: [], specWrite: ['audio'], outputSchema: 'AudioPlan' },
  reviewer_visual: { role: 'reviewer_visual', model: 'opus', effort: 'high', maxTurns: 25, tools: [...READ], bash: false, subagents: false, mcp: ['extract_frames', 'run_qc', 'get_context'], writeDirs: [], specWrite: [], outputSchema: 'Review' },
  // M7 Y19: WebFetch only to the review's check targets (GuardContext.webAllow, set by the session manager); WebSearch stays open.
  reviewer_facts: { role: 'reviewer_facts', model: 'sonnet', effort: 'high', maxTurns: 40, tools: [...READ, 'WebFetch', 'WebSearch'], bash: false, subagents: false, mcp: ['read_spec', 'extract_frames', 'get_context'], writeDirs: [], specWrite: [], outputSchema: 'Review' },
  reviewer_retention: { role: 'reviewer_retention', model: 'sonnet', effort: 'high', maxTurns: 20, tools: [...READ], bash: false, subagents: false, mcp: ['extract_frames', 'run_qc', 'read_spec', 'get_context'], writeDirs: [], specWrite: [], outputSchema: 'Review' },
  fixer: { role: 'fixer', model: 'opus', effort: 'high', maxTurns: 40, tools: [...READ, 'Write', 'Edit'], bash: true, subagents: false, mcp: ['write_spec', 'read_spec', 'build_scene', 'render_preview_stills', 'report_progress', 'register_artifact', 'get_context'], writeDirs: ['scene'], specWrite: ['storyboard', 'scene', 'audio'], outputSchema: 'FixReport' },
  chat: { role: 'chat', model: 'opus', effort: 'high', maxTurns: null, tools: [...READ], bash: false, subagents: false, mcp: ALL_MCP, writeDirs: [], specWrite: ['research', 'storyboard', 'scene', 'audio'], outputSchema: null },
  summarizer: { role: 'summarizer', model: 'haiku', effort: 'low', maxTurns: 3, tools: [], bash: false, subagents: false, mcp: [], writeDirs: [], specWrite: [], outputSchema: null },
};

export type RoleOverrides = Partial<Record<RoleName, { model?: ModelAlias; effort?: Effort }>>;

export function resolveRole(role: RoleName, overrides: RoleOverrides = {}): RoleDef {
  const o = overrides[role] ?? {};
  return { ...ROLES[role], ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) };
}

const ALWAYS = ['StructuredOutput', 'Skill', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'];
const MCP_PREFIX = 'mcp__videogen__';

/** What the guard lets through (MCP names include tools not yet implemented; they simply do not exist yet). */
export function permittedTools(def: RoleDef): Set<string> {
  return new Set([
    ...def.tools, ...ALWAYS,
    ...(def.bash ? ['Bash'] : []),
    ...(def.subagents ? ['Agent', 'Task'] : []),
    ...def.mcp.map((n) => `${MCP_PREFIX}${n}`),
  ]);
}

/** Pre-approved tools for dontAsk mode. */
export function allowedTools(def: RoleDef): string[] {
  const impl = new Set<string>(IMPLEMENTED_MCP);
  return [
    ...def.tools, 'Skill',
    ...(def.bash ? ['Bash'] : []),
    ...(def.subagents ? ['Agent'] : []),
    ...def.mcp.filter((n) => impl.has(n)).map((n) => `${MCP_PREFIX}${n}`),
  ];
}

/** Removed from the model's tool list (fewer tokens, smaller surface). The guard denies them anyway. */
const NEVER = ['CronCreate', 'CronDelete', 'CronList', 'RemoteTrigger', 'PushNotification', 'Workflow', 'EnterWorktree', 'ExitWorktree', 'SendMessage', 'ListAgents', 'ScheduleWakeup', 'Monitor', 'DesignSync', 'ReportFindings', 'NotebookEdit'];
export function disallowedTools(def: RoleDef): string[] {
  const optional = ['Write', 'Edit', 'WebSearch', 'WebFetch'].filter((t) => !def.tools.includes(t));
  return [...NEVER, ...optional, ...(def.bash ? [] : ['Bash']), ...(def.subagents ? [] : ['Agent', 'Task'])];
}
