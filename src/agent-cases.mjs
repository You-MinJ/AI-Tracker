// Public execution evidence only: role names and free text do not prove a spawn.
const publicSources = new Set(['subAgent', 'subAgentThreadSpawn', 'subAgentOther']);
const internalKinds = /^(guardian|review|compact|memory_consolidation|auto_review|safety_review|title_generation)$/i;
function sourceInfo(source) {
  if (typeof source === 'string') {
    if (publicSources.has(source)) return {public: true, internal: false};
    if (['subAgentReview', 'subAgentCompact'].includes(source)) return {public: false, internal: true};
    try { source = JSON.parse(source); } catch { return {public: false, internal: false}; }
  }
  const sub = source && typeof source === 'object' && !Array.isArray(source) && Object.hasOwn(source, 'subAgent') ? source.subAgent : null;
  const kind = typeof sub === 'string' ? sub : typeof sub?.other === 'string' ? sub.other : '';
  return {public: typeof sub === 'string' && !!sub || !!sub && typeof sub === 'object' && !Array.isArray(sub), internal: internalKinds.test(kind)};
}
export function isPublicSubagent(task) {
  const source = sourceInfo(task.source);
  return !task.internal && !source.internal && (!!task.parentId || !!source.public);
}
export function matchesTaskFilters(task, {project = '', query = '', filter = ''} = {}) {
  if (task.internal || project && task.cwd !== project) return false;
  if (filter === 'questions' && !task.review?.questions?.length || filter === 'results' && !task.review?.result || filter === 'unfinished' && !['failed', 'interrupted', 'unknown', 'active'].includes(task.status)) return false;
  return [task.title, task.scope, task.project, task.role, task.nickname, task.review?.result].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase());
}
export function exploreSubagents(tasks, filters = {}) {
  const all = tasks.filter(isPublicSubagent);
  const visible = all.filter(task => matchesTaskFilters(task, filters));
  const groups = new Map();
  for (const task of visible) {
    const role = task.role || '역할 미제공';
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(task);
  }
  return {total: all.length, visible, groups: [...groups].map(([role, tasks]) => ({role, tasks}))};
}
