import {clean} from './review.mjs';

const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'netNewInputTokens', 'totalTokens'];
const CACHE_MS = 300000;
const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const tokenCount = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const cacheKey = thread => JSON.stringify([thread.id, thread.updatedAt ?? null, thread.status ?? null]);

// Only thread-scoped official usage is retained; account totals and prices are excluded.
export function createUsageReader(reader) {
  const cache = new Map();
  const pending = new Map();
  const generations = new Map();
  return {async read(thread, {refresh = false} = {}) {
    const id = thread?.id;
    if (!validId(id)) return {tokens: null, usageCheckedAt: null, usageStatus: 'error', usageReason: '사용량 조회 대상 ID가 올바르지 않습니다.'};
    const key = cacheKey(thread);
    const cached = cache.get(id);
    if (!refresh && cached?.key === key && Date.now() - cached.at < CACHE_MS) return cached.result;
    if (!refresh && pending.get(id)?.key === key) return pending.get(id).promise;
    const generation = (generations.get(id) ?? 0) + 1;
    generations.set(id, generation);
    // A failed refresh must not expose the previously cached observation as current.
    cache.delete(id);
    const promise = (async () => {
      let result;
      try {
        const response = await reader.call('account/usage/read', {threadId: id});
        const usage = response?.threadUsage;
        if (usage == null) {
          result = {tokens: null, usageStatus: 'unavailable', usageReason: '공식 API가 이 실행의 사용량을 제공하지 않았습니다. 스레드 사용량은 billing route가 제공될 때만 반환됩니다.'};
        } else if (usage.threadId !== id) {
          result = {tokens: null, usageStatus: 'error', usageReason: '공식 사용량 응답의 실행 ID가 요청과 일치하지 않습니다.'};
        } else if (!Array.isArray(usage.groups)) {
          result = {tokens: null, usageStatus: 'error', usageReason: '공식 사용량 응답에 모델별 사용량 배열이 없습니다.'};
        } else {
          result = {tokens: usage.groups.map(group => ({
            model: typeof group?.model === 'string' ? clean(group.model, 200) : null,
            ...Object.fromEntries(TOKEN_FIELDS.map(field => [field, tokenCount(group?.[field])])),
          })), usageStatus: 'available', usageReason: null};
        }
      } catch (error) {
        result = {tokens: null, usageStatus: 'error', usageReason: clean(`공식 사용량 조회 실패: ${error?.message ?? '원인 미제공'}`, 500)};
      }
      const at = Date.now();
      result.usageCheckedAt = new Date(at).toISOString();
      if (generations.get(id) === generation && result.usageStatus === 'available') cache.set(id, {key, at, result});
      return result;
    })();
    pending.set(id, {key, promise, generation});
    try {return await promise;} finally {
      if (pending.get(id)?.generation === generation) pending.delete(id);
    }
  }};
}

// References express observation only. A wait receiver is not proof of parentage.
export function collectAgentReferences(entries) {
  const references = new Map();
  for (const entry of entries ?? []) {
    if (!['collabAgentToolCall', 'subAgentActivity'].includes(entry?.type)) continue;
    const states = Array.isArray(entry.agentStates) ? entry.agentStates : [];
    const ids = [...(Array.isArray(entry.receivers) ? entry.receivers : []), ...states.map(state => state?.threadId)];
    for (const id of ids) {
      if (!validId(id)) continue;
      const reference = references.get(id) ?? {id, observedStatus: null, evidenceItemIds: []};
      for (const state of states) if (state?.threadId === id && typeof state.status === 'string' && state.status.trim()) reference.observedStatus = clean(state.status, 100);
      if (typeof entry.id === 'string' && entry.id && !reference.evidenceItemIds.includes(entry.id)) reference.evidenceItemIds.push(entry.id);
      references.set(id, reference);
    }
  }
  return [...references.values()];
}
