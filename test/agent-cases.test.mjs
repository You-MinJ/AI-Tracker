import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicSubagent, matchesTaskFilters, exploreSubagents} from '../src/agent-cases.mjs';
const task = (role, extra = {}) => ({id: `synthetic-${role}`, role, parentId: 'synthetic-parent', title: 'Synthetic instruction', scope: 'Compare sources', project: 'Example', cwd: '/SYNTHETIC/project', status: 'ended', review: {result: 'Synthetic final report', questions: []}, ...extra});
test('all public roles and unnamed executions qualify without a role allowlist', () => {
  for (const role of ['default', 'explorer', 'worker', 'ys_researcher', 'custom_auditor', null]) assert.equal(isPublicSubagent(task(role)), true);
  assert.equal(isPublicSubagent(task('worker', {parentId: null, source: 'appServer'})), false);
  assert.equal(isPublicSubagent(task(null, {parentId: null, source: undefined})), false);
});
test('only exact or structured source metadata proves a subagent', () => {
  for (const source of ['subAgent', 'subAgentThreadSpawn', 'subAgentOther', {subAgent: {thread_spawn: {}}}, JSON.stringify({subAgent: {other: 'custom'}})]) assert.equal(isPublicSubagent(task(null, {parentId: null, source})), true);
  for (const source of ['not-subAgent', 'appServer', '{bad json', JSON.stringify({note: 'subAgent'}), {metadata: {subAgent: 'worker'}}, null]) assert.equal(isPublicSubagent(task(null, {parentId: null, source})), false);
});
test('internal review and system work stay excluded even with parent metadata', () => {
  for (const source of ['subAgentReview', 'subAgentCompact', {subAgent: 'review'}, JSON.stringify({subAgent: {other: 'guardian'}})]) assert.equal(isPublicSubagent(task('worker', {source})), false);
  assert.equal(isPublicSubagent(task('worker', {internal: true})), false);
});
test('groups, counts and empty state derive from the same project/search/status filters', () => {
  const tasks = [task('explorer'), task('worker', {cwd: '/SYNTHETIC/other', status: 'active'}), task(null), task('main', {parentId: null}), task('hidden', {internal: true})];
  const filters = {project: '/SYNTHETIC/project', query: 'final report', filter: 'results'};
  const found = exploreSubagents(tasks, filters);
  assert.equal(found.total, 3);
  assert.equal(found.visible.length, 2);
  assert.deepEqual(found.groups.flatMap(group => group.tasks), found.visible);
  assert.deepEqual(found.visible, tasks.filter(t => isPublicSubagent(t) && matchesTaskFilters(t, filters)));
  assert.equal(exploreSubagents(tasks, {query: 'worker'}).visible.length, 1);
  assert.equal(exploreSubagents(tasks, {filter: 'unfinished'}).visible.length, 1);
  assert.deepEqual(exploreSubagents(tasks, {query: 'absent'}).groups, []);
  assert.equal(exploreSubagents(tasks, {project: '/SYNTHETIC/missing'}).visible.length, 0);
});
test('explorer preserves all executions beyond the initial display page', () => {
  const tasks = Array.from({length: 15}, (_, i) => task('worker', {id: `synthetic-${i}`}));
  assert.equal(exploreSubagents(tasks).groups[0].tasks.length, 15);
});
