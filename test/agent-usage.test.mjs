import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsageReader, collectAgentReferences} from '../server/agent-usage.mjs';

const ID = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';
const thread = {id: ID, updatedAt: 1, status: 'running'};
const usage = value => ({threadUsage: {threadId: ID, groups: [{model: 'synthetic-model', totalTokens: value}]}});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

test('usage uses the official thread API and caches positive observations by update and status', async () => {
  let calls = 0;
  const reader = createUsageReader({call: async (method, params) => {
    assert.equal(method, 'account/usage/read'); assert.deepEqual(params, {threadId: ID});
    return usage(++calls);
  }});
  const first = await reader.read(thread);
  assert.equal(first.usageStatus, 'available'); assert.ok(first.usageCheckedAt);
  assert.equal((await reader.read(thread)).tokens[0].totalTokens, 1);
  assert.equal((await reader.read({...thread, updatedAt: 2})).tokens[0].totalTokens, 2);
  assert.equal((await reader.read({...thread, updatedAt: 2, status: 'completed'})).tokens[0].totalTokens, 3);
  assert.equal((await reader.read({...thread, updatedAt: 2, status: 'completed'}, {refresh: true})).tokens[0].totalTokens, 4);
});

test('token normalization preserves zero and unknown model without exposing costs or account totals', async () => {
  const reader = createUsageReader({call: async () => ({summary: {totalTokens: 999}, threadUsage: {threadId: ID, estimatedUsageUsdMicros: 999, groups: [
    {model: null, inputTokens: 0, outputTokens: -1, totalTokens: Infinity, cachedInputTokens: '4', netNewInputTokens: Number.MAX_SAFE_INTEGER + 1},
    {model: 'synthetic', inputTokens: 10, outputTokens: 2.1, totalTokens: 11, cachedInputTokens: NaN, netNewInputTokens: null},
  ]}})});
  const result = await reader.read(thread);
  assert.deepEqual(result.tokens[0], {model: null, inputTokens: 0, outputTokens: null, totalTokens: null, cachedInputTokens: null, netNewInputTokens: null});
  assert.equal(result.tokens[1].inputTokens, 10); assert.equal(result.tokens[1].outputTokens, null);
  assert.ok(!JSON.stringify(result).includes('999'));
});

test('null and errors retry; account totals never substitute for thread usage; errors are masked and bounded', async () => {
  let calls = 0;
  const reader = createUsageReader({call: async () => {
    if (++calls === 1) return {threadUsage: null, summary: {totalTokens: 999}};
    if (calls === 2) throw new Error('Bearer SYNTHETIC_ONLY_SECRET_123456 user@example.com ' + 'x'.repeat(1000));
    return usage(3);
  }});
  const absent = await reader.read(thread);
  assert.equal(absent.usageStatus, 'unavailable'); assert.equal(absent.tokens, null); assert.match(absent.usageReason, /billing route/);
  const failed = await reader.read(thread);
  assert.equal(failed.usageStatus, 'error'); assert.equal(failed.tokens, null);
  assert.ok(failed.usageReason.length <= 500); assert.ok(!failed.usageReason.includes('SYNTHETIC_ONLY_SECRET')); assert.ok(!failed.usageReason.includes('user@example.com'));
  assert.equal((await reader.read(thread)).tokens[0].totalTokens, 3);
});

test('mismatched identity and malformed usage are rejected without cache', async () => {
  let calls = 0;
  const reader = createUsageReader({call: async () => ++calls === 1 ? {threadUsage: {threadId: OTHER, groups: [{totalTokens: 20}]}, summary: {totalTokens: 40}} : {threadUsage: {threadId: ID}}});
  assert.equal((await reader.read(thread)).usageStatus, 'error');
  assert.equal((await reader.read(thread)).tokens, null); assert.equal(calls, 2);
});

test('concurrent reads deduplicate while refresh bypasses and late generations cannot replace cache', async () => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const reader = createUsageReader({call: () => (++calls === 1 ? old : fresh).promise});
  const a = reader.read(thread), b = reader.read(thread);
  assert.equal(calls, 1);
  const c = reader.read(thread, {refresh: true}); assert.equal(calls, 2);
  fresh.resolve(usage(2)); await c;
  old.resolve(usage(1)); await Promise.all([a, b]);
  assert.equal((await reader.read(thread)).tokens[0].totalTokens, 2); assert.equal(calls, 2);
});

test('late running response cannot overwrite newer completed observation', async () => {
  const old = deferred(); let calls = 0;
  const reader = createUsageReader({call: () => ++calls === 1 ? old.promise : Promise.resolve(usage(2))});
  const running = reader.read(thread);
  const completed = {...thread, status: 'completed'};
  await reader.read(completed); old.resolve(usage(1)); await running;
  assert.equal((await reader.read(completed)).tokens[0].totalTokens, 2); assert.equal(calls, 2);
});

test('failed refresh clears a previous positive cache and next read retries', async () => {
  let calls = 0;
  const reader = createUsageReader({call: async () => ++calls === 2 ? {threadUsage: null} : usage(calls)});
  await reader.read(thread);
  assert.equal((await reader.read(thread, {refresh: true})).usageStatus, 'unavailable');
  assert.equal((await reader.read(thread)).tokens[0].totalTokens, 3);
});

test('references deduplicate receiver and state IDs, retain evidence, and never infer parents', () => {
  const result = collectAgentReferences([
    {id: 'item-a', type: 'collabAgentToolCall', tool: 'wait', receivers: [ID, ID, 'not-an-id'], agentStates: [{threadId: OTHER, status: 'running', message: 'not projected'}]},
    {id: 'item-b', type: 'subAgentActivity', receivers: [ID], agentStates: [{threadId: ID, status: 'completed'}]},
    {id: 'item-b', type: 'subAgentActivity', receivers: [ID]},
    {id: 'item-c', type: 'commandExecution', receivers: [OTHER], agentStates: [{threadId: OTHER, status: 'completed'}]},
  ]);
  assert.deepEqual(result, [
    {id: ID, observedStatus: 'completed', evidenceItemIds: ['item-a', 'item-b']},
    {id: OTHER, observedStatus: 'running', evidenceItemIds: ['item-a']},
  ]);
});
