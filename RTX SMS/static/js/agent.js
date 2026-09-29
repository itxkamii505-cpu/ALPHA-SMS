/* ═══════════════════════════════════════════════
   Agent Panel — JavaScript (Production Ready v4.0)
   ═══════════════════════════════════════════════ */

const API = '';
let AGENT_ID = null;
let AGENT_USER = {};

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
    AGENT_USER = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
    if (!['Agent', 'Admin', 'Owner', 'Manager'].includes(AGENT_USER.role)) {
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = '/dashboard';
          return;
        }
      } catch (e) {}
      window.location.href = '/dashboard';
      return;
    }
    AGENT_ID = AGENT_USER.id;

    const uEl = document.getElementById('agent-username');
    if (uEl) uEl.textContent = AGENT_USER.username || 'Agent';
    const sub = document.getElementById('agent-name-sub');
    if (sub) sub.textContent = 'Agent Account';
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
        'X-Agent-ID': AGENT_ID || '',
        ...authHeaders,
        ...(opts.headers || {})
      },
      ...opts
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let detail = errorText;
      try { detail = JSON.parse(errorText).detail || errorText; } catch (e) {}
      throw new Error(detail);
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

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
});

// ── UI Helpers ────────────────────────────────────────────────────
function buildAnnouncementsUrl(role, agentId, managerId) {
  const params = new URLSearchParams();
  params.append('role', role);
  if (agentId) params.append('agent_id', agentId);
  if (managerId) params.append('manager_id', managerId);
  return `/api/announcements?${params.toString()}`;
}

function badge(text, color = 'blue') {
  const validColors = ['green', 'red', 'yellow', 'blue', 'purple', 'gray'];
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
    failed: 'red',
    assigned: 'blue',
    blocked: 'red'
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

// ── Shared "Number Panel" style table (Range/Prefix/Number/My Payout/Client/Payout/Limits) ──
let _npSort = { col: null, dir: 'asc' };
function sortNumbersPanel(col, rerenderFn) {
  if (_npSort.col === col) { _npSort.dir = _npSort.dir === 'asc' ? 'desc' : 'asc'; }
  else { _npSort = { col, dir: 'asc' }; }
  rerenderFn();
}
function buildSortableNumbersTable(numbersData, rangeInfoFor, rateInfoFor, opts = {}) {
  const rerender = opts.rerender || 'pgMySmsNumbers(smsNumbersPage)';
  const cols = [
    { key: 'range', label: 'RANGE' },
    { key: 'prefix', label: 'PREFIX' },
    { key: 'number', label: 'NUMBER' },
    { key: 'my_payout', label: 'MY PAYOUT' },
    { key: 'client', label: 'CLIENT' },
    { key: 'payout', label: 'PAYOUT' },
    { key: 'limits', label: 'LIMITS' }
  ];

  let rows = numbersData.map(n => {
    const rInfo = rangeInfoFor(n);
    const rateInfo = rateInfoFor(n);
    // The Range's own payout (Admin-set, authoritative) is always the real
    // rate — rate_card is only a fallback for numbers whose range was
    // removed/renamed. This must match resolve_payout() on the backend or
    // "MY PAYOUT" can show $0 while the Range clearly has a real rate.
    const resolvedRate = (rInfo && rInfo.payout != null) ? rInfo.payout
                        : (rateInfo && rateInfo.sell_rate != null) ? rateInfo.sell_rate
                        : (n.agent_payout != null ? n.agent_payout : (n.client_payout != null ? n.client_payout : null));
    return {
      n,
      range: rInfo?.range_name || `${n.country || ''}-${n.provider || ''}`,
      prefix: rInfo?.prefix || '—',
      number: n.number || '',
      my_payout: resolvedRate,
      range_term: rInfo?.payout_schedule || null,
      client: n.client_name || n.client_username || '',
      payout: resolvedRate,
      limits_sd: n.client_daily_limit ?? 0
    };
  });

  if (_npSort.col) {
    rows.sort((a, b) => {
      let av = a[_npSort.col], bv = b[_npSort.col];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (av < bv) return _npSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return _npSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Build via buildTable-compatible header array so checkbox stays its own <th>
  const headers = [
    `<input type="checkbox" id="sms-select-all" onchange="toggleAllSmsNumberChecks(this)">`,
    ...cols.map(c => `<span class="sortable ${_npSort.col === c.key ? 'sort-' + _npSort.dir : ''}" onclick="sortNumbersPanel('${c.key}', () => ${rerender})">${c.label}<span class="sort-arrow"></span></span>`)
  ];

  const bodyRows = rows.map(r => {
    const n = r.n;
    return [
      `<input type="checkbox" class="sms-num-check" value="${n.id}" data-assigned="${n.client_id ? '1' : '0'}" onchange="updateSmsSelectedCount()">`,
      r.range,
      r.prefix,
      `<span class="monospace fw-600">${r.number || '—'}</span>`,
      r.my_payout != null ? `${(r.range_term || n.payment_term) ? (r.range_term || n.payment_term).charAt(0).toUpperCase()+(r.range_term || n.payment_term).slice(1) : 'Not set'}<br><span class="text-success fw-600">$${r.my_payout}</span>` : '—',
      n.client_id
        ? `${r.client} <button class="btn-icon" onclick="openAssignNumberModal(${n.id}, '${n.number || ''}')" title="Reassign"><i class="fas fa-pen"></i></button>`
        : `<button class="btn-icon" onclick="openAssignNumberModal(${n.id}, '${n.number || ''}')" title="Assign to client"><i class="fas fa-pen"></i></button>`,
      r.payout != null ? `$${r.payout}` : '—',
      `SD : ${r.limits_sd} | SW : 0`
    ];
  });

  return buildTable(headers, bodyRows);
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

function paginationWithNumbers(current, total, onPage) {
  window._pgnCb = onPage;
  
  const first = `<button class="pg-text" onclick="window._pgnCb(1)" ${current <= 1 ? 'disabled' : ''}>First</button>`;
  const prev = `<button class="pg-text" onclick="window._pgnCb(${current - 1})" ${current <= 1 ? 'disabled' : ''}>Previous</button>`;
  const next = `<button class="pg-text" onclick="window._pgnCb(${current + 1})" ${current >= total ? 'disabled' : ''}>Next</button>`;
  const last = `<button class="pg-text" onclick="window._pgnCb(${total})" ${current >= total ? 'disabled' : ''}>Last</button>`;
  
  let nums = '';
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  for (let p = start; p <= end; p++) {
    nums += `<button class="${p === current ? 'active' : ''}" onclick="window._pgnCb(${p})">${p}</button>`;
  }
  
  return `<div class="pagination" style="margin:0;border:none;padding:0;">${first}${prev}${nums}${next}${last}</div>`;
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

// Restore theme
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
  sessionStorage.setItem('agent_current_page', page);
  
  // Update nav
  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
  
  // Update breadcrumb
  const label = navEl ? navEl.querySelector('span')?.textContent || page : page;
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = label;
  
  // Show loading state
  const content = document.getElementById('page-content');
  if (content) {
    content.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
  }
  
  // Page router
  const pages = {
    'dashboard': pgDashboard,
    'sms-ranges': pgSmsRanges,
    'my-sms-numbers': pgMySmsNumbers,
    'sms-ratecard': pgSmsRateCard,
    'sms-test-panel': pgSmsTestPanel,
    'my-clients': pgMyClients,
    'detailed-sms': pgDetailedSms,
    'summary-sms': pgSummarySms,
    'client-sms-stats': pgClientSmsStats,
    'sms-range-stats': pgSmsRangeStats,
    'sms-number-stats': pgSmsNumberStats,
    'credit-notes': pgCreditNotes,
    'payment-requests': pgPaymentRequests,
    'bank-accounts': pgBankAccounts,
    'eur-statements': () => pgStatements('EUR', '€'),
    'gbp-statements': () => pgStatements('GBP', '£'),
    'usd-statements': () => pgStatements('USD', '$'),
    'news-clients': pgNewsClients,
    'profile': pgProfile,
    'my-earnings': pgMyEarnings
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

// ── DASHBOARD ─────────────────────────────────────────────────────
async function pgDashboard() {
  try {
    // ── Fetch all data in parallel ──
    const [clients, numbers, dailyStats, announcements] = await Promise.all([
      apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`),
      apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`),
      apiFetch(`/api/sms/daily-stats?agent_id=${AGENT_ID}`),
      apiFetch(buildAnnouncementsUrl('Agent', AGENT_ID, AGENT_USER.manager_id))
    ]);

    // ── Client Stats ──
    const totalClients = clients?.total || 0;
    const activeClients = (clients?.data || []).filter(c => c.status === 'active').length;
    const totalBalance = (clients?.data || []).reduce((s, c) => s + (c.balance || 0), 0);
    const totalSms = dailyStats?.all_time || 0;
    const numbersTotal = numbers?.total || 0;
    const commissionRate = AGENT_USER.commission_rate || 5;

    // ── SMS Daily Stats (Real-time) ──
    const todaySms = dailyStats?.today || 0;
    const yesterdaySms = dailyStats?.yesterday || 0;
    const thisWeekSms = dailyStats?.this_week || 0;
    const thisMonthSms = dailyStats?.this_month || 0;

    // ── Traffic data for chart ──
    const trafficData = dailyStats?.weekly_traffic || Array.from({ length: 7 }, () => 0);
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIndex = new Date().getDay();
    const labels = weekDays.slice(todayIndex).concat(weekDays.slice(0, todayIndex));

    // ── News & Notifications ──
    const news = announcements?.data || [];
    const unreadNews = news.filter(n => !n.read).length;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard Overview</div>
          <div class="page-subtitle">Welcome back, ${AGENT_USER.username || 'Agent'}</div>
        </div>
        <div class="page-actions">
          <span class="text-muted fs-12" style="margin-right:8px;">
            <i class="fas fa-clock"></i> Updated just now
          </span>
          <button class="btn btn-outline btn-sm" onclick="pgDashboard()">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Date Display -->
      <div style="margin-bottom:20px;font-size:14px;color:var(--text-muted);">
        <i class="fas fa-calendar-day"></i> ${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </div>

      <!-- SMS Stats Grid - 4 Cards (Top Row) -->
      <div class="stats-grid" style="grid-template-columns:1fr;margin-bottom:24px;">
        ${statCard('TODAY\'S SMS', 'fas fa-calendar-day', todaySms, 'green', 'Today')}
        ${statCard('YESTERDAY', 'fas fa-calendar-day', yesterdaySms, 'yellow', 'Yesterday')}
        ${statCard('SMS THIS WEEK', 'fas fa-calendar-week', thisWeekSms, 'blue', 'This week')}
        ${statCard('THIS MONTH', 'fas fa-calendar-alt', thisMonthSms, 'purple', 'This month')}
      </div>

      <!-- Chart Section (Middle) -->
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header">
          <div>
            <div class="card-title">SMS Volume — Last 7 Days</div>
            <div class="card-subtitle">Your SMS traffic from the past week</div>
          </div>
          <span class="badge badge-blue">Total: ${trafficData.reduce((a,b) => a + b, 0)}</span>
        </div>
        <div class="chart-container" style="height:280px;">
          <canvas id="agt-chart"></canvas>
        </div>
      </div>

      <!-- Two Column: News + Quick Actions/My Account (Bottom) -->
      <div class="two-col">
        <!-- Left: News & Notifications -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <i class="fas fa-newspaper" style="color:var(--accent);"></i> News & Notifications
            </div>
            ${unreadNews > 0 ? `
              <button class="btn btn-outline btn-sm" onclick="markAllRead()">
                <i class="fas fa-check-double"></i> Mark all read
              </button>
            ` : ''}
          </div>
          <div style="max-height:350px;overflow-y:auto;">
            ${news.length > 0 ? news.map((a, index) => `
              <div style="padding:12px 0;border-bottom:1px solid var(--border);${!a.read ? 'border-left:3px solid var(--accent);padding-left:12px;' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <strong style="font-size:14px;">${a.title || '—'}</strong>
                  <span class="text-muted fs-12">${fmtShort(a.created)}</span>
                </div>
                <p class="text-secondary" style="font-size:13px;margin-top:4px;">${a.body || ''}</p>
                ${!a.read ? `<span class="badge badge-blue" style="font-size:9px;">New</span>` : ''}
              </div>
            `).join('') : `
              <div class="empty-state" style="padding:30px;">
                <i class="fas fa-inbox" style="font-size:30px;color:var(--text-muted);"></i>
                <p style="margin-top:8px;color:var(--text-muted);">No notifications yet</p>
              </div>
            `}
          </div>
        </div>

        <!-- Right: Quick Actions + My Account -->
        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Quick Actions -->
          <div class="card">
            <div class="card-header"><div class="card-title">Quick Actions</div></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              ${[
                ['SMS Ranges', 'fas fa-layer-group', 'sms-ranges', 'primary'],
                ['My Numbers', 'fas fa-mobile-screen', 'my-sms-numbers', 'primary'],
                ['Detailed Report', 'fas fa-file-lines', 'detailed-sms', 'outline'],
                ['Payment Request', 'fas fa-dollar-sign', 'payment-requests', 'outline']
              ].map(([t, i, p, s]) => `
                <button class="btn btn-${s}" style="justify-content:flex-start;gap:10px;" onclick="loadPage('${p}')">
                  <i class="${i}"></i>${t}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- My Account -->
          <div class="card">
            <div class="card-header"><div class="card-title">My Account</div></div>
            <div style="font-size:13px;display:flex;flex-direction:column;gap:10px;">
              ${[
                ['Role', 'Agent', 'cyan'],
                ['Status', 'Active', 'green'],
                ['Manager', `ID #${AGENT_USER.manager_id || '?'}`, 'purple'],
                ['Commission', (AGENT_USER.commission_rate || 5) + '%', 'yellow']
              ].map(([k, v, c]) => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
                  <span class="text-muted">${k}</span>${badge(v, c)}
                </div>
              `).join('')}
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
                <span class="text-muted">Clients</span>
                <span class="fw-600">${totalClients}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;">
                <span class="text-muted">Numbers</span>
                <span class="fw-600">${numbersTotal}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // ── Render Chart ──
    try {
      const ctx = document.getElementById('agt-chart');
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
            },
            elements: {
              line: {
                tension: 0.4
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
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load dashboard. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgDashboard()">Retry</button>
      </div>
    `;
  }
}

// ── MARK ALL NEWS AS READ ────────────────────────────────────────
async function markAllRead() {
  try {
    const result = await apiFetch('/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({ agent_id: AGENT_ID })
    });
    if (result && result.success) {
      toast('All notifications marked as read', 'success');
      pgDashboard();
    } else {
      toast('Failed to mark as read', 'error');
    }
  } catch (err) {
    console.error('Mark read error:', err);
    toast('Error marking as read', 'error');
  }
}

// ── SMS RANGES ────────────────────────────────────────────────────
async function pgSmsRanges() {
  try {
    const data = await apiFetch('/api/numbers/sms-ranges');
    const ranges = data || [];
    const totalRanges = ranges.length;
    const activeRanges = ranges.filter(r => r.active).length;
    const payoutValues = ranges.map(r => r.payout || 0).filter(v => v > 0);
    const avgPayout = payoutValues.length ? (payoutValues.reduce((s, v) => s + v, 0) / payoutValues.length) : 0;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS Ranges</div><div class="page-subtitle">Available IPRN ranges for SMS collection</div></div>
      </div>
      <div class="card">
        ${buildTable(
          ['#', 'Country', 'Provider', 'Prefix', 'Payment Term', 'Payout', 'Status'],
          ranges.map(r => [
            r.id || '—',
            r.country || '—',
            r.provider || '—',
            `<span class="monospace">${r.prefix || '—'}</span>`,
            badge(r.payout_schedule === 'monthly' ? 'Monthly' : 'Weekly', r.payout_schedule === 'monthly' ? 'purple' : 'blue'),
            r.payout ? `<span class="text-success">$${r.payout}</span>` : '—',
            statusBadge(r.active ? 'active' : 'inactive')
          ])
        )}
      </div>
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><div class="card-title">Range Summary</div></div>
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
          ${statCard('Total Ranges', 'fas fa-layer-group', totalRanges, 'cyan', '')}
          ${statCard('Active Ranges', 'fas fa-circle-check', activeRanges, 'green', '')}
          ${statCard('Avg Payout', 'fas fa-dollar-sign', '$' + avgPayout.toFixed(4), 'yellow', '')}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('SMS Ranges error:', err);
    toast('Failed to load SMS ranges', 'error');
  }
}

// ═══════════════════════════════════════════════
//  MY SMS NUMBERS — COMPLETE UPGRADED VERSION
// ═══════════════════════════════════════════════

let smsNumbersPage = 1;
let smsNumbersPerPage = 25;
let smsNumbersData = [];

async function pgMySmsNumbers(page = 1) {
  try {
    smsNumbersPage = page;
    
    // Get filter values
    const rangeFilter = document.getElementById('sms-range-filter')?.value || '';
    const clientFilter = document.getElementById('sms-client-filter')?.value || '';
    const statusFilter = document.getElementById('sms-status-filter')?.value || '';
    const searchQuery = document.getElementById('sms-search')?.value || '';
    
    // Build query params
    const params = new URLSearchParams();
    params.append('page', smsNumbersPerPage === 'all' ? 1 : page);
    params.append('limit', smsNumbersPerPage === 'all' ? 100000 : smsNumbersPerPage);
    if (rangeFilter) params.append('range', rangeFilter);
    if (clientFilter) params.append('client_id', clientFilter);
    if (statusFilter) params.append('status', statusFilter);
    if (searchQuery) params.append('search', searchQuery);
    params.append('agent_id', AGENT_ID);
    
    const data = await apiFetch(`/api/numbers?${params.toString()}`);
    smsNumbersData = data?.data || [];
    const total = data?.total || 0;
    const effPerPage = smsNumbersPerPage === 'all' ? (total || 1) : smsNumbersPerPage;
    const totalPages = smsNumbersPerPage === 'all' ? 1 : (Math.ceil(total / smsNumbersPerPage) || 1);

    // Fetch clients for dropdown
    const clientsData = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`);
    const clients = clientsData?.data || [];
    
    // Fetch ranges for dropdown — only ones this Agent actually has numbers in
    const [rangesData, allMyNumbers] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`)
    ]);
    const myCountryProviderSet = new Set((allMyNumbers?.data || []).map(n => `${n.country}|${n.provider}`));
    const ranges = (rangesData || []).filter(r => myCountryProviderSet.has(`${r.country}|${r.provider}`));

    // Fetch rate card (buy_rate = "My Payout", sell_rate = "Payout" shown to client)
    const rateCardData = await apiFetch('/api/numbers/rate-card');
    const rateCard = rateCardData || [];
    const rateLookup = {};
    rateCard.forEach(r => { rateLookup[`${r.country}|${r.provider}`] = r; });
    const rangeLookup = {};
    ranges.forEach(r => { rangeLookup[`${r.country}|${r.provider}`] = r; });

    function rangeInfoFor(n) {
      return rangeLookup[`${n.country}|${n.provider}`] || null;
    }
    function rateInfoFor(n) {
      return rateLookup[`${n.country}|${n.provider}`] || null;
    }

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">SMS Numbers</div>
          <div class="page-subtitle">SMS Module > SMS Numbers</div>
        </div>
      </div>
      
      <div class="card" style="margin-bottom:16px;">
        <div class="filters-bar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <select id="sms-range-filter" onchange="applySmsFilters()" style="min-width:160px;">
            <option value="">Select Range</option>
            ${ranges.map(r => `<option value="${r.id}" ${rangeFilter == r.id ? 'selected' : ''}>${r.country || ''} ${r.prefix || ''}</option>`).join('')}
          </select>
          ${zySelectSearch('sms-client-filter', 'Search clients…')}
          <select id="sms-client-filter" onchange="applySmsFilters()" style="min-width:150px;">
            <option value="">Select Client</option>
            ${clients.map(c => `<option value="${c.id}" ${clientFilter == c.id ? 'selected' : ''}>${c.username}</option>`).join('')}
          </select>
          <select id="sms-status-filter" onchange="applySmsFilters()" style="min-width:130px;">
            <option value="">All Numbers</option>
            <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="blocked" ${statusFilter === 'blocked' ? 'selected' : ''}>Blocked</option>
            <option value="assigned" ${statusFilter === 'assigned' ? 'selected' : ''}>Assigned</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="applySmsFilters()"><i class="fas fa-filter"></i> Filter</button>
          <button class="btn btn-outline btn-sm" onclick="resetSmsFilters()"><i class="fas fa-undo"></i> Reset</button>
        </div>
      </div>
      
      <div class="card">
        <div class="dt-toolbar" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select id="sms-pp" onchange="smsNumbersPerPage=this.value==='all'?'all':parseInt(this.value);pgMySmsNumbers(1)" style="width:80px;">
              <option value="10" ${smsNumbersPerPage === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${smsNumbersPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${smsNumbersPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${smsNumbersPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${smsNumbersPerPage === 500 ? 'selected' : ''}>500</option>
              <option value="all" ${smsNumbersPerPage === 'all' ? 'selected' : ''}>All</option>
            </select>
            <span style="font-size:13px;color:var(--text-muted);">entries</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="copySmsNumbers()"><i class="fas fa-copy"></i> Copy</button>
            <button class="btn btn-outline btn-sm" onclick="exportSmsCsv()"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportSmsExcel()"><i class="fas fa-file-excel"></i> Excel</button>
            <button class="btn btn-outline btn-sm" onclick="exportSmsPdf()"><i class="fas fa-file-pdf"></i> PDF</button>
            <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
          </div>
        </div>

        <div class="filters-bar" style="margin-bottom:12px;justify-content:space-between;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="bulkAssignSelectedNumbers()"><i class="fas fa-user-plus"></i> Assign Selected</button>
            <button class="btn btn-danger btn-sm" onclick="bulkRevokeSelectedNumbers()"><i class="fas fa-rotate-left"></i> Revoke Selected</button>
            <button class="btn btn-warning btn-sm" onclick="bulkReturnSelectedNumbers()"><i class="fas fa-user-minus"></i> Return Selected</button>
            <span id="sms-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <label style="font-size:13px;color:var(--text-muted);">Search:</label>
            <input id="sms-search" placeholder="🔍" value="${searchQuery}" onkeyup="if(event.key==='Enter') pgMySmsNumbers(1)" style="width:200px;">
            <button class="btn btn-outline btn-sm" onclick="pgMySmsNumbers(1)"><i class="fas fa-search"></i></button>
          </div>
        </div>
        
        ${(() => {
          const clientById = {};
          clients.forEach(c => { clientById[c.id] = c; });
          smsNumbersData.forEach(n => { n.client_daily_limit = n.client_id ? (clientById[n.client_id]?.daily_limit ?? 0) : 0; });
          return buildSortableNumbersTable(smsNumbersData, rangeInfoFor, rateInfoFor);
        })()}
        
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <span style="font-size:13px;color:var(--text-muted);">
            Showing ${total === 0 ? 0 : Math.min((page - 1) * effPerPage + 1, total)} to ${Math.min(page * effPerPage, total)} of ${total} entries
          </span>
          ${smsNumbersPerPage === 'all' ? '' : paginationWithNumbers(page, totalPages, pgMySmsNumbers)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('SMS Numbers error:', err);
    toast('Failed to load SMS numbers', 'error');
  }
}

// ── SELECTION / BULK ASSIGN-RETURN ────────────────────────────────
function toggleAllSmsNumberChecks(master) {
  document.querySelectorAll('.sms-num-check').forEach(cb => cb.checked = master.checked);
  updateSmsSelectedCount();
}
function updateSmsSelectedCount() {
  const n = document.querySelectorAll('.sms-num-check:checked').length;
  const el = document.getElementById('sms-selected-count');
  if (el) el.textContent = `${n} selected`;
}
function getSelectedSmsNumberIds(onlyUnassigned) {
  return Array.from(document.querySelectorAll('.sms-num-check:checked'))
    .filter(cb => !onlyUnassigned || cb.dataset.assigned !== '1')
    .map(cb => parseInt(cb.value));
}
async function bulkAssignSelectedNumbers() {
  const ids = getSelectedSmsNumberIds(false);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  try {
    const clientsData = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`);
    const clients = clientsData?.data || [];
    if (!clients.length) { toast('No clients available to assign', 'warning'); return; }
    openModal(`Assign ${ids.length} Number(s)`, `
      <form id="bulk-assign-selected-form" onsubmit="proceedBulkAssignSelected(event, [${ids.join(',')}])">
        <div class="form-group">
          <label class="form-label">Select Client *</label>
          ${zySelectSearch('bulk-assign-selected-client', 'Search clients…')}
          <select id="bulk-assign-selected-client" required>
            <option value="">— Select Client —</option>
            ${clients.map(c => `<option value="${c.id}">${c.username}</option>`).join('')}
          </select>
        </div>
        <p class="fs-12 text-muted">Numbers already assigned to a different client will move straight to the one you pick here.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-arrow-right"></i> Next</button>
        </div>
      </form>
    `);
  } catch (err) {
    toast('Failed to load clients', 'error');
  }
}
async function proceedBulkAssignSelected(event, ids) {
  event.preventDefault();
  const clientId = parseInt(document.getElementById('bulk-assign-selected-client')?.value);
  if (!clientId) { toast('Please select a client', 'error'); return; }
  await openAssignTermsModal(ids, clientId);
}
async function bulkRevokeSelectedNumbers() {
  const ids = getSelectedSmsNumberIds(false);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!confirm(`Revoke ${ids.length} number(s) and return them to the pool?`)) return;
  try {
    const result = await apiFetch('/api/numbers/bulk-unassign-many', {
      method: 'POST', body: JSON.stringify({ number_ids: ids })
    });
    toast(`✅ Revoked ${result?.revoked || ids.length} number(s)`, 'warning');
    pgMySmsNumbers(smsNumbersPage);
  } catch (err) {
    console.error('Revoke error:', err);
    toast('Some numbers failed to revoke', 'error');
  }
}

async function bulkReturnSelectedNumbers() {
  const ids = getSelectedSmsNumberIds(false).filter(id => {
    const cb = document.querySelector(`.sms-num-check[value="${id}"]`);
    return cb && cb.dataset.assigned === '1';
  });
  if (!ids.length) { toast('Select at least one assigned number to return', 'warning'); return; }
  if (!confirm(`Return ${ids.length} number(s) to the pool?`)) return;
  try {
    const result = await apiFetch('/api/numbers/bulk-unassign-many', {
      method: 'POST', body: JSON.stringify({ number_ids: ids })
    });
    toast(`✅ Returned ${result?.revoked || ids.length} number(s) to pool`, 'warning');
    pgMySmsNumbers(smsNumbersPage);
  } catch (err) {
    console.error('Bulk return error:', err);
    toast('Some numbers failed to return', 'error');
  }
}

// ── SMS NUMBERS FILTER FUNCTIONS ─────────────────────────────────
function applySmsFilters() {
  pgMySmsNumbers(1);
}

function resetSmsFilters() {
  const rangeFilter = document.getElementById('sms-range-filter');
  const clientFilter = document.getElementById('sms-client-filter');
  const statusFilter = document.getElementById('sms-status-filter');
  const searchInput = document.getElementById('sms-search');
  
  if (rangeFilter) rangeFilter.value = '';
  if (clientFilter) clientFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  if (searchInput) searchInput.value = '';
  
  pgMySmsNumbers(1);
  toast('Filters reset', 'info');
}

// ── SMS NUMBERS EXPORT FUNCTIONS ─────────────────────────────────
function copySmsNumbers() {
  try {
    const text = smsNumbersData.map(n => 
      `${n.range_name || n.range || ''}\t${n.prefix || ''}\t${n.number || ''}\t${n.client_name || 'Unassigned'}\t${n.status || ''}`
    ).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      toast(`Copied ${smsNumbersData.length} numbers to clipboard`, 'success');
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast(`Copied ${smsNumbersData.length} numbers`, 'success');
    });
  } catch (err) {
    console.error('Copy error:', err);
    toast('Failed to copy', 'error');
  }
}

function exportSmsCsv() {
  try {
    const headers = ['Range', 'Prefix', 'Number', 'Client', 'Status'];
    const rows = smsNumbersData.map(n => [
      n.range_name || n.range || '',
      n.prefix || '',
      n.number || '',
      n.client_name || 'Unassigned',
      n.status || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms_numbers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported successfully', 'success');
  } catch (err) {
    console.error('CSV export error:', err);
    toast('Failed to export CSV', 'error');
  }
}

function exportSmsExcel() {
  try {
    const headers = ['Range', 'Prefix', 'Number', 'Client', 'Status'];
    const rows = smsNumbersData.map(n => [
      n.range_name || n.range || '',
      n.prefix || '',
      n.number || '',
      n.client_name || 'Unassigned',
      n.status || ''
    ]);
    
    let html = '<html><head><meta charset="UTF-8"></head><body><table border="1">';
    html += '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    rows.forEach(r => {
      html += '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>';
    });
    html += '</table></body></html>';
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms_numbers_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Excel exported successfully', 'success');
  } catch (err) {
    console.error('Excel export error:', err);
    toast('Failed to export Excel', 'error');
  }
}

function exportSmsPdf() {
  try {
    const headers = ['Range', 'Prefix', 'Number', 'Client', 'Status'];
    const rows = smsNumbersData.map(n => [
      n.range_name || n.range || '',
      n.prefix || '',
      n.number || '',
      n.client_name || 'Unassigned',
      n.status || ''
    ]);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>SMS Numbers</title>
      <style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px;} th{background:#f0f0f0;}</style>
      </head><body>
      <h2>SMS Numbers</h2>
      <table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
      </table>
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  } catch (err) {
    console.error('PDF export error:', err);
    toast('Failed to export PDF', 'error');
  }
}

// ── ASSIGN NUMBER TO CLIENT ──────────────────────────────────────
async function openAssignNumberModal(numberId, number) {
  try {
    const clientsData = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`);
    const clients = clientsData?.data || [];

    if (!clients.length) {
      toast('No clients available to assign', 'warning');
      return;
    }

    openModal(`Assign Number — ${number}`, `
      <form id="assign-number-form" onsubmit="proceedSingleAssign(event, ${numberId})">
        <div class="form-group">
          <label class="form-label">Select Client *</label>
          ${zySelectSearch('assign-client', 'Search clients…')}
          <select id="assign-client" required>
            <option value="">— Select Client —</option>
            ${clients.map(c => `<option value="${c.id}">${c.username}</option>`).join('')}
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-arrow-right"></i> Next</button>
        </div>
      </form>
    `);
  } catch (err) {
    console.error('Assign number error:', err);
    toast('Failed to load clients', 'error');
  }
}

async function proceedSingleAssign(event, numberId) {
  event.preventDefault();
  const clientId = parseInt(document.getElementById('assign-client')?.value);
  if (!clientId) { toast('Please select a client', 'error'); return; }
  await openAssignTermsModal([numberId], clientId);
}

// ── VIEW NUMBER DETAIL ────────────────────────────────────────────
async function viewNumberDetail(numberId) {
  try {
    const data = await apiFetch(`/api/numbers/${numberId}`);
    if (!data) {
      toast('Number not found', 'error');
      return;
    }
    
    const n = data;
    openModal(`Number Details — ${n.number || 'Unknown'}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
        ${[
          ['ID', n.id || '—'],
          ['Number', `<span class="monospace">${n.number || '—'}</span>`],
          ['Range', n.range_name || n.range || '—'],
          ['Prefix', n.prefix || '—'],
          ['Country', n.country || '—'],
          ['Provider', n.provider || '—'],
          ['App', n.app || '—'],
          ['Client', n.client_name || n.client_username || '<span class="text-muted">Unassigned</span>'],
          ['SMS Count', n.sms_count || 0],
          ['Revenue', '$' + ((n.sms_count || 0) * 0.003).toFixed(4)],
          ['Status', statusBadge(n.status)],
          ['Last SMS', fmtShort(n.last_sms)],
          ['Created', fmtDate(n.created_at)]
        ].map(([k, v]) => `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div class="text-muted fs-12">${k}</div>
            <div class="fw-600">${v}</div>
          </div>
        `).join('')}
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        ${n.client_id ? `
          <button class="btn btn-warning btn-sm" onclick="closeModal();openUnassignNumber(${n.id}, '${n.number || ''}')">
            <i class="fas fa-user-minus"></i> Unassign
          </button>
        ` : `
          <button class="btn btn-primary" onclick="closeModal();openAssignNumberModal(${n.id}, '${n.number || ''}')">
            <i class="fas fa-user-plus"></i> Assign to Client
          </button>
        `}
      </div>
    `);
  } catch (err) {
    console.error('Number detail error:', err);
    toast('Failed to load number details', 'error');
  }
}

// ── UNASSIGN NUMBER ──────────────────────────────────────────────
async function openUnassignNumber(numberId, number) {
  if (!confirm(`⚠️ Are you sure you want to unassign number ${number} from its client?`)) {
    return;
  }
  
  try {
    const result = await apiFetch(`/api/numbers/${numberId}/unassign`, {
      method: 'POST'
    });
    
    if (result && result.success) {
      toast(`✅ Number ${number} unassigned successfully`, 'warning');
      pgMySmsNumbers(smsNumbersPage);
    } else {
      toast(result?.error || 'Failed to unassign number', 'error');
    }
  } catch (err) {
    console.error('Unassign error:', err);
    toast('Error unassigning number: ' + err.message, 'error');
  }
}

// ── SMS RATECARD ──────────────────────────────────────────────────
async function pgSmsRateCard() {
  try {
    const data = await apiFetch('/api/numbers/rate-card');
    const rates = data || [];

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS RateCard</div><div class="page-subtitle">Your payout rate by country and provider</div></div>
      </div>
      <div class="card">
        ${buildTable(
          ['#', 'Country', 'Provider', 'My Payout', 'Status'],
          rates.map(r => [
            r.id || '—',
            r.country || '—',
            r.provider || '—',
            `<span class="text-success fw-600">$${r.sell_rate || 0}</span>`,
            statusBadge(r.active ? 'active' : 'inactive')
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('RateCard error:', err);
    toast('Failed to load rate card', 'error');
  }
}

// ── SMS TEST PANEL ────────────────────────────────────────────────
let agTpPage = 1, agTpPerPage = 25, agTpRangeFilter = '', agRsPage = 1, agRsPerPage = 25;
async function pgSmsTestPanel() {
  try {
    const ranges = await apiFetch('/api/numbers/sms-ranges') || [];
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS Test Panel</div><div class="page-subtitle">Test numbers uploaded by Owner, and the live SMS test feed received on them.</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">SMS Test Numbers</div></div>
          <div class="filters-bar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select id="ag-tp-range" style="min-width:150px;" onchange="agTpPage=1;loadAgTestNumbers()">
              <option value="">Select Range</option>
              ${ranges.map(r => `<option value="${r.id}">${r.country || ''} ${r.prefix || ''}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm" onclick="agTpPage=1;loadAgTestNumbers()"><i class="fas fa-filter"></i> Filter</button>
          </div>
          <div class="dt-toolbar" style="margin-top:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Show</span>
              <select onchange="agTpPerPage=this.value==='all'?'all':parseInt(this.value);agTpPage=1;loadAgTestNumbers()" style="width:80px;">
                <option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span style="font-size:13px;color:var(--text-muted);">entries</span>
            </div>
          </div>
          <div id="ag-tp-wrap"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Recent SMS Test</div></div>
          <div class="dt-toolbar">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Show</span>
              <select onchange="agRsPerPage=this.value==='all'?'all':parseInt(this.value);agRsPage=1;loadAgRecentSms()" style="width:80px;">
                <option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span style="font-size:13px;color:var(--text-muted);">entries</span>
            </div>
          </div>
          <div id="ag-rs-wrap"></div>
        </div>
      </div>
    `;
    loadAgTestNumbers();
    loadAgRecentSms();
  } catch (err) {
    console.error('SMS Test Panel error:', err);
    toast('Failed to load test panel', 'error');
  }
}

async function loadAgTestNumbers() {
  const wrap = document.getElementById('ag-tp-wrap');
  if (!wrap) return;
  agTpRangeFilter = document.getElementById('ag-tp-range')?.value || '';
  const limitParam = agTpPerPage === 'all' ? 100000 : agTpPerPage;
  const params = new URLSearchParams();
  params.append('page', agTpPerPage === 'all' ? 1 : agTpPage);
  params.append('limit', limitParam);
  if (agTpRangeFilter) params.append('range', agTpRangeFilter);
  const data = await apiFetch(`/api/sms/test-numbers?${params.toString()}`);
  const rows = data?.data || [];
  const total = data?.total || 0;
  const perPage = agTpPerPage === 'all' ? (total || 1) : agTpPerPage;
  const pages = Math.ceil(total / perPage) || 1;

  wrap.innerHTML = buildTable(
    ['Range', 'Test Number'],
    rows.map(n => [
      n.range_label || '—',
      `<span class="monospace fw-600">${n.number || '—'}</span>`
    ])
  ) + `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((agTpPage-1)*perPage+1,total)}–${Math.min(agTpPage*perPage,total)} of ${total}</span>
      ${agTpPerPage === 'all' ? '' : pagination(agTpPage, total, perPage, (p) => { agTpPage = p; loadAgTestNumbers(); })}
    </div>
  `;
}

async function loadAgRecentSms() {
  const wrap = document.getElementById('ag-rs-wrap');
  if (!wrap) return;
  const limitParam = agRsPerPage === 'all' ? 100000 : agRsPerPage;
  const params = new URLSearchParams();
  params.append('page', agRsPerPage === 'all' ? 1 : agRsPage);
  params.append('limit', limitParam);
  const data = await apiFetch(`/api/sms/test-logs?${params.toString()}`);
  const rows = data?.data || [];
  const total = data?.total || 0;
  const perPage = agRsPerPage === 'all' ? (total || 1) : agRsPerPage;

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
      <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((agRsPage-1)*perPage+1,total)}–${Math.min(agRsPage*perPage,total)} of ${total}</span>
      ${agRsPerPage === 'all' ? '' : pagination(agRsPage, total, perPage, (p) => { agRsPage = p; loadAgRecentSms(); })}
    </div>
  `;
}
let myClientsPerPage = 25;
async function pgMyClients(page = 1) {
  try {
    const limitParam = myClientsPerPage === 'all' ? 100000 : myClientsPerPage;
    const data = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&page=${myClientsPerPage === 'all' ? 1 : page}&limit=${limitParam}`);
    const clients = data?.data || [];
    const total = data?.total || 0;
    const perPage = myClientsPerPage === 'all' ? (total || 1) : myClientsPerPage;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Clients</div>
          <div class="page-subtitle">Users Master > Clients</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="openAddClientModal()">
            <i class="fas fa-user-plus"></i> Add New Client
          </button>
        </div>
      </div>
      <div class="card">
        <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:13px;color:var(--text-muted);">Show</span>
          <select id="clients-pp" onchange="myClientsPerPage=this.value==='all'?'all':parseInt(this.value);pgMyClients(1)" style="width:80px;">
            <option value="25" ${myClientsPerPage === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${myClientsPerPage === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${myClientsPerPage === 100 ? 'selected' : ''}>100</option>
            <option value="500" ${myClientsPerPage === 500 ? 'selected' : ''}>500</option>
            <option value="all" ${myClientsPerPage === 'all' ? 'selected' : ''}>All</option>
          </select>
          <span style="font-size:13px;color:var(--text-muted);">entries</span>
          <input id="client-search" placeholder="Search clients..." onkeyup="if(event.key==='Enter') searchClients()">
          <select id="client-status-filter" onchange="filterClients()">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="searchClients()">
            <i class="fas fa-search"></i> Search
          </button>
          <button class="btn btn-outline btn-sm" onclick="resetClientFilters()">
            <i class="fas fa-undo"></i> Reset
          </button>
          <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
            Showing ${total === 0 ? 0 : Math.min((page - 1) * perPage + 1, total)} to ${Math.min(page * perPage, total)} of ${total} entries
          </span>
        </div>
        ${buildTable(
          ['Username', 'Name', 'Email', 'Contact', 'Skype', 'Active', 'Actions'],
          clients.map(c => [
            `<strong>${c.username || '—'}</strong>`,
            c.full_name || c.name || '—',
            c.email || '—',
            c.phone || c.contact_no || '—',
            c.skype_id || c.skype || '—',
            c.status === 'active' ? '✔' : '✘',
            `<button class="btn btn-outline btn-sm" onclick="openClientDetail(${c.id})" title="View">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-outline btn-sm" onclick="openAdjustBalance(${c.id},'${c.username || ''}',${c.balance || 0})" title="Balance">
              <i class="fas fa-dollar-sign"></i>
            </button>
            <button class="btn btn-outline btn-sm" onclick="openEditClientModal(${c.id})" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id},'${c.username || ''}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>`
          ])
        )}
        ${myClientsPerPage === 'all' ? '' : pagination(page, total, perPage, pgMyClients)}
      </div>
    `;
  } catch (err) {
    console.error('My Clients error:', err);
    toast('Failed to load clients', 'error');
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load clients. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgMyClients(1)">Retry</button>
      </div>
    `;
  }
}

// ── SEARCH / FILTER CLIENTS ──────────────────────────────────────
async function searchClients() {
  try {
    const q = document.getElementById('client-search')?.value || '';
    const status = document.getElementById('client-status-filter')?.value || '';
    
    const limitParam = myClientsPerPage === 'all' ? 100000 : myClientsPerPage;
    const data = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&search=${encodeURIComponent(q)}&status=${status}&limit=${limitParam}`);
    
    const wrap = document.querySelector('.table-wrap');
    if (wrap) {
      wrap.outerHTML = buildTable(
        ['Username', 'Name', 'Email', 'Contact', 'Skype', 'Active', 'Actions'],
        (data?.data || []).map(c => [
          `<strong>${c.username || '—'}</strong>`,
          c.full_name || c.name || '—',
          c.email || '—',
          c.phone || c.contact_no || '—',
          c.skype_id || c.skype || '—',
          c.status === 'active' ? '✔' : '✘',
          `<button class="btn btn-outline btn-sm" onclick="openClientDetail(${c.id})"><i class="fas fa-eye"></i></button>
           <button class="btn btn-outline btn-sm" onclick="openAdjustBalance(${c.id},'${c.username || ''}',${c.balance || 0})"><i class="fas fa-dollar-sign"></i></button>
           <button class="btn btn-outline btn-sm" onclick="openEditClientModal(${c.id})"><i class="fas fa-pen"></i></button>
           <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id},'${c.username || ''}')"><i class="fas fa-trash"></i></button>`
        ])
      );
      toast(`Found ${data?.data?.length || 0} results`, 'info');
    }
  } catch (err) {
    console.error('Search error:', err);
    toast('Search failed', 'error');
  }
}

function filterClients() {
  searchClients();
}

function resetClientFilters() {
  const searchInput = document.getElementById('client-search');
  const statusSelect = document.getElementById('client-status-filter');
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = '';
  pgMyClients(1);
  toast('Filters reset', 'info');
}

// ── ADD NEW CLIENT ────────────────────────────────────────────────
function openAddClientModal() {
  openModal('Add New Client', `
    <form id="add-client-form" onsubmit="submitAddClient(event)">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Username * (min 6 characters)</label>
          <input type="text" id="ac-username" placeholder="Enter username" minlength="6" required>
        </div>
        <div class="form-group">
          <label class="form-label">Password * (min 6 characters)</label>
          <input type="password" id="ac-password" placeholder="Enter password" minlength="6" required>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" id="ac-fullname" placeholder="Full Name">
        </div>
        <div class="form-group">
          <label class="form-label">Company Name</label>
          <input type="text" id="ac-company" placeholder="Company">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="ac-email" placeholder="abc@xyz.com">
        </div>
        <div class="form-group">
          <label class="form-label">Skype ID</label>
          <input type="text" id="ac-skype" placeholder="Skype ID">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Contact No.</label>
          <input type="text" id="ac-phone" placeholder="441768499506">
        </div>
        <div class="form-group">
          <label class="form-label">Country</label>
          <select id="ac-country">
            <option value="">Select Country</option>
            <option value="Afghanistan">Afghanistan</option>
            <option value="Albania">Albania</option>
            <option value="Algeria">Algeria</option>
            <option value="Andorra">Andorra</option>
            <option value="Angola">Angola</option>
            <option value="Argentina">Argentina</option>
            <option value="Armenia">Armenia</option>
            <option value="Australia">Australia</option>
            <option value="Austria">Austria</option>
            <option value="Azerbaijan">Azerbaijan</option>
            <option value="Bahrain">Bahrain</option>
            <option value="Bangladesh">Bangladesh</option>
            <option value="Belarus">Belarus</option>
            <option value="Belgium">Belgium</option>
            <option value="Bolivia">Bolivia</option>
            <option value="Brazil">Brazil</option>
            <option value="Bulgaria">Bulgaria</option>
            <option value="Cambodia">Cambodia</option>
            <option value="Cameroon">Cameroon</option>
            <option value="Canada">Canada</option>
            <option value="Chile">Chile</option>
            <option value="China">China</option>
            <option value="Colombia">Colombia</option>
            <option value="Congo">Congo</option>
            <option value="Croatia">Croatia</option>
            <option value="Cuba">Cuba</option>
            <option value="Cyprus">Cyprus</option>
            <option value="Czech Republic">Czech Republic</option>
            <option value="Denmark">Denmark</option>
            <option value="Ecuador">Ecuador</option>
            <option value="Egypt">Egypt</option>
            <option value="El Salvador">El Salvador</option>
            <option value="Estonia">Estonia</option>
            <option value="Ethiopia">Ethiopia</option>
            <option value="Finland">Finland</option>
            <option value="France">France</option>
            <option value="Georgia">Georgia</option>
            <option value="Germany">Germany</option>
            <option value="Ghana">Ghana</option>
            <option value="Greece">Greece</option>
            <option value="Guatemala">Guatemala</option>
            <option value="Honduras">Honduras</option>
            <option value="Hong Kong">Hong Kong</option>
            <option value="Hungary">Hungary</option>
            <option value="Iceland">Iceland</option>
            <option value="India">India</option>
            <option value="Indonesia">Indonesia</option>
            <option value="Iran">Iran</option>
            <option value="Iraq">Iraq</option>
            <option value="Ireland">Ireland</option>
            <option value="Israel">Israel</option>
            <option value="Italy">Italy</option>
            <option value="Jamaica">Jamaica</option>
            <option value="Japan">Japan</option>
            <option value="Jordan">Jordan</option>
            <option value="Kazakhstan">Kazakhstan</option>
            <option value="Kenya">Kenya</option>
            <option value="Kuwait">Kuwait</option>
            <option value="Latvia">Latvia</option>
            <option value="Lebanon">Lebanon</option>
            <option value="Libya">Libya</option>
            <option value="Lithuania">Lithuania</option>
            <option value="Luxembourg">Luxembourg</option>
            <option value="Malaysia">Malaysia</option>
            <option value="Mexico">Mexico</option>
            <option value="Moldova">Moldova</option>
            <option value="Morocco">Morocco</option>
            <option value="Nepal">Nepal</option>
            <option value="Netherlands">Netherlands</option>
            <option value="New Zealand">New Zealand</option>
            <option value="Nigeria">Nigeria</option>
            <option value="North Korea">North Korea</option>
            <option value="Norway">Norway</option>
            <option value="Oman">Oman</option>
            <option value="Pakistan">Pakistan</option>
            <option value="Panama">Panama</option>
            <option value="Peru">Peru</option>
            <option value="Philippines">Philippines</option>
            <option value="Poland">Poland</option>
            <option value="Portugal">Portugal</option>
            <option value="Qatar">Qatar</option>
            <option value="Romania">Romania</option>
            <option value="Russia">Russia</option>
            <option value="Saudi Arabia">Saudi Arabia</option>
            <option value="Senegal">Senegal</option>
            <option value="Serbia">Serbia</option>
            <option value="Singapore">Singapore</option>
            <option value="Slovakia">Slovakia</option>
            <option value="Slovenia">Slovenia</option>
            <option value="Somalia">Somalia</option>
            <option value="South Africa">South Africa</option>
            <option value="South Korea">South Korea</option>
            <option value="Spain">Spain</option>
            <option value="Sri Lanka">Sri Lanka</option>
            <option value="Sudan">Sudan</option>
            <option value="Sweden">Sweden</option>
            <option value="Switzerland">Switzerland</option>
            <option value="Syria">Syria</option>
            <option value="Taiwan">Taiwan</option>
            <option value="Tanzania">Tanzania</option>
            <option value="Thailand">Thailand</option>
            <option value="Tunisia">Tunisia</option>
            <option value="Turkey">Turkey</option>
            <option value="Uganda">Uganda</option>
            <option value="Ukraine">Ukraine</option>
            <option value="United Arab Emirates">United Arab Emirates</option>
            <option value="United Kingdom">United Kingdom</option>
            <option value="United States">United States</option>
            <option value="Uruguay">Uruguay</option>
            <option value="Uzbekistan">Uzbekistan</option>
            <option value="Venezuela">Venezuela</option>
            <option value="Vietnam">Vietnam</option>
            <option value="Yemen">Yemen</option>
            <option value="Zimbabwe">Zimbabwe</option>
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Address</label>
        <textarea id="ac-address" rows="2" placeholder="Street, City, State, ZIP"></textarea>
      </div>
      
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="ac-status">
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Close</button>
        <button type="submit" class="btn btn-primary" id="ac-submit-btn">
          <i class="fas fa-user-plus"></i> Add
        </button>
      </div>
    </form>
  `);
}

async function submitAddClient(event) {
  event.preventDefault();
  
  try {
    const username = document.getElementById('ac-username')?.value.trim();
    const password = document.getElementById('ac-password')?.value;
    
    if (!username || username.length < 6) {
      toast('Username must be at least 6 characters', 'error');
      return;
    }
    if (!password || password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    
    const btn = document.getElementById('ac-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Adding...';
    }
    
    const payload = {
      username,
      password,
      full_name: document.getElementById('ac-fullname')?.value || '',
      company_name: document.getElementById('ac-company')?.value || '',
      email: document.getElementById('ac-email')?.value || '',
      skype_id: document.getElementById('ac-skype')?.value || '',
      contact_no: document.getElementById('ac-phone')?.value || '',
      country: document.getElementById('ac-country')?.value || '',
      address: document.getElementById('ac-address')?.value || '',
      agent_id: AGENT_ID,
      status: document.getElementById('ac-status')?.value || 'active'
    };
    
    const result = await apiFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (result && result.id) {
      closeModal();
      toast(`✅ Client "${username}" created successfully!`, 'success');
      pgMyClients(1);
    } else {
      toast(result?.error || 'Failed to create client', 'error');
    }
  } catch (err) {
    console.error('Add client error:', err);
    toast('Error creating client: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('ac-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> Add';
    }
  }
}

// ── EDIT CLIENT ───────────────────────────────────────────────────
async function openEditClientModal(id) {
  try {
    const data = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`);
    const c = data?.data?.find(x => x.id === id);
    if (!c) {
      toast('Client not found', 'error');
      return;
    }
    
    openModal(`Edit Client — ${c.username || 'Unknown'}`, `
      <form id="edit-client-form" onsubmit="submitEditClient(event, ${id})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Username * (min 6)</label>
            <input type="text" id="ec-username" value="${c.username || ''}" minlength="6" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password (min 6, optional)</label>
            <input type="password" id="ec-password" placeholder="Leave blank to keep current">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" id="ec-fullname" value="${c.full_name || c.name || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Company Name</label>
            <input type="text" id="ec-company" value="${c.company_name || ''}">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="ec-email" value="${c.email || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Skype ID</label>
            <input type="text" id="ec-skype" value="${c.skype_id || c.skype || ''}">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Contact No.</label>
            <input type="text" id="ec-phone" value="${c.phone || c.contact_no || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Country</label>
            <select id="ec-country">
              ${['Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon','Canada','Chile','China','Colombia','Congo','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Ecuador','Egypt','El Salvador','Estonia','Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Honduras','Hong Kong','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Latvia','Lebanon','Libya','Lithuania','Luxembourg','Malaysia','Mexico','Moldova','Morocco','Nepal','Netherlands','New Zealand','Nigeria','North Korea','Norway','Oman','Pakistan','Panama','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Saudi Arabia','Senegal','Serbia','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea','Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria','Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zimbabwe'].map(country =>
                `<option value="${country}" ${country === c.country ? 'selected' : ''}>${country}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Address</label>
          <textarea id="ec-address" rows="2">${c.address || ''}</textarea>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Balance ($)</label>
            <input type="number" id="ec-balance" value="${c.balance || 0}" step="0.01" min="0">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Daily Limit</label>
            <input type="number" id="ec-daily" value="${c.daily_limit || 100}" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Monthly Limit</label>
            <input type="number" id="ec-monthly" value="${c.monthly_limit || 3000}" min="1">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="ec-status">
              <option value="active" ${c.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="suspended" ${c.status === 'suspended' ? 'selected' : ''}>Suspended</option>
              <option value="inactive" ${c.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Close</button>
          <button type="submit" class="btn btn-primary" id="ec-submit-btn">
            <i class="fas fa-save"></i> Save Changes
          </button>
        </div>
      </form>
    `);
  } catch (err) {
    console.error('Edit client error:', err);
    toast('Failed to load client details', 'error');
  }
}

async function submitEditClient(event, id) {
  event.preventDefault();
  
  try {
    const username = document.getElementById('ec-username')?.value.trim();
    if (!username || username.length < 6) {
      toast('Username must be at least 6 characters', 'error');
      return;
    }
    
    const btn = document.getElementById('ec-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Saving...';
    }
    
    const payload = {
      username,
      full_name: document.getElementById('ec-fullname')?.value || '',
      company_name: document.getElementById('ec-company')?.value || '',
      email: document.getElementById('ec-email')?.value || '',
      skype_id: document.getElementById('ec-skype')?.value || '',
      contact_no: document.getElementById('ec-phone')?.value || '',
      country: document.getElementById('ec-country')?.value || '',
      address: document.getElementById('ec-address')?.value || '',
      balance: parseFloat(document.getElementById('ec-balance')?.value) || 0,
      daily_limit: parseInt(document.getElementById('ec-daily')?.value) || 100,
      monthly_limit: parseInt(document.getElementById('ec-monthly')?.value) || 3000,
      status: document.getElementById('ec-status')?.value || 'active'
    };
    
    const password = document.getElementById('ec-password')?.value;
    if (password && password.length >= 6) {
      payload.password = password;
    }
    
    const result = await apiFetch(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    
    if (result) {
      closeModal();
      toast(`✅ Client "${username}" updated successfully!`, 'success');
      pgMyClients(1);
    } else {
      toast('Failed to update client', 'error');
    }
  } catch (err) {
    console.error('Edit client error:', err);
    toast('Error updating client: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('ec-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  }
}

// ── DELETE CLIENT ─────────────────────────────────────────────────
async function deleteClient(id, username) {
  if (!confirm(`⚠️ Are you sure you want to delete client "${username}"?\n\nThis action cannot be undone!`)) {
    return;
  }
  
  try {
    const result = await apiFetch(`/api/clients/${id}`, {
      method: 'DELETE'
    });
    
    if (result && (result.success || result.id)) {
      toast(`✅ Client "${username}" deleted successfully`, 'warning');
      pgMyClients(1);
    } else {
      toast('Failed to delete client', 'error');
    }
  } catch (err) {
    console.error('Delete client error:', err);
    toast('Error deleting client: ' + err.message, 'error');
  }
}

// ── CLIENT DETAIL ─────────────────────────────────────────────────
async function openClientDetail(id) {
  try {
    const data = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`);
    const c = data?.data?.find(x => x.id === id);
    if (!c) {
      toast('Client not found', 'error');
      return;
    }
    
    openModal(`Client Details — ${c.username || 'Unknown'}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
        ${[
          ['ID', c.id || '—'],
          ['Username', c.username || '—'],
          ['Name', c.full_name || c.name || '—'],
          ['Company', c.company_name || '—'],
          ['Email', c.email || '—'],
          ['Skype', c.skype_id || c.skype || '—'],
          ['Contact', c.phone || c.contact_no || '—'],
          ['Country', c.country || '—'],
          ['Address', c.address || '—'],
          ['Service', c.service || '—'],
          ['Balance', '$' + (c.balance || 0)],
          ['Numbers Assigned', c.numbers_assigned || 0],
          ['Daily Limit', c.daily_limit || '—'],
          ['Monthly Limit', c.monthly_limit || '—'],
          ['Total SMS', c.total_sms || 0],
          ['Status', statusBadge(c.status)],
          ['Created', fmtDate(c.created_at)],
          ['Last Active', fmtShort(c.last_active)]
        ].map(([k, v]) => `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div class="text-muted fs-12">${k}</div>
            <div class="fw-600">${v}</div>
          </div>
        `).join('')}
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal();openAdjustBalance(${c.id},'${c.username || ''}',${c.balance || 0})">
          <i class="fas fa-dollar-sign"></i> Adjust Balance
        </button>
        <button class="btn btn-outline" onclick="closeModal();openEditClientModal(${c.id})">
          <i class="fas fa-pen"></i> Edit
        </button>
      </div>
    `);
  } catch (err) {
    console.error('Client detail error:', err);
    toast('Failed to load client details', 'error');
  }
}

// ── ADJUST BALANCE ────────────────────────────────────────────────
function openAdjustBalance(id, username, current) {
  openModal(`Adjust Balance — ${username || 'Client'}`, `
    <p class="text-muted" style="margin-bottom:16px;">
      Current Balance: <strong class="text-success">$${current || 0}</strong>
    </p>
    <form id="adjust-balance-form" onsubmit="submitAdjustBalance(event, ${id}, ${current || 0})">
      <div class="form-group">
        <label class="form-label">Operation</label>
        <select id="adj-op">
          <option value="add">➕ Add</option>
          <option value="subtract">➖ Subtract</option>
          <option value="set">📌 Set to</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Amount ($)</label>
        <input type="number" id="adj-amt" placeholder="0.00" step="0.01" min="0" required>
      </div>
      <div class="form-group">
        <label class="form-label">Note</label>
        <input id="adj-note" placeholder="Reason for adjustment…">
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="adj-submit-btn">
          <i class="fas fa-check"></i> Apply
        </button>
      </div>
    </form>
  `);
}

async function submitAdjustBalance(event, id, current) {
  event.preventDefault();
  
  try {
    const op = document.getElementById('adj-op')?.value || 'add';
    const amt = parseFloat(document.getElementById('adj-amt')?.value) || 0;
    
    if (amt <= 0) {
      toast('Please enter a valid amount', 'error');
      return;
    }
    
    let newBal = current || 0;
    if (op === 'add') newBal = current + amt;
    else if (op === 'subtract') newBal = Math.max(0, current - amt);
    else if (op === 'set') newBal = amt;
    
    const btn = document.getElementById('adj-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Applying...';
    }
    
    const result = await apiFetch(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ balance: Math.round(newBal * 100) / 100 })
    });
    
    if (result) {
      closeModal();
      toast(`✅ Balance updated from $${current.toFixed(2)} to $${newBal.toFixed(2)}`, 'success');
      pgMyClients(1);
    } else {
      toast('Failed to update balance', 'error');
    }
  } catch (err) {
    console.error('Balance update error:', err);
    toast('Error updating balance: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('adj-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Apply';
    }
  }
}

// ── DETAILED SMS REPORTS (CDR) ──────────────────────────────────────
let cdrPerPage = 25;
let cdrGroupBy = '';
async function pgDetailedSms(page = 1) {
  try {
    const dateFrom = document.getElementById('cdr-from')?.value || new Date().toISOString().split('T')[0];
    const dateTo = document.getElementById('cdr-to')?.value || new Date().toISOString().split('T')[0];
    const rangeFilter = document.getElementById('cdr-range')?.value || '';
    const numSearch = document.getElementById('cdr-num')?.value || '';
    const cliSearch = document.getElementById('cdr-cli')?.value || '';
    const q = document.getElementById('cdr-q')?.value || '';
    cdrGroupBy = document.querySelector('input[name="cdr-group"]:checked')?.value || '';

    const [ranges, data] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges'),
      (async () => {
        const limitParam = cdrPerPage === 'all' ? 100000 : cdrPerPage;
        const params = new URLSearchParams();
        params.append('page', cdrPerPage === 'all' ? 1 : page);
        params.append('limit', limitParam);
        params.append('date_from', dateFrom);
        params.append('date_to', dateTo);
        params.append('agent_id', AGENT_ID);
        if (rangeFilter) params.append('range', rangeFilter);
        if (numSearch) params.append('search', numSearch);
        if (cliSearch) params.append('cli', cliSearch);
        if (q && !numSearch) params.append('search', q);
        if (cdrGroupBy) params.append('group_by', cdrGroupBy);
        return apiFetch(`/api/sms/logs?${params.toString()}`);
      })()
    ]);

    const rangesList = ranges || [];
    const logs = data?.data || [];
    const total = data?.total || 0;
    const grouped = !!data?.grouped;
    const perPage = cdrPerPage === 'all' ? (total || 1) : cdrPerPage;
    const rangeLookup = {}; rangesList.forEach(r => rangeLookup[`${r.country}|${r.provider}`] = r);

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS CDR Stats</div><div class="page-subtitle">Home &gt; SMS CDR Stats</div></div>
      </div>
      <div class="card">
        <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="date" id="cdr-from" value="${dateFrom}">
          <input type="date" id="cdr-to" value="${dateTo}">
          <select id="cdr-range" style="min-width:140px;">
            <option value="">Filter Range</option>
            ${rangesList.map(r => `<option value="${r.id}" ${rangeFilter == r.id ? 'selected' : ''}>${r.country || ''} ${r.prefix || ''}</option>`).join('')}
          </select>
          <input id="cdr-num" placeholder="Search Number or Message" value="${numSearch}">
          <input id="cdr-cli" placeholder="Search CLI" value="${cliSearch}">
        </div>
        <div class="filters-bar" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px;">
          <span style="font-size:12px;color:var(--text-muted);font-weight:600;">Group By:</span>
          ${['date','month','range','client','number','cli'].map(g => `
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
              <input type="radio" name="cdr-group" value="${g}" ${cdrGroupBy === g ? 'checked' : ''} onchange="cdrGroupBy=this.value;pgDetailedSms(1)"> ${g.charAt(0).toUpperCase()+g.slice(1)}
            </label>`).join('')}
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
            <input type="radio" name="cdr-group" value="" ${cdrGroupBy === '' ? 'checked' : ''} onchange="cdrGroupBy='';pgDetailedSms(1)"> None
          </label>
          <div style="margin-left:auto;display:flex;gap:8px;">
            <button class="btn btn-warning btn-sm" onclick="exportCDR()"><i class="fas fa-download"></i> Export Report</button>
            <button class="btn btn-primary btn-sm" onclick="pgDetailedSms(1)"><i class="fas fa-chart-bar"></i> Show Report</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="dt-toolbar" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="cdrPerPage=this.value==='all'?'all':parseInt(this.value);pgDetailedSms(1)" style="width:80px;">
              <option value="25" ${cdrPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${cdrPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${cdrPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${cdrPerPage === 500 ? 'selected' : ''}>500</option>
              <option value="all" ${cdrPerPage === 'all' ? 'selected' : ''}>All</option>
            </select>
            <span style="font-size:13px;color:var(--text-muted);">entries</span>
            <button class="btn btn-outline btn-sm" onclick="copyCdr()"><i class="fas fa-copy"></i> Copy</button>
            <button class="btn btn-outline btn-sm" onclick="exportCdrCsv()"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportCdrPdf()"><i class="fas fa-file-pdf"></i> PDF</button>
            <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:13px;color:var(--text-muted);">Search:</label>
            <input id="cdr-q" value="${q}" onkeyup="if(event.key==='Enter') pgDetailedSms(1)">
          </div>
        </div>

        ${grouped ? buildTable(
          [cdrGroupBy.charAt(0).toUpperCase()+cdrGroupBy.slice(1), 'SMS Count', 'My Payout'],
          logs.map(g => [g.key || '—', g.sms_count || 0, `$${Number(g.payout || 0).toFixed(4)}`])
        ) : buildTable(
          ['DATE', 'RANGE', 'NUMBER', 'CLI', 'SMS', 'CURRENCY', 'MY PAYOUT'],
          logs.map(s => {
            const rInfo = rangeLookup[`${s.country}|${s.provider}`];
            return [
              fmtShort(s.timestamp),
              rInfo?.range_name || `${s.country || ''}-${s.provider || ''}`,
              `<span class="monospace">${s.number || '—'}</span>`,
              s.cli || '—',
              `<span class="text-muted">${s.message || '—'}</span>`,
              'USD',
              `<span class="text-success">$${(s.profit || 0).toFixed ? (s.profit || 0).toFixed(4) : s.profit}</span>`
            ];
          })
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((page-1)*perPage+1, total)} to ${Math.min(page*perPage, total)} of ${total} entries</span>
          ${cdrPerPage === 'all' ? '' : pagination(page, total, perPage, pgDetailedSms)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Detailed SMS error:', err);
    toast('Failed to load SMS logs', 'error');
  }
}

function copyCdr() {
  const rows = Array.from(document.querySelectorAll('.table-wrap:last-of-type tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()).join('\t')
  );
  navigator.clipboard.writeText(rows.join('\n')).then(() => toast('Copied', 'success')).catch(() => toast('Copy failed', 'error'));
}
function exportCdrCsv() {
  const rows = Array.from(document.querySelectorAll('.table-wrap:last-of-type tr')).map(tr =>
    Array.from(tr.querySelectorAll('th,td')).map(c => `"${c.textContent.trim().replace(/"/g,'""')}"`).join(',')
  );
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `sms_cdr_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}
function exportCdrPdf() {
  const win = window.open('', '_blank');
  const table = document.querySelector('.table-wrap:last-of-type')?.outerHTML || '';
  win.document.write(`<html><head><title>SMS CDR Stats</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:6px;font-size:12px;}</style></head><body><h2>SMS CDR Stats</h2>${table}<script>window.onload=()=>window.print();</script></body></html>`);
  win.document.close();
}

function exportCDR() {
  toast('CDR export started…', 'info');
}

// ── SUMMARY SMS REPORTS ───────────────────────────────────────────
async function pgSummarySms() {
  try {
    const stats = await apiFetch(`/api/sms/stats?agent_id=${AGENT_ID}`);
    if (!stats) {
      toast('Failed to load stats', 'error');
      return;
    }

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Summary SMS Reports</div><div class="page-subtitle">Daily and monthly totals</div></div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
        ${statCard('Total SMS', 'fas fa-comment-sms', stats.total_sms || 0, 'cyan', '')}
        ${statCard('Delivered', 'fas fa-circle-check', stats.delivered || 0, 'green', '')}
        ${statCard('Failed', 'fas fa-circle-xmark', stats.failed || 0, 'red', '')}
        ${statCard('Revenue', 'fas fa-dollar-sign', '$' + (stats.total_profit || 0), 'yellow', '')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Monthly Summary</div></div>
        ${buildTable(['Month', 'SMS Count', 'Delivered', 'Failed', 'Revenue', 'Success %'], 
          (stats.monthly_data || []).map(m => [
            m.month || '—',
            m.count || 0,
            m.delivered || 0,
            m.failed || 0,
            '$' + (m.revenue || 0),
            m.success_rate ? m.success_rate + '%' : '—'
          ])
        )}
      </div>
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><div class="card-title">Hourly Traffic (Today)</div></div>
        <div class="chart-container"><canvas id="summary-chart"></canvas></div>
      </div>
    `;

    try {
      const ctx = document.getElementById('summary-chart');
      const trafficData = stats.hourly_traffic || Array.from({ length: 24 }, () => 0);
      if (ctx && typeof Chart !== 'undefined') {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{
              data: trafficData,
              label: 'SMS/hr',
              backgroundColor: 'rgba(51,65,85,0.2)',
              borderColor: '#334155',
              borderWidth: 1,
              borderRadius: 3
            }]
          },
          options: chartOpts()
        });
      }
    } catch (err) {
      console.warn('Chart render error:', err);
    }
  } catch (err) {
    console.error('Summary SMS error:', err);
    toast('Failed to load summary', 'error');
  }
}

// ── CLIENT SMS STATS ──────────────────────────────────────────────
let clientStatsPerPage = 25;
let clientStatsRows = [];
async function pgClientSmsStats(page = 1) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateFrom = document.getElementById('cs-from')?.value || todayStr;
    const dateTo = document.getElementById('cs-to')?.value || todayStr;
    const clientFilter = document.getElementById('cs-client')?.value || '';
    const searchQuery = document.getElementById('cs-search')?.value || '';

    const [clientsData, rateCardData] = await Promise.all([
      apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=1000`),
      apiFetch('/api/numbers/rate-card')
    ]);
    const clients = clientsData?.data || [];
    const rateCard = rateCardData || [];
    const rateLookup = {}; rateCard.forEach(r => rateLookup[`${r.country}|${r.provider}`] = r);

    // Pull SMS logs once for the selected date range and aggregate per client username
    const logParams = new URLSearchParams();
    logParams.append('limit', '100000');
    logParams.append('date_from', dateFrom);
    logParams.append('date_to', dateTo);
    const logsData = await apiFetch(`/api/sms/logs?${logParams.toString()}`);
    const logs = logsData?.data || [];

    let scopedClients = clientFilter ? clients.filter(c => String(c.id) === clientFilter) : clients;

    let rows = scopedClients.map(c => {
      const clientLogs = logs.filter(l => (l.user || '').toLowerCase() === (c.username || '').toLowerCase());
      const smsCount = clientLogs.length;
      const myPayout = clientLogs.reduce((sum, l) => sum + (l.profit || 0), 0);
      const clientPayout = clientLogs.reduce((sum, l) => {
        const rate = rateLookup[`${l.country}|${l.provider}`];
        return sum + (rate ? rate.sell_rate : 0);
      }, 0);
      return { username: c.username || '—', smsCount, myPayout, clientPayout };
    }).filter(r => r.smsCount > 0 || clientFilter);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => r.username.toLowerCase().includes(q));
    }

    clientStatsRows = rows;
    const total = rows.length;
    const perPage = clientStatsPerPage === 'all' ? (total || 1) : clientStatsPerPage;
    const totalPages = clientStatsPerPage === 'all' ? 1 : (Math.ceil(total / perPage) || 1);
    const pageRows = clientStatsPerPage === 'all' ? rows : rows.slice((page - 1) * perPage, page * perPage);

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Client SMS Stats</div><div class="page-subtitle">Stats &amp; Reports &gt; Client SMS Stats</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="date" id="cs-from" value="${dateFrom}">
          <input type="date" id="cs-to" value="${dateTo}">
          ${zySelectSearch('cs-client', 'Search clients…')}
          <select id="cs-client" style="min-width:150px;">
            <option value="">Filter Client</option>
            ${clients.map(c => `<option value="${c.id}" ${clientFilter == c.id ? 'selected' : ''}>${c.username}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="pgClientSmsStats(1)"><i class="fas fa-chart-bar"></i> Show Report</button>
        </div>
      </div>
      <div class="card">
        <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <span style="font-size:13px;color:var(--text-muted);">Show</span>
          <select id="cs-pp" onchange="clientStatsPerPage=this.value==='all'?'all':parseInt(this.value);pgClientSmsStats(1)" style="width:80px;">
            <option value="25" ${clientStatsPerPage === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${clientStatsPerPage === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${clientStatsPerPage === 100 ? 'selected' : ''}>100</option>
            <option value="500" ${clientStatsPerPage === 500 ? 'selected' : ''}>500</option>
            <option value="all" ${clientStatsPerPage === 'all' ? 'selected' : ''}>All</option>
          </select>
          <span style="font-size:13px;color:var(--text-muted);">entries</span>
          <button class="btn btn-outline btn-sm" onclick="copyClientStats()"><i class="fas fa-copy"></i> Copy</button>
          <button class="btn btn-outline btn-sm" onclick="exportClientStatsCsv()"><i class="fas fa-file-csv"></i> CSV</button>
          <button class="btn btn-outline btn-sm" onclick="toast('Excel export uses CSV format', 'info');exportClientStatsCsv()"><i class="fas fa-file-excel"></i> Excel</button>
          <button class="btn btn-outline btn-sm" onclick="exportClientStatsPdf()"><i class="fas fa-file-pdf"></i> PDF</button>
          <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
          <input id="cs-search" placeholder="Search" value="${searchQuery}" onkeyup="if(event.key==='Enter') pgClientSmsStats(1)" style="margin-left:auto;width:160px;">
        </div>
        ${buildTable(
          ['CLIENT', 'SMS', 'CURRENCY', 'MY PAYOUT', 'CLIENT PAYOUT'],
          pageRows.length ? pageRows.map(r => [
            `<strong>${r.username}</strong>`,
            r.smsCount,
            'USD',
            `<span class="text-success">$${r.myPayout.toFixed(4)}</span>`,
            `<span class="text-success">$${r.clientPayout.toFixed(4)}</span>`
          ]) : []
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((page-1)*perPage+1, total)} to ${Math.min(page*perPage, total)} of ${total} entries</span>
          ${clientStatsPerPage === 'all' ? '' : paginationWithNumbers(page, totalPages, pgClientSmsStats)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Client SMS stats error:', err);
    toast('Failed to load client stats', 'error');
  }
}

function copyClientStats() {
  const text = clientStatsRows.map(r => `${r.username}\t${r.smsCount}\tUSD\t$${r.myPayout.toFixed(4)}\t$${r.clientPayout.toFixed(4)}`).join('\n');
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'success'))
    .catch(() => toast('Copy failed', 'error'));
}
function exportClientStatsCsv() {
  const headers = ['Client', 'SMS', 'Currency', 'My Payout', 'Client Payout'];
  const rows = clientStatsRows.map(r => [r.username, r.smsCount, 'USD', r.myPayout.toFixed(4), r.clientPayout.toFixed(4)]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `client_sms_stats_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}
function exportClientStatsPdf() {
  const headers = ['Client', 'SMS', 'Currency', 'My Payout', 'Client Payout'];
  const rows = clientStatsRows.map(r => [r.username, r.smsCount, 'USD', '$' + r.myPayout.toFixed(4), '$' + r.clientPayout.toFixed(4)]);
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Client SMS Stats</title>
    <style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px;} th{background:#f0f0f0;}</style>
    </head><body>
    <h2>Client SMS Stats</h2>
    <table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </table>
    <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  win.document.close();
}

// ── SMS RANGE STATS ───────────────────────────────────────────────
async function pgSmsRangeStats() {
  try {
    const ranges = await apiFetch('/api/numbers/sms-ranges') || [];

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS Range Stats</div><div class="page-subtitle">Performance per range</div></div>
      </div>
      <div class="card">
        ${buildTable(
          ['Range', 'Country', 'Provider', 'SMS Count', 'Revenue', 'Avg Latency', 'Success %', 'Status'],
          ranges.map(r => {
            const count = r.sms_count || 0;
            const revenue = (count * (r.payout || 0));
            return [
              r.prefix || '—',
              r.country || '—',
              r.provider || '—',
              count.toLocaleString(),
              `$${revenue.toFixed(2)}`,
              r.avg_latency || '—',
              r.success_rate || '—',
              statusBadge(r.active ? 'active' : 'inactive')
            ];
          })
        )}
      </div>
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><div class="card-title">Top Ranges by Volume</div></div>
        <div class="chart-container"><canvas id="range-chart"></canvas></div>
      </div>
    `;

    try {
      const ctx = document.getElementById('range-chart');
      if (ctx && ranges.length && typeof Chart !== 'undefined') {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ranges.map(r => (r.country || '') + ' ' + (r.prefix || '')),
            datasets: [{
              data: ranges.map(r => r.sms_count || 0),
              label: 'SMS Count',
              backgroundColor: 'rgba(51,65,85,0.2)',
              borderColor: '#334155',
              borderWidth: 1,
              borderRadius: 3
            }]
          },
          options: chartOpts()
        });
      }
    } catch (err) {
      console.warn('Chart render error:', err);
    }
  } catch (err) {
    console.error('Range stats error:', err);
    toast('Failed to load range stats', 'error');
  }
}

// ── SMS NUMBER STATS ──────────────────────────────────────────────
async function pgSmsNumberStats() {
  try {
    const data = await apiFetch('/api/numbers?limit=20');
    const numbers = data?.data || [];

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS Number Stats</div><div class="page-subtitle">Per-number performance</div></div>
      </div>
      <div class="card">
        ${buildTable(
          ['Number', 'Country', 'Provider', 'SMS Count', 'Revenue', 'Last Active', 'Status'],
          numbers.map(n => [
            `<span class="monospace">${n.number || '—'}</span>`,
            n.country || '—',
            n.provider || '—',
            (n.sms_count || 0).toLocaleString(),
            `$${((n.sms_count || 0) * 0.003).toFixed(4)}`,
            fmtShort(n.last_sms),
            statusBadge(n.status)
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Number stats error:', err);
    toast('Failed to load number stats', 'error');
  }
}

// ── CREDIT NOTES ──────────────────────────────────────────────────
async function pgCreditNotes() {
  try {
    const data = await apiFetch(`/api/credit-notes?agent_id=${AGENT_ID}`);
    const notes = data?.data || [];

    const totalCredits = notes.length;
    const confirmed = notes.filter(n => n.status === 'confirmed').length;
    const pending = notes.filter(n => n.status === 'pending').length;
    const totalAmount = notes.reduce((s, n) => s + (n.amount || 0), 0);

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">My Credit Notes</div><div class="page-subtitle">Commission and bonus credits</div></div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
        ${statCard('Total Credits', 'fas fa-file-invoice', totalCredits, 'cyan', '')}
        ${statCard('Confirmed', 'fas fa-circle-check', confirmed, 'green', `$${totalAmount.toFixed(2)}`)}
        ${statCard('Pending', 'fas fa-clock', pending, 'yellow', 'Awaiting confirmation')}
      </div>
      <div class="card">
        ${buildTable(
          ['#', 'Date', 'Amount', 'Currency', 'Reason', 'Status', 'Actions'],
          notes.map(n => [
            n.id || '—',
            n.date || '—',
            `<strong class="text-success">$${n.amount || 0}</strong>`,
            badge(n.currency || 'USD', 'blue'),
            n.reason || '—',
            statusBadge(n.status),
            `<button class="btn btn-outline btn-sm" onclick="toast('Credit note downloaded', 'success')">
              <i class="fas fa-download"></i> Download
            </button>`
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Credit notes error:', err);
    toast('Failed to load credit notes', 'error');
  }
}

// ── PAYMENT REQUESTS ──────────────────────────────────────────────
// ── PAYOUT INVOICE (PDF via print) ─────────────────────────────────
function downloadPayoutInvoice(r) {
  const invoiceNo = `MAIT-INV-${String(r.id).padStart(5, '0')}`;
  const dateStr = fmtShort(r.paid_at || r.timestamp);
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>${invoiceNo}</title>
    <style>
      body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#222;max-width:700px;margin:0 auto;}
      .inv-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:20px;margin-bottom:30px;}
      .inv-logo{font-size:22px;font-weight:800;}
      .inv-logo span{color:#1e293b;}
      .inv-meta{text-align:right;font-size:13px;color:#666;}
      .inv-title{font-size:28px;font-weight:700;margin-bottom:4px;}
      table{width:100%;border-collapse:collapse;margin-top:20px;}
      th{background:#f5f6fa;text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase;color:#666;}
      td{padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;}
      .inv-total{font-size:20px;font-weight:800;color:#2ba84a;text-align:right;margin-top:20px;}
      .inv-footer{margin-top:40px;font-size:11px;color:#999;text-align:center;}
      .paid-stamp{display:inline-block;border:2px solid #2ba84a;color:#2ba84a;padding:4px 14px;border-radius:6px;font-weight:700;font-size:12px;letter-spacing:1px;}
    </style></head>
    <body>
      <div class="inv-header">
        <div>
          <div class="inv-logo">𝑴𝑨𝑰𝑻<span>SMS</span></div>
          <div class="inv-title" style="margin-top:14px;">Payout Invoice</div>
          <span class="paid-stamp">✔ PAID</span>
        </div>
        <div class="inv-meta">
          <div><strong>${invoiceNo}</strong></div>
          <div>Date: ${dateStr}</div>
        </div>
      </div>
      <table>
        <tr><th>Paid To</th><th>Method</th><th>Wallet / Account</th><th>Request #</th></tr>
        <tr>
          <td>${r.user || '—'}</td>
          <td>${r.method || '—'}</td>
          <td style="font-family:monospace;font-size:12px;">${r.wallet || '—'}</td>
          <td>#${r.id}</td>
        </tr>
      </table>
      <div class="inv-total">Total Paid: $${(r.amount || 0).toFixed(2)}</div>
      <div class="inv-footer">Generated by 𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 Panel · This is a system-generated payout invoice.</div>
      <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  win.document.close();
}

async function pgPaymentRequests() {
  try {
    const [data, agentData] = await Promise.all([
      apiFetch('/api/payout-requests'),
      apiFetch(`/api/agents/${AGENT_ID}`)
    ]);
    const requests = (data?.data || []).filter(r => String(r.user_id) === String(AGENT_ID));

    const totalAvailable = agentData?.balance || 0;
    const pendingTotal = requests.filter(r => r.status === 'pending').reduce((s, r) => s + (r.amount || 0), 0);
    const totalPaid = requests.filter(r => r.status === 'paid').reduce((s, r) => s + (r.amount || 0), 0);

    const weeklyData = await apiFetch(`/api/agents/${AGENT_ID}/weekly-earnings?weeks=8`);
    const weeks = weeklyData?.data || [];
    const currentWeek = weeks.find(w => w.status === 'in_progress');
    const completedWeeks = weeks.filter(w => w.status === 'completed');

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Payment Requests</div><div class="page-subtitle">Withdraw your earnings</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="openNewPaymentModal()">
            <i class="fas fa-plus"></i> New Request
          </button>
        </div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
        ${statCard('Available', 'fas fa-dollar-sign', '$' + totalAvailable.toFixed(2), 'green', 'Ready to withdraw')}
        ${statCard('Pending', 'fas fa-clock', '$' + pendingTotal.toFixed(2), 'yellow', 'Processing')}
        ${statCard('Total Paid', 'fas fa-circle-check', '$' + totalPaid.toFixed(2), 'blue', 'All time')}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><div class="card-title">Weekly Earnings (Invoice)</div></div>
        <p class="text-muted" style="font-size:12px;margin-bottom:10px;">
          Auto-calculated from your clients' SMS traffic at ${weeklyData?.commission_rate ?? 5}% commission.
          Each week (Mon–Sun) closes out automatically and appears below once it ends.
        </p>
        ${currentWeek ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-hover);border-radius:8px;margin-bottom:10px;">
            <div>
              <div style="font-size:13px;color:var(--text-muted);">This week (${currentWeek.start} → ${currentWeek.end}) — in progress</div>
              <div style="font-weight:700;">${currentWeek.sms_count} SMS so far</div>
            </div>
            <div class="text-success" style="font-weight:700;font-size:16px;">$${currentWeek.earnings.toFixed(2)}</div>
          </div>
        ` : ''}
        ${buildTable(
          ['Week', 'Period', 'SMS Count', 'Earnings', 'Status', ''],
          completedWeeks.map(w => [
            w.week,
            `${w.start} → ${w.end}`,
            w.sms_count,
            `<strong class="text-success">$${w.earnings.toFixed(2)}</strong>`,
            badge('Invoice Ready', 'green'),
            `<button class="btn btn-primary btn-sm" onclick="openNewPaymentModal(${w.earnings})"><i class="fas fa-paper-plane"></i> Request Payout</button>`
          ])
        )}
      </div>

      <div class="card">
        ${buildTable(
          ['#', 'Amount', 'Method', 'Wallet', 'Status', 'Date', 'Actions'],
          requests.map(r => [
            r.id || '—',
            `<strong class="text-success">$${r.amount || 0}</strong>`,
            badge(r.method || '—', 'blue'),
            `<span class="monospace text-muted" style="font-size:11px;">${r.wallet || '—'}</span>`,
            statusBadge(r.status),
            fmtShort(r.timestamp),
            r.status === 'pending' ? badge('Processing…', 'yellow') :
              (r.status === 'paid' ? `<button class="btn btn-outline btn-sm" onclick='downloadPayoutInvoice(${JSON.stringify(r)})'><i class="fas fa-file-invoice"></i> Invoice</button>` : '—')
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Payment requests error:', err);
    toast('Failed to load payment requests', 'error');
  }
}

let _minPayout = 0;
let _availableBalance = 0;
async function openNewPaymentModal(prefillAmount) {
  const [minData, agentData] = await Promise.all([
    apiFetch('/api/settings/min-payout'),
    apiFetch(`/api/agents/${AGENT_ID}`)
  ]);
  _minPayout = minData?.min_payout ?? 0;
  _availableBalance = agentData?.balance ?? 0;

  if (_availableBalance <= 0) {
    openModal('New Payment Request', `
      <div class="empty-state" style="padding:24px 10px;">
        <i class="fas fa-circle-exclamation" style="font-size:32px;color:var(--yellow-light);margin-bottom:12px;display:block;"></i>
        <p style="font-weight:600;margin-bottom:6px;">You don't have any payment available</p>
        <p class="text-muted fs-12">Your current balance is $0.00 — you'll be able to request a payout once you have earnings.</p>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" style="width:100%;" onclick="closeModal()">Close</button>
      </div>
    `);
    return;
  }

  openModal('New Payment Request', `
    <p class="text-muted fs-12" style="margin-bottom:10px;">Available balance: <strong class="text-success">$${_availableBalance.toFixed(2)}</strong></p>
    <div class="form-group"><label class="form-label">Amount (USD)</label>
      <input type="number" id="pr-amt" placeholder="Minimum $${_minPayout.toFixed(2)}" min="${_minPayout}" max="${_availableBalance}" step="0.01" value="${prefillAmount ? prefillAmount.toFixed(2) : ''}">
      <small class="text-muted">Minimum payout: $${_minPayout.toFixed(2)} · Max: $${_availableBalance.toFixed(2)}</small></div>
    <div class="form-group"><label class="form-label">Payment Method</label>
      <select id="pr-method">
        <option>USDT (TRC-20)</option><option>USDT (ERC-20)</option>
        <option>Bank Transfer</option><option>PayPal</option><option>Wise</option>
      </select></div>
    <div class="form-group"><label class="form-label">Wallet / Account</label>
      <input id="pr-wallet" placeholder="Your wallet address or account number"></div>
    <div class="form-group"><label class="form-label">Note</label>
      <input id="pr-note" placeholder="Optional note…"></div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitPaymentRequest()"><i class="fas fa-paper-plane"></i> Submit</button>
    </div>
  `);
}

async function submitPaymentRequest() {
  try {
    const amt = parseFloat(document.getElementById('pr-amt')?.value);
    const method = document.getElementById('pr-method')?.value || 'USDT';
    const wallet = document.getElementById('pr-wallet')?.value || '';
    
    if (!amt || amt < _minPayout) {
      toast(`Payment low — minimum payout is $${_minPayout.toFixed(2)}`, 'error');
      return;
    }
    if (_availableBalance <= 0) {
      toast(`You don't have any payment available — your balance is $0.00`, 'error');
      return;
    }
    if (amt > _availableBalance) {
      toast(`Insufficient payment — your available balance is only $${_availableBalance.toFixed(2)}`, 'error');
      return;
    }
    if (!wallet) {
      toast('Wallet/account required', 'error');
      return;
    }
    
    const result = await apiFetch('/api/payout-requests', {
      method: 'POST',
      body: JSON.stringify({
        user_id: AGENT_ID,
        amount: amt,
        method,
        wallet,
        status: 'pending'
      })
    });
    
    if (result && result.id) {
      closeModal();
      toast('Payment request submitted!', 'success');
      pgPaymentRequests();
    } else {
      toast('Failed to submit request', 'error');
    }
  } catch (err) {
    console.error('Submit payment error:', err);
    toast('Error submitting request', 'error');
  }
}

// ── BANK ACCOUNTS ─────────────────────────────────────────────────
function pgBankAccounts() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Bank Accounts</div><div class="page-subtitle">Manage payment methods</div></div>
      <div class="page-actions">
        <button class="btn btn-primary btn-sm" onclick="openAddBankModal()"><i class="fas fa-plus"></i> Add Account</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div class="fw-600">USDT (TRC-20)</div>
            <div class="text-muted fs-12">Primary Crypto</div>
          </div>
          ${badge('Primary', 'green')}
        </div>
        <div class="code-block" style="font-size:11px;margin-bottom:12px;">TXxxxxxx…xxxxxx</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" style="flex:1"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn btn-danger btn-sm" onclick="toast('Account removed', 'warning')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div class="fw-600">Bank Transfer</div>
            <div class="text-muted fs-12">EU Bank</div>
          </div>
          ${badge('Secondary', 'gray')}
        </div>
        <div class="code-block" style="font-size:11px;margin-bottom:12px;">IBAN: GB29NWBK…</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" style="flex:1"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn btn-danger btn-sm" onclick="toast('Account removed', 'warning')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `;
}

function openAddBankModal() {
  openModal('Add Payment Method', `
    <div class="form-group"><label class="form-label">Type</label>
      <select id="ba-type">
        <option>USDT (TRC-20)</option><option>USDT (ERC-20)</option>
        <option>Bitcoin (BTC)</option><option>Bank Transfer</option>
        <option>PayPal</option><option>Wise</option>
      </select></div>
    <div class="form-group"><label class="form-label">Label</label>
      <input id="ba-label" placeholder="e.g. My Binance Wallet"></div>
    <div class="form-group"><label class="form-label">Address / Account Number</label>
      <input id="ba-addr" placeholder="Wallet address or IBAN"></div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="closeModal();toast('Account added', 'success')">Add</button>
    </div>
  `);
}

// ── STATEMENTS ────────────────────────────────────────────────────
async function pgStatements(currency, symbol) {
  try {
    const data = await apiFetch(`/api/statements?currency=${currency}&agent_id=${AGENT_ID}`);
    const statements = data?.data || [];
    
    const totalCredit = statements.reduce((s, r) => s + (r.credit || 0), 0);
    const totalDebit = statements.reduce((s, r) => s + (r.debit || 0), 0);

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">${currency} Statements</div>
        <div class="page-subtitle">Monthly balance statements in ${currency}</div></div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
        ${statCard('Total Credit', 'fas fa-arrow-down-to-line', symbol + totalCredit.toFixed(2), 'green', 'All time')}
        ${statCard('Total Debit', 'fas fa-arrow-up-from-line', symbol + totalDebit.toFixed(2), 'red', 'Fees')}
        ${statCard('Net Balance', 'fas fa-scale-balanced', symbol + (totalCredit - totalDebit).toFixed(2), 'cyan', 'Available')}
      </div>
      <div class="card">
        ${buildTable(['Month', 'SMS Count', 'Credit', 'Debit', 'Net Balance', 'Download'],
          statements.map(s => [
            s.month || '—',
            s.sms_count || 0,
            `<span class="text-success">${symbol}${s.credit || 0}</span>`,
            `<span class="text-danger">${symbol}${s.debit || 0}</span>`,
            `<strong>${symbol}${(s.credit || 0) - (s.debit || 0)}</strong>`,
            `<button class="btn btn-outline btn-sm" onclick="toast('Statement downloaded', 'success')">
              <i class="fas fa-download"></i> PDF
            </button>`
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Statements error:', err);
    toast('Failed to load statements', 'error');
  }
}

// ── NEWS FOR CLIENTS ──────────────────────────────────────────────
async function pgNewsClients() {
  try {
    const result = await apiFetch(buildAnnouncementsUrl('Agent', AGENT_ID, AGENT_USER.manager_id));
    const news = result?.data || [];

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">News for Clients</div><div class="page-subtitle">Sent to your own Clients only</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="openNewAgentAnnouncementModal()"><i class="fas fa-plus"></i> New Post</button>
        </div>
      </div>
      ${news.length ? news.map(a => `
        <div class="card" style="margin-bottom:14px;border-left:3px solid var(--${a.type === 'warning' ? 'yellow-light' : a.type === 'success' ? 'green-light' : 'accent'});">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              ${badge(a.type, a.type === 'warning' ? 'yellow' : a.type === 'success' ? 'green' : 'blue')}
              <strong>${a.title || '—'}</strong>
              ${a.sender_role && a.sender_role !== 'Agent' ? badge(`From ${a.sender_role}`, 'purple') : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="text-muted fs-12">${fmtShort(a.created)}</span>
              ${a.sender_role === 'Agent' && a.sender_id === AGENT_ID ? `<button class="btn-icon" onclick="deleteAgentAnnouncement(${a.id})" title="Delete"><i class="fas fa-trash" style="color:var(--red-light);"></i></button>` : ''}
            </div>
          </div>
          <p class="text-secondary">${a.body || ''}</p>
        </div>
      `).join('') : `<div class="empty-state"><i class="fas fa-inbox"></i><p>No news yet</p></div>`}
    `;
  } catch (err) {
    console.error('News error:', err);
    toast('Failed to load news', 'error');
  }
}

function openNewAgentAnnouncementModal() {
  openModal('New Announcement', `
    <p class="text-muted" style="font-size:12px;margin-bottom:12px;">This will be visible to your own Clients only.</p>
    <form onsubmit="submitAgentAnnouncement(event)">
      <div class="form-group"><label class="form-label">Title *</label><input id="ag-ann-title" placeholder="Announcement title" required></div>
      <div class="form-group"><label class="form-label">Body *</label><textarea id="ag-ann-body" rows="4" placeholder="Announcement content" required></textarea></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select id="ag-ann-type">
          <option value="info">Information</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
        </select></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Post</button>
      </div>
    </form>
  `);
}

async function submitAgentAnnouncement(event) {
  event.preventDefault();
  const title = document.getElementById('ag-ann-title')?.value.trim();
  const body = document.getElementById('ag-ann-body')?.value.trim();
  const type = document.getElementById('ag-ann-type')?.value;
  if (!title || !body) { toast('Title and body are required', 'error'); return; }

  const result = await apiFetch('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, body, type, sender_role: 'Agent', sender_id: AGENT_ID, sender_username: AGENT_USER.username })
  });
  if (!result) return;
  closeModal();
  toast('Announcement posted!', 'success');
  pgNewsClients();
}

async function deleteAgentAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
  toast('Deleted', 'warning');
  pgNewsClients();
}

// ── PROFILE ───────────────────────────────────────────────────────
function pgProfile() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header"><div><div class="page-title">My Profile</div></div></div>
    <div class="two-col">
      <div class="card">
        <div style="text-align:center;padding:20px 0;">
          <div style="width:72px;height:72px;background:linear-gradient(135deg,#334155,#1e293b);border-radius:50%;
            margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;">
            <i class="fas fa-user-secret"></i>
          </div>
          <div style="font-size:18px;font-weight:700;">${AGENT_USER.username || 'Agent'}</div>
          <div class="text-muted" style="margin-top:4px;">Agent Account</div>
          <div style="margin-top:8px;">${badge('Agent', 'cyan')}</div>
        </div>
        <div class="separator"></div>
        <div class="form-group"><label class="form-label">Current Password</label><input type="password" id="pwd-current" placeholder="Enter current password"></div>
        <div class="form-group"><label class="form-label">New Password</label><input type="password" id="pwd-new" placeholder="Enter new password" minlength="6"></div>
        <div class="form-group"><label class="form-label">Confirm Password</label><input type="password" id="pwd-confirm" placeholder="Confirm new password"></div>
        <div class="form-actions">
          <button class="btn btn-primary" id="pwd-submit-btn" onclick="updateProfile()"><i class="fas fa-lock"></i> Update</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Account Details</div></div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
          ${[
            ['Role', 'Agent', 'cyan'],
            ['Manager', `ID #${AGENT_USER.manager_id || '?'}`, 'purple'],
            ['Commission', (AGENT_USER.commission_rate || 5) + '%', 'yellow'],
            ['Status', 'Active', 'green']
          ].map(([k, v, c]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
              <span class="text-muted">${k}</span>${badge(v, c)}
            </div>
          `).join('')}
        </div>
        <div class="separator"></div>
        <div class="card-header"><div class="card-title">Two-Factor Auth</div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
          <div><div class="fw-600">2FA</div><div class="text-muted fs-12">TOTP authenticator</div></div>
          <input type="checkbox" id="2fa-toggle">
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="setup2fa()"><i class="fas fa-qrcode"></i> Setup 2FA</button>
      </div>
    </div>
  `;
}

async function updateProfile() {
  const btn = document.getElementById('pwd-submit-btn');
  try {
    const currentPwd = document.getElementById('pwd-current')?.value || '';
    const newPwd = document.getElementById('pwd-new')?.value || '';
    const confirmPwd = document.getElementById('pwd-confirm')?.value || '';

    if (!currentPwd || !newPwd || !confirmPwd) {
      toast('Please fill in all password fields', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast('Passwords do not match', 'error');
      return;
    }
    if (newPwd.length < 6) {
      toast('New password must be at least 6 characters', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Updating...'; }

    const result = await apiFetch('/api/account/change-password', {
      method: 'POST',
      body: JSON.stringify({
        role: 'Agent',
        id: AGENT_ID,
        current_password: currentPwd,
        new_password: newPwd
      })
    });
    if (!result) return;

    toast('Password updated successfully', 'success');
    document.getElementById('pwd-current').value = '';
    document.getElementById('pwd-new').value = '';
    document.getElementById('pwd-confirm').value = '';
  } catch (err) {
    console.error('Profile update error:', err);
    toast('Failed to update profile', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-lock"></i> Update'; }
  }
}

function setup2fa() {
  toast('2FA setup initiated. Check your email for instructions.', 'info');
}

// ── MY EARNINGS ───────────────────────────────────────────────────
async function pgMyEarnings() {
  try {
    const stats = await apiFetch(`/api/agent/${AGENT_ID}/earnings`);
    const earnings = stats || {};

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header"><div><div class="page-title">My Earnings</div><div class="page-subtitle">Commission and revenue overview</div></div></div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
        ${statCard('Today', 'fas fa-dollar-sign', '$' + (earnings.today || 0).toFixed(2), 'green', '')}
        ${statCard('This Month', 'fas fa-calendar-days', '$' + (earnings.this_month || 0).toFixed(2), 'blue', '')}
        ${statCard('Last Month', 'fas fa-history', '$' + (earnings.last_month || 0).toFixed(2), 'cyan', '')}
        ${statCard('All Time', 'fas fa-coins', '$' + (earnings.all_time || 0).toFixed(2), 'yellow', '')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Earnings Chart (Last 30 Days)</div></div>
        <div class="chart-container"><canvas id="earn-chart"></canvas></div>
      </div>
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><div class="card-title">Commission Breakdown</div></div>
        ${buildTable(['Date', 'SMS Count', 'Rate', 'Commission', 'Status'],
          (earnings.history || []).map(e => [
            e.date || '—',
            e.sms_count || 0,
            (e.rate || 5) + '%',
            '$' + (e.commission || 0).toFixed(4),
            statusBadge(e.status)
          ])
        )}
      </div>
    `;

    try {
      const ctx = document.getElementById('earn-chart');
      const chartData = earnings.chart_data || Array.from({ length: 30 }, () => 0);
      if (ctx && typeof Chart !== 'undefined') {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`),
            datasets: [{
              data: chartData,
              label: 'Earnings $',
              borderColor: '#334155',
              backgroundColor: 'rgba(51,65,85,0.08)',
              fill: true,
              tension: 0.4,
              pointRadius: 0,
              borderWidth: 2
            }]
          },
          options: chartOpts()
        });
      }
    } catch (err) {
      console.warn('Chart render error:', err);
    }
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
  sessionStorage.removeItem('agent_current_page');
  window.top.location.href = '/login';
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});
resetIdleTimer();

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const lastPage = sessionStorage.getItem('agent_current_page') || 'dashboard';
  loadPage(lastPage);
});