/* ═══════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — SMS Test Panel JS (Production Ready v2.0)
   ═══════════════════════════════════════════════ */

const API = '';
let PUSER = {};
let activeChart = null;
let otpWebSocket = null;
let isLivePaused = false;

// ── Auth ──────────────────────────────────────────────────────────
(function() {
  const tp = sessionStorage.getItem('tp_logged_in') === '1';
  const adm = sessionStorage.getItem('admin_logged_in') === '1';
  if (!tp && !adm) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = '/login';
        return;
      }
    } catch (e) {}
    window.location.href = '/login';
    return;
  }
  try {
    PUSER = JSON.parse(sessionStorage.getItem('tp_user') || sessionStorage.getItem('admin_user') || '{}');
  } catch (err) {
    PUSER = {};
  }
  const el = document.getElementById('tp-uname');
  if (el) el.textContent = PUSER.username || 'Guest';
  const lastPage = sessionStorage.getItem('tp_current_page') || 'dashboard';
  showPage(lastPage);
})();

function doLogout() {
  try {
    ['tp_logged_in', 'tp_user', 'admin_logged_in', 'admin_user', 'tp_current_page', 'admin_current_page'].forEach(k => {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    });
    sessionStorage.clear();
  } catch (e) {}
  try {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  } catch (e) {}
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = '/login';
      return;
    }
  } catch (e) {}
  window.location.href = '/login';
}

// ── API Helpers ──────────────────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const authHeaders = {};
    try {
      const u = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
      if (u && u.token) authHeaders['Authorization'] = `Bearer ${u.token}`;
    } catch (_) {}

    const response = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json', ...authHeaders, ...(opts.headers || {}) },
      ...opts
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (data && data.error && !('success' in data)) {
      throw new Error(data.error);
    }
    return data;
  } catch (err) {
    console.error(`api error [${path}]:`, err);
    toast(err.message || 'Network error', 'error');
    return null;
  }
}

function toast(msg, type = 'info') {
  const container = document.getElementById('toast-c');
  if (!container) return;
  
  const colors = {
    success: '#28a745',
    error: '#dc3545',
    warning: '#ffc107',
    info: '#659A00'
  };
  
  const el = document.createElement('div');
  el.className = 'toast-i';
  el.style.borderLeftColor = colors[type] || colors.info;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 3500);
}

function fmtDT(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');
  } catch {
    return '—';
  }
}

function fmtShort(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function statusBadge(status) {
  const map = {
    active: 'green',
    inactive: 'gray',
    blocked: 'red',
    pending: 'yellow',
    delivered: 'green',
    failed: 'red'
  };
  return `<span class="badge badge-${map[status] || 'blue'}">${status || '—'}</span>`;
}

function csvDl(headers, rows, name) {
  try {
    const c = [headers.join(','), ...rows.map(r => r.map(v =>
      `"${String(v).replace(/<[^>]+>/g, '').replace(/"/g, '""')}"`
    ).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([c], { type: 'text/csv' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error('CSV download error:', err);
    toast('Failed to download CSV', 'error');
  }
}

function buildTable(headers, rows) {
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  let tbody;
  if (rows && rows.length) {
    tbody = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  } else {
    tbody = `<tr><td colspan="${headers.length}" style="text-align:center;padding:30px;color:#999;">No data found</td></tr>`;
  }
  return `<table class="dt"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function buildPager(cur, total, fn) {
  const prev = `<button onclick="${fn}(${cur - 1})" ${cur <= 1 ? 'disabled' : ''}>Previous</button>`;
  const next = `<button onclick="${fn}(${cur + 1})" ${cur >= total ? 'disabled' : ''}>Next</button>`;
  const first = `<button onclick="${fn}(1)" ${cur <= 1 ? 'disabled' : ''}>First</button>`;
  const last = `<button onclick="${fn}(${total})" ${cur >= total ? 'disabled' : ''}>Last</button>`;
  let nums = '';
  const start = Math.max(1, cur - 2);
  const end = Math.min(total, cur + 2);
  for (let p = start; p <= end; p++) {
    nums += `<button class="${p === cur ? 'active' : ''}" onclick="${fn}(${p})">${p}</button>`;
  }
  return first + prev + nums + next + last;
}

// ── Router ────────────────────────────────────────────────────────
function showPage(page) {
  sessionStorage.setItem('tp_current_page', page);
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  const sb = document.getElementById('sb-' + page);
  if (sb) sb.classList.add('active');

  const labels = {
    'dashboard': 'Dashboard',
    'test-numbers': 'SMS Test Numbers',
    'sms-stats': 'Test SMS Reports'
  };
  document.getElementById('bc').textContent = labels[page] || page;

  const pages = {
    'dashboard': pgDashboard,
    'test-numbers': pgTestNumbers,
    'sms-stats': pgSmsStats
  };

  if (pages[page]) {
    pages[page]();
  } else {
    document.getElementById('main-content').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Page not found</p>
      </div>
    `;
  }
}

// ══════════════════════════════════════════════════
//  DASHBOARD — Real Data from API
// ══════════════════════════════════════════════════

async function pgDashboard() {
  try {
    const [stats, news, ranges] = await Promise.all([
      api('/api/sms/test-stats'),
      api('/api/announcements'),
      api('/api/numbers/sms-ranges')
    ]);

    const todaySms = stats?.today || 0;
    const weekSms = stats?.this_week || 0;
    const monthSms = stats?.this_month || 0;
    const weekLabels = stats?.week_labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekData = stats?.week_data || [0, 0, 0, 0, 0, 0, 0];

    document.getElementById('main-content').innerHTML = `
      <!-- Quick nav -->
      <div class="quicknav">
        <div class="qn-box active" onclick="showPage('dashboard')">
          <div class="qn-icon"><i class="fas fa-th"></i></div>
          <div class="qn-label">Dashboard</div>
        </div>
        <div class="qn-box" onclick="showPage('test-numbers')">
          <div class="qn-icon"><i class="fas fa-mobile-screen-button"></i></div>
          <div class="qn-label">Test Numbers</div>
        </div>
        <div class="qn-box" onclick="showPage('sms-stats')">
          <div class="qn-icon"><i class="fas fa-chart-bar"></i></div>
          <div class="qn-label">Detailed Reports</div>
        </div>
        <div class="qn-box" onclick="doLogout()">
          <div class="qn-icon"><i class="fas fa-user-circle"></i></div>
          <div class="qn-label">Logout</div>
        </div>
      </div>

      <!-- Counters -->
      <div class="counters">
        <div class="ctr ctr-blue">
          <div class="ctr-icon"><i class="fas fa-calendar-day"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Today SMS</div>
            <div class="ctr-val">${todaySms}</div>
          </div>
          <div class="ctr-arrow">${todaySms > 0 ? '▲' : '—'}</div>
        </div>
        <div class="ctr ctr-green">
          <div class="ctr-icon"><i class="fas fa-calendar-week"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Last 7 Days SMS</div>
            <div class="ctr-val">${weekSms}</div>
          </div>
          <div class="ctr-arrow">${weekSms > 0 ? '▲' : '—'}</div>
        </div>
        <div class="ctr ctr-orange">
          <div class="ctr-icon"><i class="fas fa-calendar-alt"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Last 30 Days SMS</div>
            <div class="ctr-val">${monthSms}</div>
          </div>
          <div class="ctr-arrow">${monthSms > 0 ? '▲' : '—'}</div>
        </div>
      </div>

      <!-- Chart -->
      <div class="chart-box">
        <div class="chart-title">SMS — Last 7 Days</div>
        <div class="chart-wrap"><canvas id="wk-chart"></canvas></div>
      </div>

      <!-- Bottom panels -->
      <div class="bottom-grid">
        <div class="panel-box">
          <div class="panel-head"><i class="fas fa-newspaper"></i> NEWS &amp; NOTIFICATIONS</div>
          <div class="panel-body" id="news-panel">
            ${buildNewsTable(news)}
          </div>
        </div>
        <div class="panel-box">
          <div class="panel-head"><i class="fas fa-mobile-screen"></i> RECENT RANGES</div>
          <div class="panel-body" id="ranges-panel">
            ${buildRangesTable(ranges)}
          </div>
        </div>
      </div>
    `;

    // ── Draw Chart ──
    try {
      if (activeChart) { try { activeChart.destroy(); } catch (e) {} }
      const ctx = document.getElementById('wk-chart');
      if (ctx && typeof Chart !== 'undefined') {
        activeChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: weekLabels,
            datasets: [{
              data: weekData,
              borderColor: '#659A00',
              backgroundColor: 'rgba(26,111,196,0.08)',
              pointBackgroundColor: '#659A00',
              pointRadius: 5,
              fill: true,
              tension: 0.2,
              borderWidth: 2,
              label: 'SMS'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b949e', font: { size: 11 } } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b949e', font: { size: 11 }, beginAtZero: true } }
            }
          }
        });
      }
    } catch (err) {
      console.warn('Chart render error:', err);
    }

  } catch (err) {
    console.error('Dashboard error:', err);
    toast('Failed to load dashboard', 'error');
    document.getElementById('main-content').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load dashboard. Please refresh.</p>
        <button class="btn-blue" onclick="pgDashboard()" style="margin-top:12px;">Retry</button>
      </div>
    `;
  }
}

function buildNewsTable(data) {
  const rows = (data?.data || []).slice(0, 3);
  if (!rows.length) {
    return '<div style="padding:10px;color:var(--text-muted);">No announcements.</div>';
  }
  const tbody = rows.map((a, i) => `
    <tr class="${i % 2 ? 'alt' : ''}">
      <td style="min-width:110px;">${fmtDT(a.created).split(' ')[0]}</td>
      <td>${a.title || '—'}</td>
      <td>${a.body || ''}</td>
    </tr>
  `).join('');
  return `
    <div class="dt-pager">
      <button>First</button><button>Previous</button>
      <button class="active">1</button><button>Next</button><button>Last</button>
    </div>
    <table class="dt"><thead><tr>
      <th>Date ▲</th><th>Headline ⇅</th><th>News ⇅</th>
    </tr></thead><tbody>${tbody}</tbody></table>
  `;
}

function buildRangesTable(data) {
  const rows = (data || []).slice(0, 5);
  if (!rows.length) {
    return '<div style="padding:10px;color:var(--text-muted);">No ranges available.</div>';
  }
  const tbody = rows.map((r, i) => `
    <tr class="${i % 2 ? 'alt' : ''}">
      <td>${r.prefix || '—'}</td>
      <td>${r.country || '—'}</td>
      <td>${r.provider || '—'}</td>
      <td>${statusBadge(r.active ? 'active' : 'inactive')}</td>
    </tr>
  `).join('');
  return `
    <div class="dt-pager">
      <button>First</button><button>Previous</button>
      <button class="active">1</button><button>Next</button><button>Last</button>
    </div>
    <table class="dt"><thead><tr>
      <th>Range ▲</th><th>Country ⇅</th><th>Provider ⇅</th><th>Status ⇅</th>
    </tr></thead><tbody>${tbody}</tbody></table>
  `;
}

// ══════════════════════════════════════════════════
//  SMS TEST NUMBERS — Real Data from API
// ══════════════════════════════════════════════════

let tn_pg = 1,
  tn_pp = 25,
  tn_q = '',
  tn_rf = '',
  tn_rows = [],
  tn_total = 0;

let rs_pg = 1,
  rs_pp = 25,
  rs_rows = [],
  rs_total = 0,
  rs_pollTimer = null;

function maskCli(cli) {
  if (!cli) return '—';
  return cli.charAt(0).toUpperCase() + 'XXXXX';
}

async function pgTestNumbers() {
  try {
    const ranges = await api('/api/numbers/sms-ranges');
    window._tnRanges = ranges || [];
    const rOpts = (ranges || []).map(r =>
      `<option value="${r.id}">${r.country || ''} ${r.prefix || ''}</option>`
    ).join('');

    document.getElementById('main-content').innerHTML = `
      <p class="page-intro">Test numbers uploaded by Owner, and the live SMS test feed received on them.</p>

      <div class="two-col-panel" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
        <div class="panel-box">
          <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
            <span><i class="fas fa-mobile-screen"></i> SMS TEST NUMBERS</span>
            <button class="btn-blue" onclick="applyTnFilter()"><i class="fas fa-chart-bar"></i> Show Report</button>
          </div>
          <div class="panel-body">
            <div class="filter-bar">
              <select id="tn-rf" style="min-width:150px;" onchange="applyTnFilter()">
                <option value="">Select Range</option>
                ${rOpts}
              </select>
              <button class="btn-red" onclick="applyTnFilter()"><i class="fas fa-filter"></i> Filter</button>
              <button class="btn-outline-sm" onclick="resetTnFilters()"><i class="fas fa-undo"></i> Reset</button>
            </div>
            <div class="dt-toolbar">
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <div class="dt-per-wrap">
                  Show
                  <select id="tn-pp" onchange="tn_pp=+this.value;tn_pg=1;pgTestNumbers()">
                    <option value="25" ${tn_pp === 25 ? 'selected' : ''}>25</option>
                    <option value="50" ${tn_pp === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${tn_pp === 100 ? 'selected' : ''}>100</option>
                    <option value="500" ${tn_pp === 500 ? 'selected' : ''}>500</option>
                  </select>
                  entries
                </div>
                <div class="dt-export">
                  <button onclick="tnCopy()">Copy</button>
                  <button onclick="tnCsv()">CSV</button>
                  <button onclick="toast('PDF generating…', 'info')">PDF</button>
                </div>
              </div>
              <div class="dt-search-wrap">
                <label>Search:</label>
                <input id="tn-q" placeholder="🔍" onkeyup="if(event.key==='Enter') applyTnFilter()">
              </div>
            </div>
            <div id="tn-wrap"></div>
          </div>
        </div>

        <div class="panel-box">
          <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
            <span><i class="fas fa-comment-sms"></i> RECENT SMS TEST</span>
            <span style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);">
              <span style="width:8px;height:8px;border-radius:50%;background:#28a745;display:inline-block;"></span> Live
            </span>
          </div>
          <div class="panel-body">
            <div class="dt-toolbar">
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <div class="dt-per-wrap">
                  Show
                  <select id="rs-pp" onchange="rs_pp=+this.value;rs_pg=1;loadRecentSms()">
                    <option value="25" ${rs_pp === 25 ? 'selected' : ''}>25</option>
                    <option value="50" ${rs_pp === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${rs_pp === 100 ? 'selected' : ''}>100</option>
                  </select>
                  entries
                </div>
                <div class="dt-export">
                  <button onclick="rsCopy()">Copy</button>
                  <button onclick="rsCsv()">CSV</button>
                  <button onclick="toast('PDF generating…', 'info')">PDF</button>
                </div>
              </div>
            </div>
            <div id="rs-wrap"></div>
          </div>
        </div>
      </div>
    `;

    tn_pg = 1;
    await loadTn();
    rs_pg = 1;
    await loadRecentSms();

    // Poll the "Recent SMS Test" feed every 3s for live real-time sync
    if (rs_pollTimer) clearInterval(rs_pollTimer);
    rs_pollTimer = setInterval(loadRecentSms, 3000);

  } catch (err) {
    console.error('Test numbers error:', err);
    toast('Failed to load test panel', 'error');
  }
}

async function loadTn() {
  const params = new URLSearchParams();
  params.append('page', tn_pg);
  params.append('limit', tn_pp);
  if (tn_rf) params.append('range', tn_rf);
  if (tn_q) params.append('search', tn_q);
  const data = await api(`/api/sms/test-numbers?${params.toString()}`);
  tn_rows = data?.data || [];
  tn_total = data?.total || 0;
  renderTn();
}

function applyTnFilter() {
  tn_rf = document.getElementById('tn-rf')?.value || '';
  tn_q = document.getElementById('tn-q')?.value || '';
  tn_pg = 1;
  loadTn();
}

function resetTnFilters() {
  const rf = document.getElementById('tn-rf');
  const q = document.getElementById('tn-q');
  if (rf) rf.value = '';
  if (q) q.value = '';
  tn_rf = '';
  tn_q = '';
  tn_pg = 1;
  loadTn();
}

function renderTn() {
  const pages = Math.ceil(tn_total / tn_pp) || 1;
  const start = (tn_pg - 1) * tn_pp;

  const tbody = tn_rows.length
    ? tn_rows.map((r, i) => `<tr class="${i % 2 ? 'alt' : ''}">
        <td>${r.range_label || '—'}</td>
        <td><b>${r.number || '—'}</b></td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="text-align:center;padding:18px;color:var(--text-muted);">No test numbers yet — use "Show Report" to have Owner add some</td></tr>`;

  document.getElementById('tn-wrap').innerHTML = `
    <table class="dt"><thead><tr><th>Range ▲</th><th>Test Number ⇅</th></tr></thead><tbody>${tbody}</tbody></table>
    <div class="dt-pager">${buildPager(tn_pg, pages, 'tnGo')}</div>
    <div class="dt-info">Showing ${tn_total === 0 ? 0 : start + 1}–${Math.min(start + tn_pp, tn_total)} of ${tn_total} entries</div>
  `;
}

function tnGo(p) {
  const pages = Math.ceil(tn_total / tn_pp) || 1;
  tn_pg = Math.max(1, Math.min(p, pages));
  loadTn();
}

function tnCopy() {
  const text = tn_rows.map(r => `${r.range_label || ''}\t${r.number || ''}`).join('\n');
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success')).catch(() => toast('Copy failed', 'error'));
}
function tnCsv() {
  csvDl(['Range', 'Test Number'], tn_rows.map(r => [r.range_label || '', r.number || '']), 'test_numbers.csv');
  toast('CSV downloaded', 'success');
}

async function loadRecentSms() {
  const params = new URLSearchParams();
  params.append('page', rs_pg);
  params.append('limit', rs_pp);
  const data = await api(`/api/sms/test-logs?${params.toString()}`);
  rs_rows = data?.data || [];
  rs_total = data?.total || 0;
  renderRecentSms();
}

function renderRecentSms() {
  const pages = Math.ceil(rs_total / rs_pp) || 1;
  const start = (rs_pg - 1) * rs_pp;

  const tbody = rs_rows.length
    ? rs_rows.map((s, i) => `<tr class="${i % 2 ? 'alt' : ''}">
        <td style="white-space:nowrap;">${fmtDT(s.timestamp)}</td>
        <td>${s.range_label || '—'}</td>
        <td><b>${s.number || '—'}</b></td>
        <td>${maskCli(s.cli)}</td>
        <td>********</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--text-muted);">No SMS received on test numbers yet</td></tr>`;

  document.getElementById('rs-wrap').innerHTML = `
    <table class="dt"><thead><tr>
      <th>Date ⇅</th><th>Range ⇅</th><th>Number ⇅</th><th>CLI ⇅</th><th>SMS ⇅</th>
    </tr></thead><tbody>${tbody}</tbody></table>
    <div class="dt-pager">${buildPager(rs_pg, pages, 'rsGo')}</div>
    <div class="dt-info">Showing ${rs_total === 0 ? 0 : start + 1}–${Math.min(start + rs_pp, rs_total)} of ${rs_total} entries</div>
  `;
}

function rsGo(p) {
  const pages = Math.ceil(rs_total / rs_pp) || 1;
  rs_pg = Math.max(1, Math.min(p, pages));
  loadRecentSms();
}

function rsCopy() {
  const text = rs_rows.map(s => `${fmtDT(s.timestamp)}\t${s.range_label || ''}\t${s.number || ''}\t${maskCli(s.cli)}\t********`).join('\n');
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success')).catch(() => toast('Copy failed', 'error'));
}
function rsCsv() {
  csvDl(['Date', 'Range', 'Number', 'CLI', 'SMS'],
    rs_rows.map(s => [fmtDT(s.timestamp), s.range_label || '', s.number || '', maskCli(s.cli), '********']),
    'recent_sms_test.csv');
  toast('CSV downloaded', 'success');
}

async function openUploadTestNumbersModal() {
  const ranges = window._tnRanges || (await api('/api/numbers/sms-ranges')) || [];
  const modalHtml = `
    <div class="modal-overlay" id="tn-upload-modal" onclick="if(event.target===this) this.remove()">
      <div class="modal-box">
        <div class="modal-head">
          <span><i class="fas fa-upload"></i> Add Test Numbers</span>
          <button onclick="document.getElementById('tn-upload-modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Pull numbers from an existing range into the test panel.</p>
          <label class="form-label">Range</label>
          <select id="tn-up-range" style="width:100%;margin-bottom:12px;">
            ${ranges.map(r => `<option value="${r.id}">${r.country || ''} ${r.prefix || ''} — ${r.provider || ''}</option>`).join('')}
          </select>
          <label class="form-label">How many numbers</label>
          <input type="number" id="tn-up-count" value="10" min="1" max="200" style="width:100%;margin-bottom:16px;">
          <button class="btn-blue" style="width:100%;" onclick="submitUploadTestNumbers()"><i class="fas fa-upload"></i> Add to Test Panel</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function submitUploadTestNumbers() {
  const rangeId = document.getElementById('tn-up-range')?.value;
  const count = parseInt(document.getElementById('tn-up-count')?.value) || 10;
  if (!rangeId) { toast('Select a range', 'error'); return; }
  const result = await api('/api/sms/test-numbers/bulk', {
    method: 'POST',
    body: JSON.stringify({ range_id: rangeId, count })
  });
  if (!result) return; // api() already showed the error toast
  document.getElementById('tn-upload-modal')?.remove();
  toast(`✅ Added ${result.added || 0} test number(s)`, 'success');
  tn_pg = 1;
  loadTn();
}

// ══════════════════════════════════════════════════
//  SMS CDR STATS — Real Data from API
// ══════════════════════════════════════════════════

let cdr_pg = 1,
  cdr_pp = 25,
  cdr_rows = [],
  cdr_total = 0;

async function pgSmsStats() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const [stats, logs] = await Promise.all([
      api('/api/sms/test-stats'),
      api(`/api/sms/test-logs?limit=100&date_from=${today}&date_to=${today}`)
    ]);

    cdr_rows = logs?.data || [];
    cdr_total = logs?.total || 0;

    const rangeOptions = [...new Set(cdr_rows.map(r => r.range).filter(Boolean))];

    document.getElementById('main-content').innerHTML = `
      <p class="page-intro">Here you can view all the SMS stats from test numbers.</p>

      <!-- Stats Cards -->
      <div class="counters" style="margin-bottom:16px;">
        <div class="ctr ctr-blue">
          <div class="ctr-icon"><i class="fas fa-comment-sms"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Total SMS</div>
            <div class="ctr-val">${stats?.total || 0}</div>
          </div>
        </div>
        <div class="ctr ctr-green">
          <div class="ctr-icon"><i class="fas fa-circle-check"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Delivered</div>
            <div class="ctr-val">${stats?.delivered || 0}</div>
          </div>
        </div>
        <div class="ctr ctr-red">
          <div class="ctr-icon"><i class="fas fa-circle-xmark"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Failed</div>
            <div class="ctr-val">${stats?.failed || 0}</div>
          </div>
        </div>
        <div class="ctr ctr-yellow">
          <div class="ctr-icon"><i class="fas fa-clock"></i></div>
          <div class="ctr-body">
            <div class="ctr-label">Pending</div>
            <div class="ctr-val">${stats?.pending || 0}</div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="cdr-panel">
        <div class="cdr-row">
          <input type="date" id="c-from" value="${today}">
          <input type="date" id="c-to" value="${today}">
          <select id="c-range">
            <option value="">All Ranges</option>
            ${rangeOptions.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <input type="text" id="c-num" placeholder="Search Number">
          <input type="text" id="c-cli" placeholder="Search CLI">
        </div>
        <div class="cdr-row">
          <span class="grp-label">Group By</span>
          ${['Date', 'Month', 'Range', 'Number', 'CLI'].map(g => `
            <label class="cdr-chk"><input type="checkbox" id="g-${g.toLowerCase()}"> ${g}</label>
          `).join('')}
          <div style="margin-left:auto;display:flex;gap:6px;">
            <button class="btn-orange" onclick="cdrExport()"><i class="fas fa-download"></i> Export Report</button>
            <button class="btn-blue" onclick="applyCdr()"><i class="fas fa-chart-bar"></i> Show Report</button>
            <button class="btn-outline-sm" onclick="resetCdrFilters()"><i class="fas fa-undo"></i> Reset</button>
          </div>
        </div>
      </div>

      <div class="section-title"><i class="fas fa-chart-bar"></i> SMS CDR REPORTS &amp; STATS</div>

      <div class="dt-toolbar">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <div class="dt-search-wrap">
            <label>Search:</label>
            <input id="cdr-q" placeholder="🔍" onkeyup="cdrSearch(this.value)">
          </div>
          <div class="dt-export">
            <button onclick="cdrCopy()">Copy</button>
            <button onclick="cdrExport()">CSV</button>
            <button onclick="cdrExport()">Excel</button>
            <button onclick="toast('PDF…', 'info')">PDF</button>
            <button onclick="window.print()">Print</button>
          </div>
        </div>
        <div class="dt-right">
          <div class="dt-per-wrap">
            Show Records:
            <select id="cdr-pp" onchange="cdr_pp=+this.value;cdr_pg=1;renderCdr()">
              <option value="25" ${cdr_pp === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${cdr_pp === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${cdr_pp === 100 ? 'selected' : ''}>100</option>
            </select>
          </div>
          <button class="show-hide-btn" onclick="openCdrColsModal()">Show / hide columns</button>
        </div>
      </div>
      <div id="cdr-wrap"></div>
    `;

    cdr_pg = 1;
    renderCdr();

  } catch (err) {
    console.error('CDR stats error:', err);
    toast('Failed to load CDR stats', 'error');
  }
}

let cdr_hidden_cols = {};

function getCdrColumns() {
  const activeGroups = ['date', 'month', 'range', 'number', 'cli'].filter(g => document.getElementById(`g-${g}`)?.checked);
  if (activeGroups.length > 0) {
    const keyLabels = { date: 'Date', month: 'Month', range: 'Range', number: 'Number', cli: 'CLI' };
    return activeGroups.map(k => ({ key: k, label: keyLabels[k] || k })).concat({ key: 'sms_count', label: 'SMS Count' });
  }
  return [
    { key: 'date', label: 'Date' },
    { key: 'range', label: 'Range' },
    { key: 'number', label: 'Number' },
    { key: 'cli', label: 'CLI' },
    { key: 'sms', label: 'SMS' },
    { key: 'status', label: 'Status' }
  ];
}

function openCdrColsModal() {
  const cols = getCdrColumns();
  const checkboxes = cols.map((col) => {
    const isVisible = !cdr_hidden_cols[col.key];
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;user-select:none;font-size:14px;color:#1e293b;">
        <input type="checkbox" id="cdr-col-${col.key}" ${isVisible ? 'checked' : ''} onchange="toggleCdrCol('${col.key}', this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:#0f172a;">
        <span style="font-weight:600;">${col.label}</span>
      </label>
    `;
  }).join('');

  const modalHtml = `
    <div class="modal-overlay active show" id="cdr-cols-modal" style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:9999;" onclick="if(event.target===this) this.remove()">
      <div class="modal-box" style="background:#fff;border-radius:8px;width:min(520px,94vw);max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">Show / hide columns</h3>
          <button onclick="document.getElementById('cdr-cols-modal')?.remove()" style="background:none;border:none;font-size:22px;line-height:1;color:#64748b;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:20px;overflow-y:auto;">
          <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:#64748b;">Select columns to display:</span>
            <div style="display:flex;gap:6px;">
              <button type="button" onclick="setCdrAllCols(true)" style="padding:4px 10px;font-size:12px;font-weight:600;background:#fff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;color:#334155;">Show All</button>
              <button type="button" onclick="setCdrAllCols(false)" style="padding:4px 10px;font-size:12px;font-weight:600;background:#fff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;color:#334155;">Reset</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:8px;">
            ${checkboxes}
          </div>
        </div>
        <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;">
          <button onclick="document.getElementById('cdr-cols-modal')?.remove()" style="padding:8px 20px;background:#0f172a;color:#fff;border:none;border-radius:4px;font-weight:600;cursor:pointer;">Done</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cdr-cols-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function toggleCdrCol(key, isVisible) {
  if (isVisible) {
    delete cdr_hidden_cols[key];
  } else {
    const cols = getCdrColumns();
    const visibleCount = cols.filter(c => !cdr_hidden_cols[c.key]).length;
    if (visibleCount <= 1) {
      if (typeof toast === 'function') toast('At least one column must remain visible', 'warning');
      const cb = document.getElementById(`cdr-col-${key}`);
      if (cb) cb.checked = true;
      return;
    }
    cdr_hidden_cols[key] = true;
  }
  renderCdr();
}

function setCdrAllCols(visible) {
  cdr_hidden_cols = {};
  const cols = getCdrColumns();
  cols.forEach(col => {
    const cb = document.getElementById(`cdr-col-${col.key}`);
    if (cb) cb.checked = true;
  });
  renderCdr();
}

function resetCdrFilters() {
  const from = document.getElementById('c-from');
  const to = document.getElementById('c-to');
  const range = document.getElementById('c-range');
  const num = document.getElementById('c-num');
  const cli = document.getElementById('c-cli');
  const search = document.getElementById('cdr-q');

  if (from) from.value = new Date().toISOString().split('T')[0];
  if (to) to.value = new Date().toISOString().split('T')[0];
  if (range) range.value = '';
  if (num) num.value = '';
  if (cli) cli.value = '';
  if (search) search.value = '';

  document.querySelectorAll('.cdr-chk input').forEach(cb => cb.checked = false);
  cdr_pg = 1;
  applyCdr();
  toast('Filters reset', 'info');
}

async function applyCdr() {
  const df = document.getElementById('c-from')?.value || '';
  const dt = document.getElementById('c-to')?.value || '';
  const rf = document.getElementById('c-range')?.value || '';
  const nf = document.getElementById('c-num')?.value || '';
  const cf = document.getElementById('c-cli')?.value || '';

  const params = new URLSearchParams();
  params.append('limit', 500);
  if (df) params.append('date_from', df);
  if (dt) params.append('date_to', dt);
  if (nf) params.append('search', nf);

  let cdr_grouped_keys = [];
  const activeGroups = ['date', 'month', 'range', 'number', 'cli'].filter(g => document.getElementById(`g-${g}`)?.checked);
  if (activeGroups.length) {
    params.append('group_by', activeGroups.join(','));
  }

  const logs = await api(`/api/sms/test-logs?${params.toString()}`);
  let filtered = logs?.data || [];

  if (logs?.grouped && activeGroups.length) {
    cdr_grouped_keys = activeGroups;
    cdr_rows = filtered;
  } else {
    cdr_grouped_keys = [];
    if (rf) filtered = filtered.filter(r => (r.range_label || r.range || '').includes(rf));
    if (cf) filtered = filtered.filter(r => (r.cli || '').toLowerCase().includes(cf.toLowerCase()));
    cdr_rows = filtered;
  }

  cdr_pg = 1;
  renderCdr();
  toast(`${cdr_rows.length} records found`, 'info');
}

function cdrSearch(q) {
  const ql = q.toLowerCase();
  const filtered = cdr_rows.filter(r =>
    (r.date || '').toLowerCase().includes(ql) ||
    (r.month || '').toLowerCase().includes(ql) ||
    (r.range || '').toLowerCase().includes(ql) ||
    (r.number || '').includes(ql) ||
    (r.cli || '').toLowerCase().includes(ql) ||
    (r.key || '').toLowerCase().includes(ql)
  );
  cdr_rows = filtered;
  cdr_pg = 1;
  renderCdr();
}

function renderCdr() {
  const total = cdr_rows.length;
  const pages = Math.ceil(total / cdr_pp) || 1;
  const start = (cdr_pg - 1) * cdr_pp;
  const page = cdr_rows.slice(start, start + cdr_pp);

  const activeGroups = ['date', 'month', 'range', 'number', 'cli'].filter(g => document.getElementById(`g-${g}`)?.checked);
  const cols = getCdrColumns();
  const visibleCols = cols.filter(c => !cdr_hidden_cols[c.key]);

  let theadHtml = '';
  let tbody = '';

  if (activeGroups.length > 0) {
    theadHtml = `<tr>
      ${visibleCols.map(c => `<th>${c.label} ⇅</th>`).join('')}
    </tr>`;

    tbody = page.length
      ? page.map((r, i) => `<tr class="${i % 2 ? 'alt' : ''}">
          ${visibleCols.map(c => c.key === 'sms_count' ? `<td><b>${r.sms_count || r.count || 0} SMS</b></td>` : `<td>${r[c.key] || '—'}</td>`).join('')}
        </tr>`).join('')
      : `<tr><td colspan="${visibleCols.length}" style="text-align:center;padding:18px;color:var(--text-muted);">No records found</td></tr>`;
  } else {
    theadHtml = `<tr>
      ${visibleCols.map(c => `<th>${c.label} ⇅</th>`).join('')}
    </tr>`;

    const getCellVal = (c, r) => {
      switch(c.key) {
        case 'date': return r.date || r.timestamp || '—';
        case 'range': return r.range || '—';
        case 'number': return r.number || '—';
        case 'cli': return maskCli(r.cli);
        case 'sms': return (r.cli || r.sms || r.message ? '********' : '—');
        case 'status': return statusBadge(r.status || 'delivered');
        default: return r[c.key] || '—';
      }
    };

    tbody = page.length
      ? page.map((r, i) => `<tr class="${i % 2 ? 'alt' : ''}">
          ${visibleCols.map(c => `<td>${getCellVal(c, r)}</td>`).join('')}
        </tr>`).join('')
      : `<tr><td colspan="${visibleCols.length}" style="text-align:center;padding:18px;color:var(--text-muted);">No records found</td></tr>`;
  }

  const pgs = buildPager(cdr_pg, pages, 'cdrGo');
  document.getElementById('cdr-wrap').innerHTML = `
    <table class="dt"><thead>${theadHtml}</thead><tbody>${tbody}</tbody></table>
    <div class="dt-pager">${pgs}</div>
    <div class="dt-info">Showing ${total === 0 ? 0 : start + 1}–${Math.min(start + cdr_pp, total)} of ${total}</div>
  `;
}

function cdrGo(p) {
  const pages = Math.ceil(cdr_rows.length / cdr_pp) || 1;
  cdr_pg = Math.max(1, Math.min(p, pages));
  renderCdr();
}

function cdrCopy() {
  try {
    const cols = getCdrColumns().filter(c => !cdr_hidden_cols[c.key]);
    const getPlainVal = (c, r) => {
      switch(c.key) {
        case 'date': return r.date || r.timestamp || '';
        case 'range': return r.range || '';
        case 'number': return r.number || '';
        case 'cli': return maskCli(r.cli);
        case 'sms': return (r.cli || r.sms || r.message ? '********' : '');
        case 'status': return r.status || 'delivered';
        case 'sms_count': return r.sms_count || r.count || 0;
        default: return r[c.key] || '';
      }
    };
    const header = cols.map(c => c.label).join('\t');
    const text = [header].concat(cdr_rows.map(r => cols.map(c => getPlainVal(c, r)).join('\t'))).join('\n');
    navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
  } catch (err) {
    toast('Failed to copy', 'error');
  }
}

function cdrExport() {
  const cols = getCdrColumns().filter(c => !cdr_hidden_cols[c.key]);
  const getPlainVal = (c, r) => {
    switch(c.key) {
      case 'date': return r.date || r.timestamp || '';
      case 'range': return r.range || '';
      case 'number': return r.number || '';
      case 'cli': return maskCli(r.cli);
      case 'sms': return (r.cli || r.sms || r.message ? '********' : '');
      case 'status': return r.status || 'delivered';
      case 'sms_count': return r.sms_count || r.count || 0;
      default: return r[c.key] || '';
    }
  };
  csvDl(cols.map(c => c.label),
    cdr_rows.map(r => cols.map(c => getPlainVal(c, r))),
    'cdr_report.csv'
  );
  toast('CSV exported', 'success');
}

// ── Auto-logout after 10 minutes of inactivity ──────────────────────
let _idleTimer = null;
const IDLE_LIMIT_MS = 10 * 60 * 1000;
function resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(autoLogoutIdle, IDLE_LIMIT_MS);
}
function autoLogoutIdle() {
  sessionStorage.removeItem('tp_logged_in');
  sessionStorage.removeItem('tp_user');
  sessionStorage.removeItem('admin_logged_in');
  sessionStorage.removeItem('admin_user');
  window.top.location.href = '/login';
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});
resetIdleTimer();

// ── Initialize ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const lastPage = sessionStorage.getItem('tp_current_page') || 'dashboard';
  showPage(lastPage);
});