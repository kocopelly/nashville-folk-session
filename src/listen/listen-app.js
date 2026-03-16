// ── Listen App — tune identification + setlist editor ──

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'nfs-listen-items';

// ── DOM refs ──
const btn = $('btn-listen');
const btnLabel = btn?.querySelector('.listen-btn-label');
const statusEl = $('status');
const tuneLogEl = $('tune-log');
const footerActions = $('footer-actions');
const debugEl = $('debug');
const dbgFrames = $('dbg-frames');
const dbgQueries = $('dbg-queries');
const dbgLast = $('dbg-last');
const btnClear = $('btn-clear');
const btnToggleExport = $('btn-toggle-export');
const exportPanel = $('export-panel');
const exportPreview = $('export-preview');
const btnCopy = $('btn-copy');
const btnDownload = $('btn-download');
const intervalSel = $('query-interval');
const minScoreInput = $('min-score');

// ── State ──
let listening = false, worker = null, audioCtx = null, micStream = null;
let queryTimer = null, workerReady = false, framesSent = 0, queriesSent = 0;
let items = loadItems();
let openAltsIdx = null;
let sortableInstance = null;
let activeExportTab = 'text';
let genre = localStorage.getItem('nfs-listen-genre') || 'irish'; // 'irish' or 'oldtime'

// ── Persistence ──
function saveItems() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (_) { /* storage full or blocked */ }
}
function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (_) { return []; }
}

// ── Utilities ──
function setStatus(msg) { statusEl.textContent = msg; }
function updateDebug(last) {
  dbgFrames.textContent = `frames: ${framesSent}`;
  dbgQueries.textContent = `queries: ${queriesSent}`;
  if (last !== undefined) dbgLast.textContent = `last: ${last}`;
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function tuneNumber(idx) {
  if (items[idx]?.type !== 'tune') return '';
  let n = 0;
  for (let i = 0; i <= idx; i++) if (items[i].type === 'tune') n++;
  return n + '.';
}

function adjacentToDivider(idx) {
  return items[idx - 1]?.type === 'divider' || items[idx]?.type === 'divider';
}

// Build a tune item from a folkfriend result
function tuneFromResult(r) {
  const tuneId = r.setting.tune_id;
  const settingId = r.setting_id;

  let url;
  if (genre === 'oldtime') {
    url = `https://tunearch.org/w/index.php?curid=${tuneId}`;
  } else {
    url = settingId
      ? `https://thesession.org/tunes/${tuneId}#setting${settingId}`
      : `https://thesession.org/tunes/${tuneId}`;
  }

  return {
    type: 'tune',
    tuneId,
    settingId: genre === 'oldtime' ? null : (settingId || null),
    name: r.display_name,
    score: r.score,
    url,
    dance: r.setting.dance || '',
    mode: r.setting.mode || '',
    meter: r.setting.meter || '',
    aliases: r.aliases || [],
  };
}

// Extract transferable fields from a tune item (for swap)
function tuneFields(t) {
  return { tuneId: t.tuneId, settingId: t.settingId, name: t.name, score: t.score, url: t.url, dance: t.dance, mode: t.mode, meter: t.meter };
}

function splitIntoSets() {
  const sets = []; let current = [];
  for (const item of items) {
    if (item.type === 'divider') { if (current.length) sets.push(current); current = []; }
    else if (item.type === 'tune') current.push(item);
  }
  if (current.length) sets.push(current);
  return sets;
}

function dominantValue(arr) {
  const freq = {};
  for (const v of arr) freq[v] = (freq[v] || 0) + 1;
  let best = '', max = 0;
  for (const [k, c] of Object.entries(freq)) if (c > max) { best = k; max = c; }
  return best;
}

function modeToKey(m) {
  const map = { major: '', minor: 'm', dorian: 'dor', mixolydian: 'mix' };
  return map[m] !== undefined ? map[m] : m;
}

function download(filename, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Render ──
function actionRowHTML(idx) {
  const showBreak = genre !== 'oldtime' && !adjacentToDivider(idx);
  return `<div class="action-row" data-insert="${idx}">
    ${showBreak ? `<button class="act-btn do-set-break" data-insert="${idx}">set break</button>` : ''}
    <button class="act-btn do-add-tune" data-insert="${idx}">+ tune</button>
  </div>`;
}

function altsPopoverHTML(idx) {
  const item = items[idx];
  const hasAlts = item?.alternatives?.length > 0;
  const aliases = (item?.aliases || []).filter(a => a !== item.name).slice(0, 5);

  if (!hasAlts && !aliases.length) return '';

  const parts = [item.dance, item.mode, item.meter].filter(Boolean);
  let html = `<div class="popover" style="top:100%;left:1.75rem">`;

  if (parts.length || aliases.length) {
    html += '<div class="popover-section">';
    if (parts.length) html += `<div class="popover-meta">${esc(parts.join(' · '))}</div>`;
    if (aliases.length) html += `<div class="popover-aliases">aka ${aliases.map(esc).join(', ')}</div>`;
    html += '</div>';
  }

  if (hasAlts) {
    html += '<div class="popover-section" style="padding:0.25rem 0">';
    html += item.alternatives.map((a, ai) => {
      const meta = [a.dance, a.mode].filter(Boolean).join(' · ');
      return `<button class="popover-row alt-pick" data-idx="${idx}" data-alt="${ai}">
        <span style="flex:1">${esc(a.name)}</span>
        ${meta ? `<span class="alt-meta">${esc(meta)}</span>` : ''}
        <span class="alt-score">${(a.score * 100).toFixed(0)}%</span>
      </button>`;
    }).join('');
    html += '</div>';
  }

  if (item.url) {
    const linkLabel = item.url.includes('tunearch.org') ? 'tunearch.org' : 'thesession.org';
    html += `<div class="popover-section popover-link"><a href="${item.url}" target="_blank" rel="noopener">${linkLabel}</a></div>`;
  }

  return html + '</div>';
}

function render() {
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
  saveItems();

  const hasItems = items.length > 0;
  footerActions.classList.toggle('hidden', !hasItems && !listening);

  if (!hasItems) {
    tuneLogEl.innerHTML = listening
      ? '<p class="text-muted text-sm italic py-4">Listening… no tunes detected yet.</p>' + actionRowHTML(0)
      : '';
    bindAll();
    return;
  }

  let html = '';
  items.forEach((item, idx) => {
    if (idx > 0) html += actionRowHTML(idx);

    if (item.type === 'divider') {
      html += `<div class="list-row divider-row" data-idx="${idx}">
        <span class="drag-handle">⠿</span>
        <hr class="divider-rule">
        <span class="row-actions">
          <button class="icon-btn tune-delete" data-idx="${idx}" title="Remove">✕</button>
        </span>
      </div>`;
      return;
    }

    const link = item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener" class="tune-link">${esc(item.name)}</a>`
      : `<span class="italic">${esc(item.name)}</span>`;

    const meta = [item.dance, item.mode].filter(Boolean);
    const metaStr = meta.length ? `<span class="tune-meta"> · ${esc(meta.join(' · '))}</span>` : '';
    const score = item.score != null
      ? `<span class="tune-score">${(item.score * 100).toFixed(0)}%</span>`
      : `<span class="tune-manual">manual</span>`;

    html += `<div class="list-row tune-row" data-idx="${idx}">
      <span class="drag-handle">⠿</span>
      <span class="tune-num">${tuneNumber(idx)}</span>
      <span class="tune-body">${link}${metaStr}${score}</span>
      <span class="row-actions">
        <button class="icon-btn tune-delete" data-idx="${idx}" title="Remove">✕</button>
      </span>
      ${openAltsIdx === idx ? altsPopoverHTML(idx) : ''}
    </div>`;
  });

  html += actionRowHTML(items.length);
  tuneLogEl.innerHTML = html;
  bindAll();
  initSortable();
}

// ── SortableJS ──
function initSortable() {
  if (items.length < 2) return;
  sortableInstance = new Sortable(tuneLogEl, {
    animation: 150,
    handle: '.drag-handle',
    draggable: '.list-row',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    filter: '.action-row',
    preventOnFilter: false,
    onEnd: () => {
      const reordered = [...tuneLogEl.querySelectorAll('.list-row')].map(r => items[parseInt(r.dataset.idx)]);
      items = reordered;
      openAltsIdx = null;
      render();
    },
  });
}

// ── Event binding ──
function bindAll() {
  // Delete
  tuneLogEl.querySelectorAll('.tune-delete').forEach(el =>
    el.addEventListener('click', (e) => { e.stopPropagation(); items.splice(parseInt(el.dataset.idx), 1); openAltsIdx = null; render(); }));

  // Row tap → popover
  tuneLogEl.querySelectorAll('.tune-row').forEach(row =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('a, .tune-delete, .drag-handle')) return;
      e.stopPropagation();
      const idx = parseInt(row.dataset.idx);
      if (items[idx]?.manual) return;
      openAltsIdx = openAltsIdx === idx ? null : idx;
      render();
    }));

  // Alt swap
  tuneLogEl.querySelectorAll('.alt-pick').forEach(el =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.idx), ai = parseInt(el.dataset.alt);
      const item = items[idx], alt = item.alternatives[ai];
      const oldFields = tuneFields(item);
      const alts = [...item.alternatives];
      alts.splice(ai, 1);
      alts.unshift(oldFields);
      items[idx] = { ...tuneFields(alt), type: 'tune', aliases: item.aliases, alternatives: alts };
      openAltsIdx = null;
      render();
    }));

  // Close popover on outside click
  if (openAltsIdx !== null) {
    setTimeout(() => document.addEventListener('click', () => { openAltsIdx = null; render(); }, { once: true }), 0);
  }

  // Set break
  tuneLogEl.querySelectorAll('.do-set-break').forEach(el =>
    el.addEventListener('click', () => { items.splice(parseInt(el.dataset.insert), 0, { type: 'divider' }); render(); }));

  // Add tune
  tuneLogEl.querySelectorAll('.do-add-tune').forEach(el =>
    el.addEventListener('click', () => spawnNewTuneRow(el, parseInt(el.dataset.insert))));
}

function spawnNewTuneRow(anchor, idx) {
  const actionRow = anchor.closest('.action-row');
  if (!actionRow) return;

  const row = document.createElement('div');
  row.className = 'list-row';
  row.innerHTML = `<span class="drag-handle" style="visibility:hidden">⠿</span>
    <span class="tune-num" style="color:var(--color-border)">+</span>
    <input type="text" class="new-tune-input" placeholder="Tune name…">
    <span class="row-actions" style="opacity:1">
      <button class="icon-btn cancel-new" title="Cancel">✕</button>
    </span>`;

  actionRow.after(row);
  const input = row.querySelector('.new-tune-input');
  input.focus();

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const name = input.value.trim();
    if (name) items.splice(idx, 0, { type: 'tune', name, manual: true });
    render();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { done = true; render(); }
  });
  input.addEventListener('blur', () => setTimeout(commit, 100));
  row.querySelector('.cancel-new').addEventListener('click', (e) => { e.stopPropagation(); done = true; render(); });
}

// ── Folkfriend results ──
function handleResults(results) {
  if (!results?.length) { updateDebug('no results'); return; }
  const minScore = parseFloat(minScoreInput.value) || 0.25;
  const top = results[0];
  updateDebug(`${top.display_name} (${(top.score * 100).toFixed(0)}%)`);
  if (top.score < minScore) return;

  const tuneId = top.setting.tune_id;

  // Dedup: update score if last tune is same
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === 'tune') {
      if (items[i].tuneId === tuneId) {
        if (top.score > (items[i].score || 0)) items[i].score = top.score;
        render();
        return;
      }
      break;
    }
  }

  const item = tuneFromResult(top);
  item.alternatives = results.slice(1, 4).map(tuneFromResult);
  items.push(item);
  render();
  tuneLogEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Audio lifecycle ──
async function startListening() {
  setStatus('Loading WASM…');
  framesSent = 0; queriesSent = 0;
  debugEl.classList.remove('hidden');
  updateDebug('—');

  worker = new Worker('/listen/listen-worker.js', { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'status') setStatus(data.msg);
    if (data.type === 'ready') { workerReady = true; setStatus('Listening…'); startQueryLoop(); }
    if (data.type === 'results') { queriesSent++; handleResults(data.results); }
    if (data.type === 'no-match') { queriesSent++; updateDebug(`no match: ${data.reason}`); }
    if (data.type === 'error') setStatus(`Error: ${data.msg}`);
  };
  worker.onerror = (e) => setStatus(`Worker error: ${e.message}`);

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch { setStatus('Mic access denied'); return; }

  audioCtx = new AudioContext();
  worker.postMessage({ type: 'init', sampleRate: audioCtx.sampleRate, genre });

  const src = audioCtx.createMediaStreamSource(micStream);
  const proc = audioCtx.createScriptProcessor(1024, 1, 1);
  proc.onaudioprocess = (e) => {
    if (!workerReady) return;
    worker.postMessage({ type: 'audio', pcm: new Float32Array(e.inputBuffer.getChannelData(0)) });
    framesSent++;
    if (framesSent % 50 === 0) updateDebug();
  };
  src.connect(proc);
  proc.connect(audioCtx.destination);

  listening = true;
  btnLabel.textContent = 'Stop';
  btn.dataset.listening = 'true';
  render();
}

function startQueryLoop() {
  const s = parseInt(intervalSel.value) || 15;
  queryTimer = setInterval(() => { if (workerReady) worker.postMessage({ type: 'query' }); }, s * 1000);
}

function stopListening() {
  if (queryTimer) clearInterval(queryTimer);
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  if (worker) worker.terminate();
  worker = null; audioCtx = null; micStream = null; workerReady = false; listening = false;
  btnLabel.textContent = 'Start Listening';
  btn.dataset.listening = 'false';
  setStatus(items.length ? `${items.filter(i => i.type === 'tune').length} tune(s)` : '');
  render();
}

// ── Export ──
function tuneToText(t) {
  const meta = [t.dance, t.mode].filter(Boolean).join(', ');
  const url = t.url ? ` — ${t.url.replace('https://', '')}` : '';
  return `${t.name}${meta ? ` (${meta})` : ''}${url}`;
}

function getTextExport() {
  if (genre === 'oldtime') {
    return items.filter(i => i.type === 'tune').map(tuneToText).join('\n');
  }
  return splitIntoSets().map(tunes =>
    tunes.map(tuneToText).join('\n')
  ).join('\n---\n');
}

function tunesToJSON(tunesArr) {
  return tunesArr.map(t => ({
    tuneId: t.tuneId
      ? (t.url?.includes('tunearch.org') ? `__tta_${t.tuneId}` : `__thesession_${t.tuneId}`)
      : `__manual_${slugify(t.name)}`,
    ...(t.url && { url: t.url }),
    _name: t.name,
    ...(t.mode && { key: modeToKey(t.mode) }),
  }));
}

function getJSONExport() {
  const today = new Date().toISOString().slice(0, 10);
  // Old Time: each tune is standalone (no sets)
  const sets = genre === 'oldtime'
    ? items.filter(i => i.type === 'tune').map(t => ({
      tunes: tunesToJSON([t]),
    }))
    : splitIntoSets().map(tunes => ({
      label: dominantValue(tunes.map(t => t.dance).filter(Boolean)) + 's' || undefined,
      tunes: tunesToJSON(tunes),
    }));

  return JSON.stringify({
    id: `sess_${today}`, seriesId: '', date: today,
    sets,
  }, null, 2);
}

function getExportContent() {
  return activeExportTab === 'json' ? getJSONExport() : getTextExport();
}

function updateExportPanel() {
  exportPreview.textContent = getExportContent();
  document.querySelectorAll('.export-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === activeExportTab));
}

// ── Event bindings ──
btn.addEventListener('click', () => listening ? stopListening() : startListening());
btnClear.addEventListener('click', () => { if (items.length && !confirm('Clear all items?')) return; items = []; render(); });

btnToggleExport.addEventListener('click', () => {
  const wasHidden = exportPanel.classList.toggle('hidden');
  if (!wasHidden) updateExportPanel();
  btnToggleExport.textContent = wasHidden ? 'Export' : 'Hide Export';
});

document.querySelectorAll('.export-tab').forEach(t =>
  t.addEventListener('click', () => { activeExportTab = t.dataset.tab; updateExportPanel(); }));

btnCopy.addEventListener('click', async () => {
  await copyToClipboard(getExportContent());
  btnCopy.textContent = 'Copied!';
  setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
});

btnDownload.addEventListener('click', () => {
  const today = new Date().toISOString().slice(0, 10);
  const ext = activeExportTab === 'json' ? 'json' : 'txt';
  const mime = activeExportTab === 'json' ? 'application/json' : 'text/plain';
  download(`session-${today}.${ext}`, getExportContent(), mime);
});

// ── Genre toggle (pill tabs) ──
const genreToggle = $('genre-toggle');
function updateGenrePills() {
  if (!genreToggle) return;
  genreToggle.querySelectorAll('.pill-toggle-btn').forEach(pill => {
    pill.setAttribute('aria-selected', pill.dataset.genre === genre ? 'true' : 'false');
  });
}
if (genreToggle) {
  updateGenrePills();
  genreToggle.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill-toggle-btn');
    if (!pill || pill.dataset.genre === genre) return;
    const wasListening = listening;
    if (wasListening) stopListening();
    genre = pill.dataset.genre;
    localStorage.setItem('nfs-listen-genre', genre);
    updateGenrePills();
    render();
    if (wasListening) startListening();
  });
}

// ── Init ──
if (items.length) render();
