/* ============================================================
   KoinX Reconciliation Engine — app.js
   Handles: file upload, API calls, report rendering,
   tabs, pagination, search, CSV/JSON download
   ============================================================ */

(function () {
  'use strict';

  // ── STATE ───────────────────────────────────────────────────
  const state = {
    currentRunId: null,
    fullReport: [],       // all entries from last run
    filtered: [],         // after tab + search filter
    currentPage: 1,
    pageSize: 20,
    activeTab: 'matched',
    apiBase: 'http://localhost:3000',
  };

  // ── DOM REFS ─────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const form         = $('reconcileForm');
  const runBtn       = $('runBtn');
  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  const progressLabel= $('progressLabel');
  const errorBanner  = $('errorBanner');
  const errorMsg     = $('errorMsg');
  const resultsSection = $('resultsSection');
  const runMeta      = $('runMeta');
  const summaryGrid  = $('summaryGrid');
  const recThead     = $('recThead');
  const recTbody     = $('recTbody');
  const tableEmpty   = $('tableEmpty');
  const pagination   = $('pagination');
  const searchInput  = $('searchInput');
  const apiBaseInput = $('apiBase');
  const lookupBtn    = $('lookupBtn');
  const runIdInput   = $('runIdInput');
  const dbStatus     = $('dbStatus');
  const dbLabel      = $('dbLabel');

  // ── FILE INPUTS ──────────────────────────────────────────────
  function setupFileZone(inputId, zoneId, nameId) {
    const input  = $(inputId);
    const zone   = $(zoneId);
    const nameEl = $(nameId);

    input.addEventListener('change', () => {
      const f = input.files[0];
      if (f) {
        nameEl.textContent = f.name;
        zone.classList.add('has-file');
      }
    });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.csv')) {
        const dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        nameEl.textContent = f.name;
        zone.classList.add('has-file');
      }
    });
  }

  setupFileZone('userFile', 'userZone', 'userFileName');
  setupFileZone('exchangeFile', 'exchangeZone', 'exchangeFileName');

  // ── SLIDER ↔ INPUT SYNC ──────────────────────────────────────
  function syncSlider(sliderId, inputId) {
    const slider = $(sliderId);
    const input  = $(inputId);
    slider.addEventListener('input', () => { input.value = slider.value; });
    input.addEventListener('input', () => { slider.value = input.value; });
  }
  syncSlider('tsSlider', 'tsToleranceInput');
  syncSlider('qtySlider', 'qtyToleranceInput');

  // ── API BASE ─────────────────────────────────────────────────
  apiBaseInput.addEventListener('change', () => {
    state.apiBase = apiBaseInput.value.replace(/\/$/, '');
  });

  // ── CONNECTIVITY PROBE ───────────────────────────────────────
  async function probeHealth() {
    try {
      const r = await fetch(`${state.apiBase}/`, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        dbStatus.className = 'status-dot ok';
        dbLabel.textContent = 'API reachable';
      } else throw new Error();
    } catch {
      dbStatus.className = 'status-dot err';
      dbLabel.textContent = 'API unreachable';
    }
  }
  probeHealth();
  setInterval(probeHealth, 15000);

  // ── ERROR DISPLAY ────────────────────────────────────────────
  function showError(msg) {
    errorMsg.textContent = msg;
    errorBanner.removeAttribute('hidden');
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function hideError() { errorBanner.setAttribute('hidden', ''); }
  $('errorClose').addEventListener('click', hideError);

  // ── PROGRESS ─────────────────────────────────────────────────
  function setProgress(pct, label) {
    progressFill.style.width = `${pct}%`;
    progressLabel.textContent = label;
    progressWrap.removeAttribute('hidden');
  }
  function hideProgress() { progressWrap.setAttribute('hidden', ''); }

  // ── FORM SUBMIT ──────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const userFile     = $('userFile').files[0];
    const exchangeFile = $('exchangeFile').files[0];

    if (!userFile)     return showError('Please upload the user_transactions.csv file.');
    if (!exchangeFile) return showError('Please upload the exchange_transactions.csv file.');

    const tsTol  = parseFloat($('tsToleranceInput').value);
    const qtyTol = parseFloat($('qtyToleranceInput').value);
    state.apiBase = apiBaseInput.value.replace(/\/$/, '');

    const fd = new FormData();
    fd.append('user_file', userFile);
    fd.append('exchange_file', exchangeFile);
    fd.append('TIMESTAMP_TOLERANCE_SECONDS', tsTol);
    fd.append('QUANTITY_TOLERANCE_PCT', qtyTol);

    runBtn.disabled = true;
    runBtn.querySelector('.run-btn-text').textContent = 'Running…';
    runBtn.querySelector('.run-btn-icon').textContent = '⟳';
    runBtn.querySelector('.run-btn-icon').classList.add('spin');

    setProgress(10, 'Uploading CSV files to server…');

    try {
      setProgress(30, 'Server ingesting and validating rows…');

      const resp = await fetch(`${state.apiBase}/api/reconcile`, {
        method: 'POST',
        body: fd,
      });

      setProgress(60, 'Running matching engine…');

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `Server error ${resp.status}`);
      }

      setProgress(85, 'Fetching full report…');

      const reportResp = await fetch(`${state.apiBase}/api/report/${data.runId}`);
      const reportData = await reportResp.json();

      setProgress(100, 'Done!');
      setTimeout(hideProgress, 600);

      state.currentRunId = data.runId;
      state.fullReport   = reportData.report || [];

      renderResults(data, reportData);
    } catch (err) {
      hideProgress();
      showError(`Reconciliation failed: ${err.message}`);
    } finally {
      runBtn.disabled = false;
      runBtn.querySelector('.run-btn-text').textContent = 'Run Reconciliation';
      runBtn.querySelector('.run-btn-icon').textContent = '→';
      runBtn.querySelector('.run-btn-icon').classList.remove('spin');
    }
  });

  // ── LOOKUP BY RUN ID ─────────────────────────────────────────
  lookupBtn.addEventListener('click', async () => {
    const runId = runIdInput.value.trim();
    if (!runId) return showError('Please enter a Run ID.');
    hideError();
    state.apiBase = apiBaseInput.value.replace(/\/$/, '');

    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Fetching…';

    try {
      const [sumResp, repResp] = await Promise.all([
        fetch(`${state.apiBase}/api/report/${runId}/summary`),
        fetch(`${state.apiBase}/api/report/${runId}`)
      ]);

      if (!sumResp.ok) throw new Error(`Run not found (${sumResp.status})`);

      const sumData = await sumResp.json();
      const repData = await repResp.json();

      state.currentRunId = runId;
      state.fullReport   = repData.report || [];

      renderResults(
        { runId, summary: sumData.summary, config: {} },
        repData
      );
    } catch (err) {
      showError(`Lookup failed: ${err.message}`);
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Fetch Report';
    }
  });

  // ── RENDER RESULTS ───────────────────────────────────────────
  function renderResults(runData, reportData) {
    const sum = runData.summary || {};

    // Meta bar
    runMeta.innerHTML = `
      <div class="meta-item">
        <span class="meta-key">Run ID</span>
        <span class="meta-val" title="${runData.runId}">${runData.runId}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">Status</span>
        <span class="meta-val ok">completed</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">Total Entries</span>
        <span class="meta-val">${(reportData.report || []).length}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">TS Tolerance</span>
        <span class="meta-val">${runData.config?.timestampToleranceSeconds ?? '—'} s</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">Qty Tolerance</span>
        <span class="meta-val">${runData.config?.quantityTolerancePct ?? '—'} %</span>
      </div>
    `;

    // Summary cards
    const cards = [
      { cls: 'matched',  tab: 'matched',           label: 'Matched',           count: sum.matched ?? 0, sub: 'Reconciled pairs' },
      { cls: 'conflict', tab: 'conflicting',        label: 'Conflicting',       count: sum.conflicting ?? 0, sub: 'Within window, out of tolerance' },
      { cls: 'unm-user', tab: 'unmatched-user',     label: 'Unmatched (User)',  count: sum.unmatchedUser ?? 0, sub: 'No exchange counterpart' },
      { cls: 'unm-exch', tab: 'unmatched-exchange', label: 'Unmatched (Exch)',  count: sum.unmatchedExchange ?? 0, sub: 'No user counterpart' },
    ];
    summaryGrid.innerHTML = cards.map(c => `
      <div class="summary-card ${c.cls} ${state.activeTab === c.tab ? 'active' : ''}" data-tab="${c.tab}">
        <span class="card-label">${c.label}</span>
        <span class="card-count">${c.count}</span>
        <span class="card-sub">${c.sub}</span>
      </div>
    `).join('');

    summaryGrid.querySelectorAll('.summary-card').forEach(card => {
      card.addEventListener('click', () => switchTab(card.dataset.tab));
    });

    // Show results
    resultsSection.removeAttribute('hidden');
    state.activeTab = 'matched';
    updateActiveTab();
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── TABS ─────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(tab) {
    state.activeTab = tab;
    state.currentPage = 1;
    searchInput.value = '';
    updateActiveTab();
  }

  function updateActiveTab() {
    // Highlight tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === state.activeTab);
    });
    // Highlight summary cards
    document.querySelectorAll('.summary-card').forEach(c => {
      c.classList.toggle('active', c.dataset.tab === state.activeTab);
    });
    applyFilter();
  }

  // ── SEARCH + FILTER ──────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    state.currentPage = 1;
    applyFilter();
  });

  function categoryForTab(tab) {
    const map = {
      'matched':           'Matched',
      'conflicting':       'Conflicting',
      'unmatched-user':    'Unmatched (User only)',
      'unmatched-exchange':'Unmatched (Exchange only)',
      'data-quality':      '__quality__',
    };
    return map[tab];
  }

  function applyFilter() {
    const q = searchInput.value.toLowerCase().trim();
    const cat = categoryForTab(state.activeTab);

    let base;
    if (cat === '__quality__') {
      base = state.fullReport.filter(e =>
        e.reason && e.reason.startsWith('Data Quality Flag')
      );
    } else {
      base = state.fullReport.filter(e => e.category === cat);
    }

    if (q) {
      base = base.filter(e => JSON.stringify(e).toLowerCase().includes(q));
    }

    state.filtered = base;
    renderTable();
    renderPagination();
  }

  // ── TABLE RENDER ─────────────────────────────────────────────
  const COLS_USER = ['transaction_id','timestamp','type','asset','quantity','price_usd','fee'];
  const COLS_EXCH = ['transaction_id','timestamp','type','asset','quantity','price_usd','fee'];

  function catPillClass(cat) {
    if (cat === 'Matched')                  return 'cat-matched';
    if (cat === 'Conflicting')              return 'cat-conflicting';
    if (cat === 'Unmatched (User only)')    return 'cat-user';
    if (cat === 'Unmatched (Exchange only)')return 'cat-exchange';
    return 'cat-quality';
  }
  function catPillLabel(cat) {
    if (cat === 'Matched')                  return 'Matched';
    if (cat === 'Conflicting')              return 'Conflicting';
    if (cat === 'Unmatched (User only)')    return 'User Only';
    if (cat === 'Unmatched (Exchange only)')return 'Exch Only';
    return 'Quality';
  }

  function renderTable() {
    const { filtered, currentPage, pageSize } = state;
    const start = (currentPage - 1) * pageSize;
    const page  = filtered.slice(start, start + pageSize);

    if (filtered.length === 0) {
      recThead.innerHTML = '';
      recTbody.innerHTML = '';
      tableEmpty.removeAttribute('hidden');
      return;
    }
    tableEmpty.setAttribute('hidden', '');

    // Header
    recThead.innerHTML = `<tr>
      <th>Category</th>
      <th>Reason</th>
      ${COLS_USER.map(c => `<th>User · ${c}</th>`).join('')}
      ${COLS_EXCH.map(c => `<th>Exch · ${c}</th>`).join('')}
    </tr>`;

    // Rows
    recTbody.innerHTML = page.map(entry => {
      const u  = entry.userTransaction || {};
      const ex = entry.exchangeTransaction || {};
      const pillCls = catPillClass(entry.category);
      const pillLbl = catPillLabel(entry.category);
      const userCells = COLS_USER.map(c => `<td title="${u[c] ?? ''}">${fmt(u[c])}</td>`).join('');
      const exchCells = COLS_EXCH.map(c => `<td title="${ex[c] ?? ''}">${fmt(ex[c])}</td>`).join('');
      return `<tr>
        <td><span class="cat-pill ${pillCls}">${pillLbl}</span></td>
        <td title="${htmlEsc(entry.reason || '')}">${htmlEsc(truncate(entry.reason, 60))}</td>
        ${userCells}
        ${exchCells}
      </tr>`;
    }).join('');
  }

  function fmt(v) {
    if (v === null || v === undefined || v === '') return '<span style="color:var(--text3)">—</span>';
    if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 8 });
    return htmlEsc(String(v));
  }
  function htmlEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }

  // ── PAGINATION ───────────────────────────────────────────────
  function renderPagination() {
    const total = Math.ceil(state.filtered.length / state.pageSize);
    if (total <= 1) { pagination.innerHTML = ''; return; }

    const { currentPage } = state;
    let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">←</button>`;

    const range = pageRange(currentPage, total);
    let prev = null;
    for (const p of range) {
      if (prev !== null && p - prev > 1) html += `<span class="page-info">…</span>`;
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
      prev = p;
    }

    html += `<button class="page-btn" ${currentPage === total ? 'disabled' : ''} data-page="${currentPage + 1}">→</button>`;
    html += `<span class="page-info">${state.filtered.length} entries</span>`;

    pagination.innerHTML = html;
    pagination.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentPage = parseInt(btn.dataset.page);
        renderTable();
        renderPagination();
      });
    });
  }

  function pageRange(cur, total) {
    const delta = 2;
    const pages = new Set([1, total]);
    for (let i = Math.max(2, cur - delta); i <= Math.min(total - 1, cur + delta); i++) pages.add(i);
    return [...pages].sort((a,b)=>a-b);
  }

  // ── DOWNLOAD CSV ─────────────────────────────────────────────
  $('dlCsvBtn').addEventListener('click', () => {
    if (!state.currentRunId) return showError('No active run. Run a reconciliation first.');
    const url = `${state.apiBase}/api/report/${state.currentRunId}?format=csv`;
    const a = document.createElement('a');
    a.href = url; a.download = `reconciliation_${state.currentRunId}.csv`;
    a.click();
  });

  // ── DOWNLOAD JSON ────────────────────────────────────────────
  $('dlJsonBtn').addEventListener('click', () => {
    if (!state.filtered.length) return showError('No data to export.');
    const blob = new Blob([JSON.stringify(state.filtered, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `report_${state.activeTab}_${state.currentRunId || 'local'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

})();