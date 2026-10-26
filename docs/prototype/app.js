// Standalone synthetic prototype. No API, persistence, analytics, or external requests.
const search = document.querySelector('#history-search');
const filter = document.querySelector('#history-filter');
function updateHistory() {
  if (!search || !filter) return;
  const query = search.value.trim().toLocaleLowerCase();
  let count = 0;
  document.querySelectorAll('.history-item').forEach(item => {
    const visible = item.dataset.name.toLocaleLowerCase().includes(query) && (filter.value === 'all' || filter.value === item.dataset.status);
    item.hidden = !visible;
    if (visible) count += 1;
  });
  document.querySelector('#history-count').textContent = `합성 업무 ${count}개 · 현재 필터 범위`;
  document.querySelector('#history-empty').hidden = count > 0;
}
if (search && filter) {
  const initial = new URLSearchParams(location.search).get('filter');
  if (['review', 'running'].includes(initial)) filter.value = initial;
  search.addEventListener('input', updateHistory);
  filter.addEventListener('change', updateHistory);
  const reset = () => { search.value = ''; filter.value = 'all'; updateHistory(); };
  document.querySelector('#reset-filters').addEventListener('click', reset);
  document.querySelector('#empty-reset').addEventListener('click', reset);
  updateHistory();
}
const tabs = [...document.querySelectorAll('[data-turn]')];
function selectTurn(turn, moveFocus = false) {
  if (!['1', '2'].includes(turn)) return;
  tabs.forEach(tab => {
    const selected = tab.dataset.turn === turn;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) tab.focus();
  });
  document.querySelectorAll('.turn-panel').forEach(panel => { panel.hidden = panel.id !== `turn-${turn}`; });
}
if (tabs.length) {
  selectTurn(new URLSearchParams(location.search).get('turn') || '2');
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTurn(tab.dataset.turn));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTurn(tabs[target].dataset.turn, true);
    });
  });
}
const reviewForm = document.querySelector('#review-form');
let reviewMemory = null;
if (reviewForm) {
  reviewForm.addEventListener('submit', event => {
    event.preventDefault();
    const decision = document.querySelector('#review-decision').value;
    const feedback = document.querySelector('#review-feedback');
    if (!decision) {
      feedback.textContent = '판단을 먼저 선택해 주세요. 아직 기록하지 않았습니다.';
      document.querySelector('#review-decision').focus();
      return;
    }
    reviewMemory = {
      decision,
      note: document.querySelector('#review-note').value,
      criteria: [...document.querySelectorAll('.criterion-select')].map(select => select.value)
    };
    feedback.textContent = `“${reviewMemory.decision}”를 이 페이지 메모리에 기록했습니다. 서버 전송 없음 · 새로고침 시 초기화`;
  });
}
const promptInput = document.querySelector('#next-prompt');
if (promptInput) {
  const initialPrompt = promptInput.value;
  document.querySelector('#preview-prompt').addEventListener('click', () => {
    const value = promptInput.value.trim();
    const feedback = document.querySelector('#prompt-feedback');
    if (!value) { feedback.textContent = '미리 볼 요청 문장을 입력해 주세요.'; return; }
    // Text rendering is intentional: HTML-like input must remain plain text.
    document.querySelector('#prompt-preview').textContent = value;
    document.querySelector('#prompt-preview-wrap').hidden = false;
    feedback.textContent = '편집한 초안을 아래에 표시했습니다. 저장하거나 전송하지 않았습니다.';
  });
  document.querySelector('#reset-prompt').addEventListener('click', () => {
    promptInput.value = initialPrompt;
    document.querySelector('#prompt-preview-wrap').hidden = true;
    document.querySelector('#prompt-preview').textContent = '';
    document.querySelector('#prompt-feedback').textContent = '합성 예시 초안으로 되돌렸습니다.';
  });
}
