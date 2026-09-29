/* ═══════════════════════════════════════════════
   Client Panel — JavaScript (Production Ready v1.0)
   ═══════════════════════════════════════════════ */

const API = '';
let CLIENT_ID = null;
let CLIENT_USER = {};

// ── Auth guard ────────────────────────────────────────────────────
(function init() {
  try {
    if (sessionStorage.getItem('admin_logged_in') !== '1') {
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = '/login';
          return;
        }
      } catch (e) {}
      window.location.href = '/login';
      return;
    }
    CLIENT_USER = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
    if (!['Client', 'Reseller'].includes(CLIENT_USER.role)) {
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = '/dashboard';
          return;
        }
      } catch (e) {}
      window.location.href = '/dashboard';
      return;
    }
    CLIENT_ID = CLIENT_USER.id;

    const uEl = document.getElementById('client-username');
    if (uEl) uEl.textContent = CLIENT_USER.username || 'Client';
    const sub = document.getElementById('client-name-sub');
    if (sub) sub.textContent = 'Client Account';
  } catch (err) {
    console.error('Auth init error:', err);
    window.top.location.href = '/login';
  }
})();

// ── API Helpers ──────────────────────────────────────────────────
async function apiFetch(path, opts = {}, retries = 2) {
  try {
    const authHeaders = {};
    try {
      const u = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
      if (u && u.token) authHeaders['Authorization'] = `Bearer ${u.token}`;
    } catch (_) {}

    const response = await fetch(API + path, {
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': CLIENT_ID || '',
        ...authHeaders,
        ...(opts.headers || {})
      },
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
    if (retries > 0 && (err.name === 'TypeError' || String(err.message).toLowerCase().includes('failed to fetch'))) {
      await new Promise(r => setTimeout(r, 350));
      return apiFetch(path, opts, retries - 1);
    }
    console.error(`apiFetch error [${path}]:`, err);
    if (!opts.silent) {
      toast(err.message || 'Network error', 'error');
    }
    return null;
  }
}

// ── Toast System ──────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 4000);
}

// ── Modal System ──────────────────────────────────────────────────
function openModal(title, html) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  if (!overlay || !titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = html;
  overlay.classList.add('show');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
});

// ── UI Helpers ────────────────────────────────────────────────────
function badge(text, color = 'blue') {
  const validColors = ['green', 'red', 'yellow', 'blue', 'purple', 'gray', 'cyan'];
  const c = validColors.includes(color) ? color : 'blue';
  return `<span class="badge badge-${c}">${text}</span>`;
}

function statusBadge(status) {
  const map = {
    active: 'green',
    suspended: 'red',
    inactive: 'gray',
    paid: 'green',
    pending: 'yellow',
    rejected: 'red',
    delivered: 'green',
    failed: 'red'
  };
  return badge(status, map[status] || 'blue');
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
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

function buildTable(headers, rows) {
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  let tbody;
  if (rows && rows.length) {
    tbody = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  } else {
    tbody = `<tr><td colspan="${headers.length}" class="empty-state"><i class="fas fa-inbox"></i><br>No data</td></tr>`;
  }
  return `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function statCard(label, icon, value, color, sub = '', trend = 'up') {
  return `<div class="stat-card stat-card-ims ${color}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-change">${sub}</div>` : ''}
    <div class="stat-icon-corner"><i class="fas fa-arrow-${trend === 'down' ? 'down' : 'up'}"></i></div>
  </div>`;
}

function chartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#656d76', font: { size: 10 }, maxTicksLimit: 8 }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#656d76', font: { size: 10 } }
      }
    }
  };
}

function serviceColor(service) {
  const map = {
    WhatsApp: '#25d366',
    Telegram: '#2aabee',
    Google: '#4285f4',
    Amazon: '#ff9900',
    Facebook: '#1877f2',
    Twitter: '#1da1f2',
    Instagram: '#e1306c'
  };
  return map[service] || '#334155';
}

// ── Pagination ────────────────────────────────────────────────────
function pagination(current, total, perPage, onPage) {
  const pages = Math.ceil(total / perPage) || 1;
  window._pgnCb = onPage;

  const info = `Showing ${Math.min((current - 1) * perPage + 1, total)}–${Math.min(current * perPage, total)} of ${total}`;
  const first = `<button class="pg-text" onclick="window._pgnCb(1)" ${current <= 1 ? 'disabled' : ''}>First</button>`;
  const prev = `<button class="pg-text" onclick="window._pgnCb(${current - 1})" ${current <= 1 ? 'disabled' : ''}>Previous</button>`;
  const next = `<button class="pg-text" onclick="window._pgnCb(${current + 1})" ${current >= pages ? 'disabled' : ''}>Next</button>`;
  const last = `<button class="pg-text" onclick="window._pgnCb(${pages})" ${current >= pages ? 'disabled' : ''}>Last</button>`;

  let nums = '';
  const start = Math.max(1, current - 2);
  const end = Math.min(pages, current + 2);
  for (let p = start; p <= end; p++) {
    nums += `<button class="${p === current ? 'active' : ''}" onclick="window._pgnCb(${p})">${p}</button>`;
  }

  return `<div class="pagination"><span class="pg-info">${info}</span>${first}${prev}${nums}${next}${last}</div>`;
}

// ── Theme ─────────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light');
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.className = document.body.classList.contains('light') ? 'fas fa-moon' : 'fas fa-circle-half-stroke';
  }
  try {
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
  } catch {}
}

(function initTheme() {
  try {
    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light');
      const icon = document.getElementById('theme-icon');
      if (icon) icon.className = 'fas fa-moon';
    }
  } catch {}
})();

// ── Sidebar ───────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.querySelector('.main-wrapper');
  if (!sidebar) return;
  if (window.innerWidth <= 900) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
    if (wrapper) wrapper.classList.toggle('sidebar-collapsed');
  }
}

function toggleGroup(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('closed');
  const header = el.previousElementSibling;
  if (header) {
    const icon = header.querySelector('i');
    if (icon) {
      icon.style.transform = el.classList.contains('closed') ? 'rotate(-90deg)' : '';
    }
  }
}

// ── Logout ────────────────────────────────────────────────────────
function doLogout() {
  try {
    ['admin_logged_in', 'admin_user', 'admin_current_page', 'manager_current_page', 'agent_current_page', 'client_current_page', 'tp_logged_in', 'tp_user', 'tp_current_page'].forEach(k => {
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

// ── Router ────────────────────────────────────────────────────────
let activeWS = [];

function stopWS() {
  activeWS.forEach(ws => {
    try { ws.close(); } catch (e) {}
  });
  activeWS = [];
}

function loadPage(page) {
  stopWS();
  if (window._dbClockInterval) { clearInterval(window._dbClockInterval); window._dbClockInterval = null; }
  sessionStorage.setItem('client_current_page', page);

  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  const label = navEl ? navEl.querySelector('span')?.textContent || page : page;
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = label;

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;

  const pages = {
    'dashboard': pgDashboard,
    'my-numbers': pgMyNumbers,
    'my-sms': pgMySms,
    'my-profile': pgProfile,
    'news': pgClientNews,
    'sms-test-panel': pgSmsTestPanel,
    'my-balance': pgBalance,
    'my-earnings': pgEarnings
  };

  if (pages[page]) {
    pages[page]();
  } else {
    if (content) {
      content.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><p>Page not found</p></div>`;
    }
  }
}

// ═══════════════════════════════════════════════
//  PAGE RENDERERS — Production Quality
// ═══════════════════════════════════════════════

function updateDbClock() {
  const dayEl = document.getElementById('db-day-name');
  const dtEl = document.getElementById('db-datetime');
  if (!dayEl || !dtEl) {
    // Dashboard is no longer showing — stop ticking
    if (window._dbClockInterval) clearInterval(window._dbClockInterval);
    return;
  }
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].split('.')[0];
  dayEl.textContent = dayName;
  dtEl.textContent = `${dateStr} ${timeStr}`;
}

// ── DASHBOARD ─────────────────────────────────────────────────────
async function pgDashboard() {
  try {
    const smsStats = await apiFetch(`/api/sms/client-stats?client_id=${CLIENT_ID}`);

    const todaySms = smsStats?.today || 0;
    const yesterdaySms = smsStats?.yesterday || 0;
    const weekSms = smsStats?.this_week || 0;
    const payoutMonth = smsStats?.payout_this_month || 0;
    const trafficData = smsStats?.weekly_traffic || Array.from({ length: 7 }, () => 0);
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Dashboard</div></div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(76,110,245,0.08);
        border:1px solid rgba(76,110,245,0.2);border-radius:var(--radius-lg);padding:12px 18px;margin-bottom:20px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;color:var(--accent);font-weight:700;font-size:14px;">
          <i class="fas fa-clock"></i> <span id="db-day-name"></span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary);">
          <span id="db-datetime"></span>
          <span class="badge badge-blue" style="font-size:10px;">GMT+0</span>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns:1fr;">
        ${statCard('Today SMS', 'fas fa-comment-sms', todaySms, 'blue', 'Received today')}
        ${statCard('Yesterday SMS', 'fas fa-calendar-days', yesterdaySms, 'red', 'Received yesterday')}
        ${statCard('Last 7 Days', 'fas fa-wave-square', weekSms, 'green', 'Total this week')}
        ${statCard('Payout This Month', 'fas fa-dollar-sign', '$' + payoutMonth.toFixed(2), 'yellow', 'Based on delivery rate')}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Last 7 Days SMS</div></div>
        <div class="chart-container" style="height:250px;">
          <canvas id="client-chart"></canvas>
        </div>
      </div>
    `;

    if (window._dbClockInterval) clearInterval(window._dbClockInterval);
    updateDbClock();
    window._dbClockInterval = setInterval(updateDbClock, 1000);

    try {
      const ctx = document.getElementById('client-chart');
      if (ctx && typeof Chart !== 'undefined') {
        const chartData = trafficData.length === 7 ? trafficData : Array.from({ length: 7 }, () => 0);
        const maxVal = Math.max(...chartData, 1);

        new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              data: chartData,
              label: 'SMS',
              borderColor: '#334155',
              backgroundColor: 'rgba(51,65,85,0.08)',
              fill: true,
              tension: 0.4,
              pointRadius: 5,
              pointBackgroundColor: '#334155',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              borderWidth: 2.5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                labels: {
                  color: '#8b949e',
                  font: { size: 11 },
                  boxWidth: 12,
                  padding: 16
                }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return 'SMS: ' + context.parsed.y;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                ticks: { color: '#656d76', font: { size: 11 } }
              },
              y: {
                grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                ticks: {
                  color: '#656d76',
                  font: { size: 10 },
                  stepSize: Math.ceil(maxVal / 10) || 1,
                  beginAtZero: true
                }
              }
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
  }
}

// ── MY NUMBERS ────────────────────────────────────────────────────
let clientNumbersPerPage = 25;
async function pgMyNumbers(page = 1) {
  try {
    const rangeFilter = document.getElementById('cl-range-filter')?.value || '';
    const limitParam = clientNumbersPerPage === 'all' ? 100000 : clientNumbersPerPage;
    const params = new URLSearchParams();
    params.append('page', clientNumbersPerPage === 'all' ? 1 : page);
    params.append('limit', limitParam);
    if (rangeFilter) params.append('range', rangeFilter);
    const [data, rangesData, rateCardData, clientInfo, allMyNumbersData] = await Promise.all([
      apiFetch(`/api/client/${CLIENT_ID}/numbers?${params.toString()}`),
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch('/api/numbers/rate-card'),
      apiFetch(`/api/client/${CLIENT_ID}/stats`),
      apiFetch(`/api/client/${CLIENT_ID}/numbers?limit=100000`)
    ]);
    const numbers = data?.data || [];
    const total = data?.total || 0;
    const perPage = clientNumbersPerPage === 'all' ? (total || 1) : clientNumbersPerPage;
    const ranges = rangesData || [];
    const myCountryProviderSet = new Set((allMyNumbersData?.data || []).map(n => `${n.country}|${n.provider}`));
    const myRanges = ranges.filter(r => myCountryProviderSet.has(`${r.country}|${r.provider}`));
    const rateCard = rateCardData || [];
    const clientDailyLimit = clientInfo?.daily_limit ?? 0;
    const rangeLookup = {}; ranges.forEach(r => rangeLookup[`${r.country}|${r.provider}`] = r);
    const rateLookup = {}; rateCard.forEach(r => rateLookup[`${r.country}|${r.provider}`] = r);

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">My Numbers</div>
          <div class="page-subtitle">${total} numbers assigned to you</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="window.open('/api/numbers/download?client_id=${CLIENT_ID}','_blank')">
            <i class="fas fa-download"></i> Download CSV
          </button>
        </div>
      </div>
      <div class="card">
        ${numbers.length === 0 ? `
          <div class="empty-state" style="padding:60px 20px;">
            <i class="fas fa-mobile-screen" style="font-size:48px;color:var(--text-muted);margin-bottom:16px;display:block;"></i>
            <h3 style="margin-bottom:8px;">No Numbers Assigned</h3>
            <p style="color:var(--text-muted);margin-bottom:16px;">Contact your agent or manager to get numbers assigned to you.</p>
          </div>
        ` : `
          <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="cl-range-filter" onchange="pgMyNumbers(1)" style="min-width:160px;">
              <option value="">Select Range</option>
              ${myRanges.map(r => `<option value="${r.id}" ${rangeFilter == r.id ? 'selected' : ''}>${r.country || ''} ${r.prefix || ''}</option>`).join('')}
            </select>
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="clientNumbersPerPage=this.value==='all'?'all':parseInt(this.value);pgMyNumbers(1)" style="width:80px;">
              <option value="25" ${clientNumbersPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${clientNumbersPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${clientNumbersPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${clientNumbersPerPage === 500 ? 'selected' : ''}>500</option>
              <option value="all" ${clientNumbersPerPage === 'all' ? 'selected' : ''}>All</option>
            </select>
            <span style="font-size:13px;color:var(--text-muted);">entries</span>
            <input id="num-search" placeholder="Search number…" onkeyup="if(event.key==='Enter') searchClientNumbers()">
            <button class="btn btn-outline btn-sm" onclick="searchClientNumbers()"><i class="fas fa-search"></i> Search</button>
            <button class="btn btn-outline btn-sm" onclick="resetClientNumberFilters()"><i class="fas fa-undo"></i> Reset</button>
            <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
              Showing ${Math.min((page - 1) * perPage + 1, total)} to ${Math.min(page * perPage, total)} of ${total} entries
            </span>
          </div>
          ${buildTable(
            ['RANGE', 'PREFIX', 'NUMBER', 'MY PAYTERM', 'MY PAYOUT', 'LIMITS'],
            numbers.map(n => {
              const rInfo = rangeLookup[`${n.country}|${n.provider}`] || null;
              return [
                rInfo?.range_name || `${n.country || ''}-${n.provider || ''}`,
                rInfo?.prefix || '—',
                `<span class="monospace fw-600">${n.number || '—'}</span>`,
                (rInfo?.payout_schedule || n.payment_term) ? (rInfo?.payout_schedule || n.payment_term).charAt(0).toUpperCase() + (rInfo?.payout_schedule || n.payment_term).slice(1) : '—',
                n.client_payout != null ? `$${n.client_payout}` : '$0',
                `SD : ${n.otp_limit ?? clientDailyLimit} | SW : ${n.weekly_limit ?? 0}`
              ];
            })
          )}
          ${clientNumbersPerPage === 'all' ? '' : pagination(page, total, perPage, pgMyNumbers)}
        `}
      </div>
    `;
  } catch (err) {
    console.error('My Numbers error:', err);
    toast('Failed to load numbers', 'error');
  }
}

async function searchClientNumbers() {
  const q = document.getElementById('num-search')?.value || '';
  const rangeFilter = document.getElementById('cl-range-filter')?.value || '';
  try {
    const params = new URLSearchParams();
    params.append('search', q);
    params.append('limit', '50');
    if (rangeFilter) params.append('range', rangeFilter);
    const [data, rangesData, rateCardData] = await Promise.all([
      apiFetch(`/api/client/${CLIENT_ID}/numbers?${params.toString()}`),
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch('/api/numbers/rate-card')
    ]);
    const ranges = rangesData || [];
    const rateCard = rateCardData || [];
    const rangeLookup = {}; ranges.forEach(r => rangeLookup[`${r.country}|${r.provider}`] = r);
    const rateLookup = {}; rateCard.forEach(r => rateLookup[`${r.country}|${r.provider}`] = r);
    const wrap = document.querySelector('.table-wrap');
    if (wrap) {
      wrap.outerHTML = buildTable(
        ['RANGE', 'PREFIX', 'NUMBER', 'PAYOUT', 'APP', 'SMS COUNT', 'STATUS', 'LAST SMS'],
        (data?.data || []).map(n => {
          const rInfo = rangeLookup[`${n.country}|${n.provider}`] || null;
          const rateInfo = rateLookup[`${n.country}|${n.provider}`] || null;
          return [
            rInfo?.range_name || `${n.country || ''}-${n.provider || ''}`,
            rInfo?.prefix || '—',
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            rateInfo ? `$${rateInfo.sell_rate}` : '—',
            `<span style="color:${serviceColor(n.app)};font-weight:600">${n.app || '—'}</span>`,
            n.sms_count || 0,
            statusBadge(n.status),
            fmtShort(n.last_sms)
          ];
        })
      );
      toast(`Found ${data?.data?.length || 0} results`, 'info');
    }
  } catch (err) {
    console.error('Search error:', err);
    toast('Search failed', 'error');
  }
}

function resetClientNumberFilters() {
  const searchInput = document.getElementById('num-search');
  const rangeSelect = document.getElementById('cl-range-filter');
  if (searchInput) searchInput.value = '';
  if (rangeSelect) rangeSelect.value = '';
  pgMyNumbers(1);
  toast('Filters reset', 'info');
}

// ── MY SMS ────────────────────────────────────────────────────────
let clientSmsPerPage = 25;
async function pgMySms(page = 1) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateFrom = document.getElementById('csms-from')?.value || todayStr;
    const dateTo = document.getElementById('csms-to')?.value || todayStr;
    const rangeFilter = document.getElementById('csms-range')?.value || '';
    const numSearch = document.getElementById('csms-num')?.value || '';
    const cliSearch = document.getElementById('csms-cli')?.value || '';

    const limitParam = clientSmsPerPage === 'all' ? 100000 : clientSmsPerPage;
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('page', clientSmsPerPage === 'all' ? 1 : page);
    params.append('limit', limitParam);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    if (rangeFilter) params.append('range', rangeFilter);
    if (numSearch) params.append('search', numSearch);
    if (cliSearch) params.append('cli', cliSearch);

    const [data, rangesData] = await Promise.all([
      apiFetch(`/api/sms/client-logs?${params.toString()}`),
      apiFetch('/api/numbers/sms-ranges')
    ]);
    const logs = data?.data || [];
    const total = data?.total || 0;
    const perPage = clientSmsPerPage === 'all' ? (total || 1) : clientSmsPerPage;
    const stats = data?.stats || {};
    const rangesList = rangesData || [];

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">SMS CDR Stats</div>
          <div class="page-subtitle">Home &gt; SMS CDR Stats</div>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns:1fr;margin-bottom:20px;">
        ${statCard('Total SMS', 'fas fa-comment-sms', stats.total_sms || 0, 'blue', 'All time')}
        ${statCard('Delivered', 'fas fa-circle-check', stats.delivered || 0, 'green', 'Successful')}
        ${statCard('Failed', 'fas fa-circle-xmark', stats.failed || 0, 'red', 'Failed')}
        ${statCard('Cost', 'fas fa-dollar-sign', '$' + (stats.total_cost || 0).toFixed(4), 'yellow', 'Total cost')}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="date" id="csms-from" value="${dateFrom}">
          <input type="date" id="csms-to" value="${dateTo}">
          <select id="csms-range" style="min-width:140px;">
            <option value="">Filter Range</option>
            ${rangesList.map(r => `<option value="${r.id}" ${rangeFilter == r.id ? 'selected' : ''}>${r.country || ''} ${r.prefix || ''}</option>`).join('')}
          </select>
          <input id="csms-num" placeholder="Search Number or Message" value="${numSearch}">
          <input id="csms-cli" placeholder="Search CLI" value="${cliSearch}">
          <button class="btn btn-primary btn-sm" onclick="pgMySms(1)"><i class="fas fa-chart-bar"></i> Show Report</button>
          <button class="btn btn-outline btn-sm" onclick="resetClientSmsFilters()"><i class="fas fa-undo"></i> Reset</button>
        </div>
      </div>

      <div class="card">
        <div class="dt-toolbar" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="clientSmsPerPage=this.value==='all'?'all':parseInt(this.value);pgMySms(1)" style="width:80px;">
              <option value="25" ${clientSmsPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${clientSmsPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${clientSmsPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="all" ${clientSmsPerPage === 'all' ? 'selected' : ''}>All</option>
            </select>
            <span style="font-size:13px;color:var(--text-muted);">entries</span>
          </div>
          <span style="font-size:13px;color:var(--text-muted);">
            Showing ${total === 0 ? 0 : Math.min((page - 1) * perPage + 1, total)} to ${Math.min(page * perPage, total)} of ${total} entries
          </span>
        </div>
        ${(() => {
          const rgLookup = {}; rangesList.forEach(r => rgLookup[`${r.country}|${r.provider}`] = r);
          return buildTable(
          ['DATE', 'RANGE', 'NUMBER', 'CLI', 'SMS', 'CURRENCY', 'PAYOUT'],
          logs.map(s => [
            fmtShort(s.timestamp),
            rgLookup[`${s.country}|${s.provider}`]?.range_name || `${s.country || ''}-${s.provider || ''}`,
            `<span class="monospace">${s.number || '—'}</span>`,
            s.cli || '—',
            `<span class="text-muted">${s.message || '—'}</span>`,
            'USD',
            `<span class="text-success">$${s.profit || s.cost || 0}</span>`
          ])
        );
        })()}
        ${clientSmsPerPage === 'all' ? '' : pagination(page, total, perPage, pgMySms)}
      </div>
    `;
  } catch (err) {
    console.error('My SMS error:', err);
    toast('Failed to load SMS logs', 'error');
  }
}

function resetClientSmsFilters() {
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('csms-from') && (document.getElementById('csms-from').value = todayStr);
  document.getElementById('csms-to') && (document.getElementById('csms-to').value = todayStr);
  ['csms-range', 'csms-num', 'csms-cli'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  pgMySms(1);
  toast('Filters reset', 'info');
}

// ── BALANCE ──────────────────────────────────────────────────────
async function pgBalance() {
  try {
    const stats = await apiFetch(`/api/client/${CLIENT_ID}/stats`);
    const transactions = await apiFetch(`/api/client/${CLIENT_ID}/transactions?limit=20`);

    const balance = stats?.balance || 0;
    const totalSms = stats?.total_sms || 0;
    const dailyLimit = stats?.daily_limit || 0;
    const monthlyLimit = stats?.monthly_limit || 0;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">My Balance</div>
          <div class="page-subtitle">Your account balance and transactions</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgBalance()">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns:1fr;margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
          <div>
            <div class="stat-label">Current Balance</div>
            <div class="stat-value">$${balance.toFixed(2)}</div>
            <div class="stat-change up">Available</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue"><i class="fas fa-comment-sms"></i></div>
          <div>
            <div class="stat-label">Total SMS</div>
            <div class="stat-value">${totalSms}</div>
            <div class="stat-change up">All time</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Transaction History</div></div>
        ${(transactions?.data || []).length === 0 ? `
          <div class="empty-state" style="padding:40px;">
            <i class="fas fa-receipt" style="font-size:32px;color:var(--text-muted);margin-bottom:12px;display:block;"></i>
            <p style="color:var(--text-muted);">No transactions found.</p>
          </div>
        ` : buildTable(
          ['#', 'Type', 'Amount', 'Description', 'Date', 'Status'],
          (transactions.data || []).map(t => [
            t.id || '—',
            t.type === 'credit' ? `<span class="badge badge-green">Credit</span>` : `<span class="badge badge-red">Debit</span>`,
            `<span class="text-${t.type === 'credit' ? 'success' : 'danger'}">${t.type === 'credit' ? '+' : '-'}$${Math.abs(t.amount || 0).toFixed(2)}</span>`,
            t.description || '—',
            fmtShort(t.timestamp),
            statusBadge(t.status)
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Balance error:', err);
    toast('Failed to load balance', 'error');
  }
}

// ── PROFILE ───────────────────────────────────────────────────────
// ── NEWS ──────────────────────────────────────────────────────────
async function pgClientNews() {
  try {
    const params = new URLSearchParams();
    params.append('role', 'Client');
    if (CLIENT_USER.agent_id) params.append('agent_id', CLIENT_USER.agent_id);
    if (CLIENT_USER.manager_id) params.append('manager_id', CLIENT_USER.manager_id);
    const result = await apiFetch(`/api/announcements?${params.toString()}`);
    const news = result?.data || [];

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">News</div><div class="page-subtitle">Announcements from your Agent, Manager and Owner</div></div>
      </div>
      ${news.length ? news.map(a => `
        <div class="card" style="margin-bottom:14px;border-left:3px solid var(--${a.type === 'warning' ? 'yellow-light' : a.type === 'success' ? 'green-light' : 'accent'});">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              ${badge(a.type || 'info', a.type === 'warning' ? 'yellow' : a.type === 'success' ? 'green' : 'blue')}
              <strong>${a.title || '—'}</strong>
            </div>
            <span class="text-muted fs-12">${fmtShort(a.created)}</span>
          </div>
          <p class="text-secondary">${a.body || ''}</p>
        </div>
      `).join('') : `
        <div class="empty-state" style="padding:40px;">
          <i class="fas fa-inbox" style="font-size:32px;color:var(--text-muted);margin-bottom:12px;display:block;"></i>
          <p style="color:var(--text-muted);">No news yet.</p>
        </div>
      `}
    `;
  } catch (err) {
    console.error('News error:', err);
    toast('Failed to load news', 'error');
  }
}

// ── SMS TEST PANEL ────────────────────────────────────────────────
let clTpPage = 1, clTpPerPage = 25, clRsPage = 1, clRsPerPage = 25;
async function pgSmsTestPanel() {
  try {
    const ranges = await apiFetch('/api/numbers/sms-ranges') || [];
    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS Test Panel</div><div class="page-subtitle">Test numbers uploaded by Owner, and the live SMS test feed received on them.</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">SMS Test Numbers</div></div>
          <div class="filters-bar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select id="cl-tp-range" style="min-width:150px;" onchange="clTpPage=1;loadClTestNumbers()">
              <option value="">Select Range</option>
              ${ranges.map(r => `<option value="${r.id}">${r.country || ''} ${r.prefix || ''}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm" onclick="clTpPage=1;loadClTestNumbers()"><i class="fas fa-filter"></i> Filter</button>
          </div>
          <div class="dt-toolbar" style="margin-top:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Show</span>
              <select onchange="clTpPerPage=this.value==='all'?'all':parseInt(this.value);clTpPage=1;loadClTestNumbers()" style="width:80px;">
                <option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span style="font-size:13px;color:var(--text-muted);">entries</span>
            </div>
          </div>
          <div id="cl-tp-wrap"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Recent SMS Test</div></div>
          <div class="dt-toolbar">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Show</span>
              <select onchange="clRsPerPage=this.value==='all'?'all':parseInt(this.value);clRsPage=1;loadClRecentSms()" style="width:80px;">
                <option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span style="font-size:13px;color:var(--text-muted);">entries</span>
            </div>
          </div>
          <div id="cl-rs-wrap"></div>
        </div>
      </div>
    `;
    loadClTestNumbers();
    loadClRecentSms();
  } catch (err) {
    console.error('SMS Test Panel error:', err);
    toast('Failed to load test panel', 'error');
  }
}

async function loadClTestNumbers() {
  const wrap = document.getElementById('cl-tp-wrap');
  if (!wrap) return;
  const rangeFilter = document.getElementById('cl-tp-range')?.value || '';
  const limitParam = clTpPerPage === 'all' ? 100000 : clTpPerPage;
  const params = new URLSearchParams();
  params.append('page', clTpPerPage === 'all' ? 1 : clTpPage);
  params.append('limit', limitParam);
  if (rangeFilter) params.append('range', rangeFilter);
  const data = await apiFetch(`/api/sms/test-numbers?${params.toString()}`);
  const rows = data?.data || [];
  const total = data?.total || 0;
  const perPage = clTpPerPage === 'all' ? (total || 1) : clTpPerPage;

  wrap.innerHTML = buildTable(
    ['Range', 'Test Number'],
    rows.map(n => [
      n.range_label || '—',
      `<span class="monospace fw-600">${n.number || '—'}</span>`
    ])
  ) + `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((clTpPage-1)*perPage+1,total)}–${Math.min(clTpPage*perPage,total)} of ${total}</span>
      ${clTpPerPage === 'all' ? '' : pagination(clTpPage, total, perPage, (p) => { clTpPage = p; loadClTestNumbers(); })}
    </div>
  `;
}

async function loadClRecentSms() {
  const wrap = document.getElementById('cl-rs-wrap');
  if (!wrap) return;
  const limitParam = clRsPerPage === 'all' ? 100000 : clRsPerPage;
  const params = new URLSearchParams();
  params.append('page', clRsPerPage === 'all' ? 1 : clRsPage);
  params.append('limit', limitParam);
  const data = await apiFetch(`/api/sms/test-logs?${params.toString()}`);
  const rows = data?.data || [];
  const total = data?.total || 0;
  const perPage = clRsPerPage === 'all' ? (total || 1) : clRsPerPage;

  wrap.innerHTML = buildTable(
    ['Date', 'Range', 'Number', 'CLI', 'SMS'],
    rows.map(s => [
      fmtShort(s.timestamp),
      s.range_label || '—',
      `<span class="monospace">${s.number || '—'}</span>`,
      s.cli ? (s.cli.charAt(0).toUpperCase() + 'XXXXX') : '—',
      '********'
    ])
  ) + `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((clRsPage-1)*perPage+1,total)}–${Math.min(clRsPage*perPage,total)} of ${total}</span>
      ${clRsPerPage === 'all' ? '' : pagination(clRsPage, total, perPage, (p) => { clRsPage = p; loadClRecentSms(); })}
    </div>
  `;
}

function pgProfile() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">My Profile</div>
        <div class="page-subtitle">Manage your account settings</div>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <div style="text-align:center;padding:20px 0;">
          <div style="width:72px;height:72px;background:linear-gradient(135deg,#334155,#1e293b);border-radius:50%;
            margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;">
            <i class="fas fa-user"></i>
          </div>
          <div style="font-size:18px;font-weight:700;">${CLIENT_USER.username || 'Client'}</div>
          <div class="text-muted" style="margin-top:4px;">Client Account</div>
          <div style="margin-top:8px;">${badge('Client', 'green')}</div>
        </div>
        <div class="separator"></div>
        <form id="profile-form" onsubmit="updateClientProfile(event)">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input value="${CLIENT_USER.username || ''}" readonly>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="profile-email" value="${CLIENT_USER.email || ''}" type="email">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input id="profile-phone" value="${CLIENT_USER.phone || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input id="profile-name" value="${CLIENT_USER.full_name || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" id="profile-pass" placeholder="Leave blank to keep current" minlength="6">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input type="password" id="profile-pass-confirm" placeholder="Confirm new password">
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="profile-submit-btn">
              <i class="fas fa-save"></i> Update Profile
            </button>
          </div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Account Details</div></div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
          ${[
            ['Role', 'Client', 'green'],
            ['Status', CLIENT_USER.status || 'Active', 'green'],
            ['Agent', `ID #${CLIENT_USER.agent_id || '?'}`, 'cyan'],
            ['Manager', `ID #${CLIENT_USER.manager_id || '?'}`, 'purple'],
            ['Service', CLIENT_USER.service || '—', 'blue'],
            ['Balance', '$' + (CLIENT_USER.balance || 0).toFixed(2), 'yellow']
          ].map(([k, v, c]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">${k}</span>${badge(v, c)}
            </div>
          `).join('')}
        </div>
        <div class="separator"></div>
        <div class="card-header"><div class="card-title">Two-Factor Auth</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
          <div>
            <div class="fw-600">2FA</div>
            <div class="text-muted fs-12">TOTP authenticator</div>
          </div>
          <input type="checkbox" id="2fa-toggle" ${CLIENT_USER.two_fa ? 'checked' : ''} onchange="toast('2FA setting updated', 'info')">
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="toast('2FA setup initiated', 'info')">
          <i class="fas fa-qrcode"></i> Setup 2FA
        </button>
      </div>
    </div>
  `;
}

async function updateClientProfile(event) {
  event.preventDefault();

  try {
    const password = document.getElementById('profile-pass').value;
    const confirm = document.getElementById('profile-pass-confirm').value;

    if (password && password !== confirm) {
      toast('Passwords do not match', 'error');
      return;
    }

    if (password && password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }

    const btn = document.getElementById('profile-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Updating...';
    }

    const payload = {
      email: document.getElementById('profile-email').value || '',
      phone: document.getElementById('profile-phone').value || '',
      full_name: document.getElementById('profile-name').value || ''
    };

    if (password) payload.password = password;

    const result = await apiFetch(`/api/clients/${CLIENT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (result && result.id) {
      toast('Profile updated successfully', 'success');
      document.getElementById('profile-pass').value = '';
      document.getElementById('profile-pass-confirm').value = '';
      // Update session
      CLIENT_USER = { ...CLIENT_USER, ...payload };
      sessionStorage.setItem('admin_user', JSON.stringify(CLIENT_USER));
    } else {
      toast('Failed to update profile', 'error');
    }
  } catch (err) {
    console.error('Update profile error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('profile-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Update Profile';
    }
  }
}

// ── EARNINGS ──────────────────────────────────────────────────────
async function pgEarnings() {
  try {
    const stats = await apiFetch(`/api/client/${CLIENT_ID}/stats`);
    const earnings = await apiFetch(`/api/client/${CLIENT_ID}/earnings`);

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">My Earnings</div>
          <div class="page-subtitle">Your earnings and usage overview</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgEarnings()">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
      </div>
      <div class="stats-grid" style="grid-template-columns:1fr;">
        ${statCard('Total SMS', 'fas fa-comment-sms', stats?.total_sms || 0, 'blue', 'All time')}
        ${statCard('Total Cost', 'fas fa-dollar-sign', '$' + (earnings?.total_cost || 0).toFixed(2), 'red', 'Total spent')}
        ${statCard('Average Cost', 'fas fa-chart-line', '$' + (earnings?.avg_cost || 0).toFixed(4), 'yellow', 'Per SMS')}
        ${statCard('Total Savings', 'fas fa-coins', '$' + (earnings?.savings || 0).toFixed(2), 'green', 'Estimated')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Monthly Usage</div></div>
        ${(earnings?.monthly_data || []).length === 0 ? `
          <div class="empty-state" style="padding:20px;">
            <p style="color:var(--text-muted);">No usage data available.</p>
          </div>
        ` : buildTable(['Month', 'SMS Count', 'Cost', 'Average Cost'],
          (earnings.monthly_data || []).map(m => [
            m.month || '—',
            m.sms_count || 0,
            '$' + (m.cost || 0).toFixed(2),
            '$' + (m.avg_cost || 0).toFixed(4)
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Earnings error:', err);
    toast('Failed to load earnings', 'error');
  }
}

// ── Auto-logout after 10 minutes of inactivity ──────────────────────
let _idleTimer = null;
const IDLE_LIMIT_MS = 10 * 60 * 1000;
function resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(autoLogoutIdle, IDLE_LIMIT_MS);
}
function autoLogoutIdle() {
  sessionStorage.removeItem('admin_logged_in');
  sessionStorage.removeItem('admin_user');
  sessionStorage.removeItem('client_current_page');
  window.top.location.href = '/login';
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});
resetIdleTimer();

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const lastPage = sessionStorage.getItem('client_current_page') || 'dashboard';
  loadPage(lastPage);
});