/* ═══════════════════════════════════════════
   Manager Panel — JavaScript (Production Ready v2.0)
   ═══════════════════════════════════════════ */

const API = '';
let MANAGER_ID = null;
let MANAGER_USER = {};

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
    MANAGER_USER = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
    if (!['Manager', 'Admin', 'Owner'].includes(MANAGER_USER.role)) {
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = '/dashboard';
          return;
        }
      } catch (e) {}
      window.location.href = '/dashboard';
      return;
    }
    MANAGER_ID = MANAGER_USER.id;

    const u = MANAGER_USER.username || 'Manager';
    const el = document.getElementById('mgr-username');
    if (el) el.textContent = u;
    const sub = document.getElementById('mgr-name-sub');
    if (sub) sub.textContent = MANAGER_USER.role + ' Account';
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
        'X-Manager-ID': MANAGER_ID || '',
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

  let numsW = '';
  const startW = Math.max(1, current - 2);
  const endW = Math.min(total, current + 2);
  for (let p = startW; p <= endW; p++) {
    numsW += `<button class="${p === current ? 'active' : ''}" onclick="window._pgnCb(${p})">${p}</button>`;
  }

  return `<div class="pagination" style="margin:0;border:none;padding:0;">${first}${prev}${numsW}${next}${last}</div>`;
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
  sessionStorage.setItem('manager_current_page', page);
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
    'agents': pgAgents,
    'add-agent': pgAddAgent,
    'agent-performance': pgAgentPerformance,
    'clients': pgClients,
    'add-client': pgAddClient,
    'client-balances': pgClientBalances,
    'client-limits': pgClientLimits,
    'sms-overview': pgSmsOverview,
    'traffic': pgTraffic,
    'reports': pgReports,
    'news': pgNews,
    'payout-requests': pgPayoutRequests,
    'sms-test-panel': pgSmsTestPanel,
    'api-tokens': pgApiTokens,
    'my-numbers': pgNumbers,
    'assign-numbers': pgAssignNumbers,
    'assign-to-client': pgAssignToClient,
    'profile': pgProfile,
    'my-earnings': pgEarnings
  };

  if (pages[page]) {
    pages[page]();
  } else {
    content.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><p>Page not found</p></div>`;
  }
}

// ═══════════════════════════════════════════════
//  DASHBOARD — UPGRADED with Today, Yesterday, This Week, This Month
// ═══════════════════════════════════════════════

async function pgDashboard() {
  try {
    const [stats, dailyStats] = await Promise.all([
      apiFetch(`/api/manager/${MANAGER_ID}/stats`),
      apiFetch(`/api/sms/daily-stats?manager_id=${MANAGER_ID}`)
    ]);

    if (!stats) {
      toast('Failed to load dashboard stats', 'error');
      return;
    }

    // ── SMS Daily Stats ──
    const todaySms = dailyStats?.today || 0;
    const yesterdaySms = dailyStats?.yesterday || 0;
    const thisWeekSms = dailyStats?.this_week || 0;
    const thisMonthSms = dailyStats?.this_month || 0;

    // ── Traffic data ──
    const trafficData = dailyStats?.weekly_traffic || stats?.traffic_data || Array.from({ length: 7 }, () => 0);
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIndex = new Date().getDay();
    const labels = weekDays.slice(todayIndex).concat(weekDays.slice(0, todayIndex));

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Manager Dashboard</div>
          <div class="page-subtitle">Welcome back, ${MANAGER_USER.username || 'Manager'}</div>
        </div>
        <div class="page-actions">
          <span class="text-muted fs-12" style="margin-right:8px;">
            <i class="fas fa-clock"></i> Updated just now
          </span>
          <button class="btn btn-outline btn-sm" onclick="pgDashboard()">
            <i class="fas fa-sync"></i> Refresh
          </button>
          <button class="btn btn-primary btn-sm" onclick="loadPage('add-agent')">
            <i class="fas fa-user-plus"></i> Add Agent
          </button>
          <button class="btn btn-outline btn-sm" onclick="loadPage('add-client')">
            <i class="fas fa-users"></i> Add Client
          </button>
        </div>
      </div>

      <!-- Date Display -->
      <div style="margin-bottom:20px;font-size:14px;color:var(--text-muted);">
        <i class="fas fa-calendar-day"></i> ${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </div>

      <!-- SMS Stats Grid - 4 Cards -->
      <div class="stats-grid" style="grid-template-columns:1fr;margin-bottom:24px;">
        ${statCard('TODAY\'S SMS', 'fas fa-calendar-day', todaySms, 'green', 'Today')}
        ${statCard('YESTERDAY', 'fas fa-calendar-day', yesterdaySms, 'yellow', 'Yesterday')}
        ${statCard('SMS THIS WEEK', 'fas fa-calendar-week', thisWeekSms, 'blue', 'This week')}
        ${statCard('THIS MONTH', 'fas fa-calendar-alt', thisMonthSms, 'purple', 'This month')}
      </div>

      <!-- Main Stats Grid - 6 Cards -->
      <div class="stats-grid" style="grid-template-columns:1fr;margin-bottom:24px;">
        ${statCard('Total Agents', 'fas fa-user-secret', stats.total_agents || 0, 'purple', (stats.active_agents || 0) + ' active')}
        ${statCard('Total Clients', 'fas fa-users', stats.total_clients || 0, 'blue', (stats.active_clients || 0) + ' active')}
        ${statCard('Total Balance', 'fas fa-dollar-sign', '$' + (stats.total_balance || 0).toFixed(2), 'green', 'Client funds')}
        ${statCard('Revenue Today', 'fas fa-coins', '$' + (stats.revenue_today || 0).toFixed(2), 'yellow', 'Earnings')}
        ${statCard('Total SMS', 'fas fa-comment-sms', stats.total_sms || 0, 'cyan', 'All time')}
        ${statCard('Numbers Assigned', 'fas fa-mobile-screen', stats.numbers_assigned || 0, 'purple', 'Active pool')}
      </div>

      <!-- Chart + Top Agents -->
      <div class="charts-grid">
        <div class="card">
          <div class="card-header"><div class="card-title">24h Traffic</div></div>
          <div class="chart-container" style="height:250px;">
            <canvas id="mgr-traffic-chart"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Top Agents</div>
            <button class="btn btn-outline btn-sm" onclick="loadPage('agents')">View All</button>
          </div>
          ${buildTable(['Agent', 'Clients', 'Numbers', 'Status'],
            (stats.top_agents || []).slice(0, 5).map(a => [
              `<strong>${a.username || '—'}</strong>`,
              a.clients_count || 0,
              a.numbers_assigned || 0,
              statusBadge(a.status)
            ])
          )}
        </div>
      </div>

      <!-- Quick Actions + Hierarchy -->
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Quick Actions</div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0;">
            ${[
              ['Add Agent', 'fas fa-user-plus', 'add-agent', 'primary'],
              ['Add Client', 'fas fa-users', 'add-client', 'primary'],
              ['View Reports', 'fas fa-file-lines', 'reports', 'outline'],
              ['Assign to Agent', 'fas fa-share-from-square', 'assign-numbers', 'outline'],
              ['Assign to Client', 'fas fa-user-check', 'assign-to-client', 'outline'],
              ['Number Pool', 'fas fa-mobile-screen', 'my-numbers', 'outline']
            ].map(([t, i, p, s]) => `
              <button class="btn btn-${s}" style="justify-content:flex-start;gap:10px;" onclick="loadPage('${p}')">
                <i class="${i}"></i>${t}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Hierarchy</div></div>
          <div style="font-size:13px;line-height:2.2;">
            <div style="color:var(--accent);font-weight:700;">
              <i class="fas fa-user-tie" style="margin-right:8px;"></i>${MANAGER_USER.username} (You)
            </div>
            <div style="margin-left:16px;color:var(--text-secondary);">
              <i class="fas fa-sitemap" style="margin-right:6px;color:var(--text-muted);"></i>${stats.total_agents || 0} Agents under you
            </div>
            <div style="margin-left:32px;color:var(--text-muted);">
              <i class="fas fa-users" style="margin-right:6px;"></i>${stats.total_clients || 0} Clients total
            </div>
            <div style="margin-left:32px;color:var(--text-muted);">
              <i class="fas fa-mobile-screen" style="margin-right:6px;"></i>${stats.numbers_assigned || 0} Numbers assigned
            </div>
          </div>
        </div>
      </div>
    `;

    // ── Render Chart ──
    try {
      const ctx = document.getElementById('mgr-traffic-chart');
      if (ctx && typeof Chart !== 'undefined') {
        const chartData = trafficData.length === 24 ? trafficData : Array.from({ length: 24 }, () => 0);
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{
              data: chartData,
              label: 'SMS/hr',
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
    console.error('Dashboard error:', err);
    toast('Failed to load dashboard', 'error');
    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load dashboard. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgDashboard()">Retry</button>
      </div>
    `;
  }
}

// ═══════════════════════════════════════════════
//  AGENTS — COMPLETE UPGRADED
// ═══════════════════════════════════════════════

async function pgAgents(page = 1) {
  try {
    const data = await apiFetch(`/api/agents?page=${page}&limit=20&manager_id=${MANAGER_ID}`);
    if (!data) return;

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">My Agents</div><div class="page-subtitle">${data.total || 0} agents under your management</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="loadPage('add-agent')"><i class="fas fa-user-plus"></i> Add Agent</button>
          <button class="btn btn-outline btn-sm" onclick="pgAgents(1)"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="card">
        <div class="filters-bar">
          <input id="agent-search" placeholder="Search agents..." onkeyup="if(event.key==='Enter') searchAgents()">
          <select id="agent-status-filter" onchange="filterAgents()">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="searchAgents()"><i class="fas fa-search"></i> Search</button>
          <button class="btn btn-outline btn-sm" onclick="resetAgentFilters()"><i class="fas fa-undo"></i> Reset</button>
          <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
            Showing ${Math.min((page - 1) * 20 + 1, data.total)} to ${Math.min(page * 20, data.total)} of ${data.total} entries
          </span>
        </div>
        ${buildTable(
          ['#', 'Username', 'Full Name', 'Email', 'Phone', 'Clients', 'Numbers', 'Today OTP', 'Commission', 'Status', 'Actions'],
          (data.data || []).map(a => [
            a.id || '—',
            `<strong>${a.username || '—'}</strong>`,
            a.full_name || '—',
            a.email || '—',
            a.phone || '—',
            `<span class="badge badge-blue">${a.clients_count || 0}</span>`,
            a.numbers_assigned || 0,
            `<span class="badge badge-green">${a.today_otp || 0}</span>`,
            (a.commission_rate || 0) + '%',
            statusBadge(a.status),
            `<button class="btn btn-outline btn-sm" onclick="openEditAgentModal(${a.id})" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-${a.status === 'active' ? 'warning' : 'success'} btn-sm" onclick="toggleAgent(${a.id},'${a.status}')" title="Toggle Status">
              <i class="fas fa-${a.status === 'active' ? 'pause' : 'play'}"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteAgent(${a.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>`
          ])
        )}
        ${pagination(page, data.total || 0, 20, pgAgents)}
      </div>
    `;
  } catch (err) {
    console.error('Agents error:', err);
    toast('Failed to load agents', 'error');
  }
}

async function searchAgents() {
  const q = document.getElementById('agent-search')?.value || '';
  const status = document.getElementById('agent-status-filter')?.value || '';

  try {
    const data = await apiFetch(`/api/agents?search=${encodeURIComponent(q)}&status=${status}&manager_id=${MANAGER_ID}&limit=50`);
    const wrap = document.querySelector('.table-wrap');
    if (wrap) {
      wrap.outerHTML = buildTable(
        ['#', 'Username', 'Full Name', 'Email', 'Phone', 'Clients', 'Numbers', 'Commission', 'Status', 'Actions'],
        (data?.data || []).map(a => [
          a.id || '—',
          `<strong>${a.username || '—'}</strong>`,
          a.full_name || '—',
          a.email || '—',
          a.phone || '—',
          `<span class="badge badge-blue">${a.clients_count || 0}</span>`,
          a.numbers_assigned || 0,
          (a.commission_rate || 0) + '%',
          statusBadge(a.status),
          `<button class="btn btn-outline btn-sm" onclick="openEditAgentModal(${a.id})"><i class="fas fa-pen"></i></button>
           <button class="btn btn-${a.status === 'active' ? 'warning' : 'success'} btn-sm" onclick="toggleAgent(${a.id},'${a.status}')">
             <i class="fas fa-${a.status === 'active' ? 'pause' : 'play'}"></i>
           </button>
           <button class="btn btn-danger btn-sm" onclick="deleteAgent(${a.id})"><i class="fas fa-trash"></i></button>`
        ])
      );
      toast(`Found ${data?.data?.length || 0} results`, 'info');
    }
  } catch (err) {
    console.error('Search error:', err);
    toast('Search failed', 'error');
  }
}

function filterAgents() {
  searchAgents();
}

function resetAgentFilters() {
  const searchInput = document.getElementById('agent-search');
  const statusSelect = document.getElementById('agent-status-filter');
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = '';
  pgAgents(1);
  toast('Filters reset', 'info');
}

// ── ADD AGENT ─────────────────────────────────────────────────────

function pgAddAgent() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Add New Agent</div><div class="page-subtitle">Create an agent under your management</div></div>
      <div class="page-actions">
        <button class="btn btn-outline btn-sm" onclick="loadPage('agents')"><i class="fas fa-arrow-left"></i> Back to Agents</button>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-header"><div class="card-title">Agent Details</div></div>
        <form id="add-agent-form" onsubmit="submitAddAgent(event)">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Username *</label>
              <input id="a-user" placeholder="agent_name" required minlength="3">
            </div>
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input id="a-name" placeholder="Full Name">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="a-email" placeholder="agent@example.com">
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input id="a-phone" placeholder="+1...">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Password *</label>
              <input type="password" id="a-pass" value="agent123" required minlength="6">
            </div>
            <div class="form-group">
              <label class="form-label">Commission Rate (%)</label>
              <input type="number" id="a-comm" value="5" step="0.5" min="0" max="50">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea id="a-notes" rows="2" placeholder="Optional notes…"></textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-outline" onclick="loadPage('agents')">Cancel</button>
            <button type="submit" class="btn btn-primary" id="a-submit-btn">
              <i class="fas fa-user-plus"></i> Create Agent
            </button>
          </div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Agent Credentials</div></div>
        <div style="padding:8px 0;color:var(--text-secondary);font-size:13px;line-height:1.9;">
          <p>The agent will login at <strong>/agent</strong> page using these credentials.</p>
          <br>
          <div class="code-block" style="font-size:12px;">
            Username: (as entered)<br>
            Password: (as entered)<br>
            Login URL: <a href="/agent" target="_blank">/agent</a>
          </div>
          <br>
          <p class="text-muted">Agents can manage only their own assigned clients.</p>
        </div>
        <div class="card-header" style="margin-top:16px;"><div class="card-title">Default Permissions</div></div>
        ${['View own clients', 'Add/edit clients', 'View SMS logs', 'View numbers assigned', 'Request payouts']
          .map(p => `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
            <i class="fas fa-circle-check" style="color:var(--green-light);"></i><span>${p}</span>
          </div>`).join('')}
      </div>
    </div>
  `;
}

async function submitAddAgent(event) {
  event.preventDefault();

  try {
    const username = document.getElementById('a-user').value.trim();
    const password = document.getElementById('a-pass').value;

    if (!username || username.length < 3) {
      toast('Username must be at least 3 characters', 'error');
      return;
    }
    if (!password || password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }

    const btn = document.getElementById('a-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Creating...';
    }

    const payload = {
      username,
      full_name: document.getElementById('a-name').value || '',
      email: document.getElementById('a-email').value || '',
      phone: document.getElementById('a-phone').value || '',
      password: password,
      commission_rate: parseFloat(document.getElementById('a-comm').value) || 5,
      notes: document.getElementById('a-notes').value || '',
      manager_id: MANAGER_ID
    };

    const result = await apiFetch('/api/agents', { method: 'POST', body: JSON.stringify(payload) });

    if (result && result.id) {
      toast(`Agent "${username}" created!`, 'success');
      loadPage('agents');
    } else {
      toast(result?.error || 'Failed to create agent', 'error');
    }
  } catch (err) {
    console.error('Add agent error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('a-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Agent';
    }
  }
}

async function openEditAgentModal(id) {
  try {
    const data = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=100`);
    const a = data?.data?.find(x => x.id === id);
    if (!a) {
      toast('Agent not found', 'error');
      return;
    }

    openModal(`Edit Agent — ${a.username}`, `
      <form id="edit-agent-form" onsubmit="saveAgent(event, ${id})">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full Name</label>
            <input id="ea-name" value="${a.full_name || ''}"></div>
          <div class="form-group"><label class="form-label">Email</label>
            <input id="ea-email" value="${a.email || ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Phone</label>
            <input id="ea-phone" value="${a.phone || ''}"></div>
          <div class="form-group"><label class="form-label">Commission (%)</label>
            <input type="number" id="ea-comm" value="${a.commission_rate || 5}" step="0.5" min="0" max="50"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea id="ea-notes" rows="2">${a.notes || ''}</textarea></div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="ea-submit-btn">
            <i class="fas fa-save"></i> Save Changes
          </button>
        </div>
      </form>
    `);
  } catch (err) {
    console.error('Edit agent error:', err);
    toast('Failed to load agent details', 'error');
  }
}

async function saveAgent(event, id) {
  event.preventDefault();

  try {
    const btn = document.getElementById('ea-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Saving...';
    }

    const payload = {
      full_name: document.getElementById('ea-name').value || '',
      email: document.getElementById('ea-email').value || '',
      phone: document.getElementById('ea-phone').value || '',
      commission_rate: parseFloat(document.getElementById('ea-comm').value) || 5,
      notes: document.getElementById('ea-notes').value || ''
    };

    const result = await apiFetch(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

    if (result && result.id) {
      closeModal();
      toast('Agent updated', 'success');
      pgAgents();
    } else {
      toast(result?.error || 'Failed to update agent', 'error');
    }
  } catch (err) {
    console.error('Save agent error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('ea-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  }
}

async function toggleAgent(id, status) {
  try {
    const newS = status === 'active' ? 'suspended' : 'active';
    const result = await apiFetch(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newS })
    });

    if (result && result.id) {
      toast(`Agent ${newS}`, 'info');
      pgAgents();
    } else {
      toast('Failed to toggle agent', 'error');
    }
  } catch (err) {
    console.error('Toggle agent error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

async function deleteAgent(id) {
  if (!confirm('Delete this agent? Their clients will become unassigned.')) return;

  try {
    const result = await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
    if (result && result.success) {
      toast('Agent deleted', 'warning');
      pgAgents();
    } else {
      toast('Failed to delete agent', 'error');
    }
  } catch (err) {
    console.error('Delete agent error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

// ── AGENT PERFORMANCE ─────────────────────────────────────────────
async function pgAgentPerformance() {
  try {
    const data = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=50`);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Agent Performance</div><div class="page-subtitle">Compare agent metrics</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgAgentPerformance()"><i class="fas fa-sync"></i> Refresh</button>
          <button class="btn btn-outline btn-sm" onclick="toast('Export started', 'info')"><i class="fas fa-download"></i> Export</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header"><div class="card-title">Leaderboard</div></div>
        ${buildTable(['Rank', 'Agent', 'Clients', 'Numbers', 'Commission', 'Status'],
          (data?.data || []).sort((a, b) => b.clients_count - a.clients_count).map((a, i) => [
            `<strong>#${i + 1}</strong>`,
            `<span style="display:flex;align-items:center;gap:8px;">
              <div style="width:30px;height:30px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;">
                ${a.username ? a.username[0].toUpperCase() : '?'}
              </div>
              ${a.username || '—'}
            </span>`,
            a.clients_count || 0,
            a.numbers_assigned || 0,
            (a.commission_rate || 0) + '%',
            statusBadge(a.status)
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Agent performance error:', err);
    toast('Failed to load agent performance', 'error');
  }
}

// ═══════════════════════════════════════════════
//  CLIENTS — COMPLETE UPGRADED
// ═══════════════════════════════════════════════

async function pgClients(page = 1, agentFilter = '') {
  try {
    const url = agentFilter
      ? `/api/clients?page=${page}&limit=20&agent_id=${agentFilter}`
      : `/api/clients?page=${page}&limit=20&manager_id=${MANAGER_ID}`;

    const [data, agents] = await Promise.all([
      apiFetch(url),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=50`)
    ]);

    if (!data) return;

    const agentMap = {};
    (agents?.data || []).forEach(a => agentMap[a.id] = a.username);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">All Clients</div><div class="page-subtitle">${data.total || 0} clients</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="loadPage('add-client')"><i class="fas fa-user-plus"></i> Add Client</button>
          <button class="btn btn-outline btn-sm" onclick="pgClients(1)"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="card">
        <div class="filters-bar">
          ${zySelectSearch('agent-filter', 'Search agents…')}
          <select id="agent-filter" onchange="pgClients(1,this.value)">
            <option value="">All Agents</option>
            ${(agents?.data || []).map(a => `<option value="${a.id}" ${agentFilter == a.id ? 'selected' : ''}>${a.username}</option>`).join('')}
          </select>
          <input id="client-search" placeholder="Search clients..." onkeyup="if(event.key==='Enter') searchClients()">
          <button class="btn btn-outline btn-sm" onclick="searchClients()"><i class="fas fa-search"></i> Search</button>
          <button class="btn btn-outline btn-sm" onclick="resetClientFilters()"><i class="fas fa-undo"></i> Reset</button>
          <span style="margin-left:auto;font-size:13px;color:var(--text-muted);">
            Showing ${Math.min((page - 1) * 20 + 1, data.total)} to ${Math.min(page * 20, data.total)} of ${data.total} entries
          </span>
        </div>
        ${buildTable(
          ['#', 'Username', 'Full Name', 'Agent', 'Service', 'Balance', 'Numbers', 'Status', 'Last Active', 'Actions'],
          (data.data || []).map(c => [
            c.id || '—',
            `<strong>${c.username || '—'}</strong>`,
            c.full_name || '—',
            agentMap[c.agent_id] ? `<span class="badge badge-purple">${agentMap[c.agent_id]}</span>` : '—',
            `<span style="color:${serviceColor(c.service)};font-weight:600">${c.service || '—'}</span>`,
            `<span class="text-success">$${c.balance || 0}</span>`,
            c.numbers_assigned || 0,
            statusBadge(c.status),
            fmtShort(c.last_active),
            `<button class="btn btn-outline btn-sm" onclick="openEditClientModal(${c.id})" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-${c.status === 'active' ? 'warning' : 'success'} btn-sm" onclick="toggleClient(${c.id},'${c.status}')" title="Toggle Status">
              <i class="fas fa-${c.status === 'active' ? 'pause' : 'play'}"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>`
          ])
        )}
        ${pagination(page, data.total || 0, 20, p => pgClients(p, agentFilter))}
      </div>
    `;
  } catch (err) {
    console.error('Clients error:', err);
    toast('Failed to load clients', 'error');
  }
}

async function searchClients() {
  const q = document.getElementById('client-search')?.value || '';
  const agentFilter = document.getElementById('agent-filter')?.value || '';

  try {
    const data = await apiFetch(`/api/clients?search=${encodeURIComponent(q)}&agent_id=${agentFilter}&manager_id=${MANAGER_ID}&limit=50`);
    const wrap = document.querySelector('.table-wrap');
    if (wrap) {
      const agents = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=50`);
      const agentMap = {};
      (agents?.data || []).forEach(a => agentMap[a.id] = a.username);

      wrap.outerHTML = buildTable(
        ['#', 'Username', 'Full Name', 'Agent', 'Service', 'Balance', 'Numbers', 'Status', 'Last Active', 'Actions'],
        (data?.data || []).map(c => [
          c.id || '—',
          `<strong>${c.username || '—'}</strong>`,
          c.full_name || '—',
          agentMap[c.agent_id] ? `<span class="badge badge-purple">${agentMap[c.agent_id]}</span>` : '—',
          `<span style="color:${serviceColor(c.service)};font-weight:600">${c.service || '—'}</span>`,
          `<span class="text-success">$${c.balance || 0}</span>`,
          c.numbers_assigned || 0,
          statusBadge(c.status),
          fmtShort(c.last_active),
          `<button class="btn btn-outline btn-sm" onclick="openEditClientModal(${c.id})"><i class="fas fa-pen"></i></button>
           <button class="btn btn-${c.status === 'active' ? 'warning' : 'success'} btn-sm" onclick="toggleClient(${c.id},'${c.status}')">
             <i class="fas fa-${c.status === 'active' ? 'pause' : 'play'}"></i>
           </button>
           <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})"><i class="fas fa-trash"></i></button>`
        ])
      );
      toast(`Found ${data?.data?.length || 0} results`, 'info');
    }
  } catch (err) {
    console.error('Search error:', err);
    toast('Search failed', 'error');
  }
}

function resetClientFilters() {
  const searchInput = document.getElementById('client-search');
  const agentFilter = document.getElementById('agent-filter');
  if (searchInput) searchInput.value = '';
  if (agentFilter) agentFilter.value = '';
  pgClients(1);
  toast('Filters reset', 'info');
}

// ── ADD CLIENT ────────────────────────────────────────────────────

async function pgAddClient() {
  try {
    const agents = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=50`);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Add New Client</div><div class="page-subtitle">Create a client under an agent</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="loadPage('clients')"><i class="fas fa-arrow-left"></i> Back to Clients</button>
        </div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Client Details</div></div>
          <form id="add-client-form" onsubmit="submitAddClient(event)">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Username *</label>
                <input id="c-user" placeholder="client_name" required minlength="3">
              </div>
              <div class="form-group">
                <label class="form-label">Full Name</label>
                <input id="c-name" placeholder="Full Name">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="c-email" placeholder="client@example.com">
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input id="c-phone" placeholder="+1...">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Password *</label>
                <input type="password" id="c-pass" value="client123" required minlength="6">
              </div>
              <div class="form-group">
                <label class="form-label">Assign Agent *</label>
                ${zySelectSearch('c-agent', 'Search agents…')}
                <select id="c-agent" required>
                  <option value="">— Select Agent —</option>
                  ${(agents?.data || []).filter(a => a.status === 'active').map(a =>
                    `<option value="${a.id}">${a.username} (${a.clients_count || 0} clients)</option>`
                  ).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Initial Balance ($)</label>
                <input type="number" id="c-balance" value="0" step="0.01" min="0">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Daily SMS Limit</label>
                <input type="number" id="c-daily" value="100" min="1">
              </div>
              <div class="form-group">
                <label class="form-label">Monthly SMS Limit</label>
                <input type="number" id="c-monthly" value="3000" min="1">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notes</label>
              <textarea id="c-notes" rows="2" placeholder="Optional notes…"></textarea>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-outline" onclick="loadPage('clients')">Cancel</button>
              <button type="submit" class="btn btn-primary" id="c-submit-btn">
                <i class="fas fa-user-plus"></i> Create Client
              </button>
            </div>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Active Agents</div></div>
          ${buildTable(['Agent', 'Clients', 'Status'],
            (agents?.data || []).map(a => [
              `<strong>${a.username}</strong>`,
              `<span class="badge badge-blue">${a.clients_count || 0}</span>`,
              statusBadge(a.status)
            ])
          )}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Add client error:', err);
    toast('Failed to load agents', 'error');
  }
}

async function submitAddClient(event) {
  event.preventDefault();

  try {
    const username = document.getElementById('c-user').value.trim();
    const agentId = parseInt(document.getElementById('c-agent').value);
    const password = document.getElementById('c-pass').value;

    if (!username || username.length < 3) {
      toast('Username must be at least 3 characters', 'error');
      return;
    }
    if (!agentId) {
      toast('Please select an agent', 'error');
      return;
    }
    if (!password || password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }

    const btn = document.getElementById('c-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Creating...';
    }

    const payload = {
      username,
      full_name: document.getElementById('c-name').value || '',
      email: document.getElementById('c-email').value || '',
      phone: document.getElementById('c-phone').value || '',
      password: password,
      agent_id: agentId,
      balance: parseFloat(document.getElementById('c-balance').value) || 0,
      daily_limit: parseInt(document.getElementById('c-daily').value) || 100,
      monthly_limit: parseInt(document.getElementById('c-monthly').value) || 3000,
      notes: document.getElementById('c-notes').value || '',
      manager_id: MANAGER_ID
    };

    const result = await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(payload) });

    if (result && result.id) {
      toast(`Client "${username}" created!`, 'success');
      loadPage('clients');
    } else {
      toast(result?.error || 'Failed to create client', 'error');
    }
  } catch (err) {
    console.error('Add client error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('c-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Client';
    }
  }
}

async function openEditClientModal(id) {
  try {
    const data = await apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=100`);
    const c = data?.data?.find(x => x.id === id);
    if (!c) {
      toast('Client not found', 'error');
      return;
    }

    const agents = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=50`);

    openModal(`Edit Client — ${c.username}`, `
      <form id="edit-client-form" onsubmit="saveClient(event, ${id})">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full Name</label>
            <input id="ec-name" value="${c.full_name || ''}"></div>
          <div class="form-group"><label class="form-label">Email</label>
            <input id="ec-email" value="${c.email || ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Balance ($)</label>
            <input type="number" id="ec-bal" value="${c.balance || 0}" step="0.01" min="0"></div>
          <div class="form-group"><label class="form-label">Daily Limit</label>
            <input type="number" id="ec-daily" value="${c.daily_limit || 100}" min="1"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Monthly Limit</label>
            <input type="number" id="ec-monthly" value="${c.monthly_limit || 3000}" min="1"></div>
        </div>
        <div class="form-group"><label class="form-label">Reassign Agent</label>
          ${zySelectSearch('ec-agent', 'Search agents…')}
          <select id="ec-agent">
            ${(agents?.data || []).map(a =>
              `<option value="${a.id}" ${a.id === c.agent_id ? 'selected' : ''}>${a.username}</option>`
            ).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea id="ec-notes" rows="2">${c.notes || ''}</textarea></div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="ec-submit-btn">
            <i class="fas fa-save"></i> Save
          </button>
        </div>
      </form>
    `);
  } catch (err) {
    console.error('Edit client error:', err);
    toast('Failed to load client details', 'error');
  }
}

async function saveClient(event, id) {
  event.preventDefault();

  try {
    const btn = document.getElementById('ec-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Saving...';
    }

    const payload = {
      full_name: document.getElementById('ec-name').value || '',
      email: document.getElementById('ec-email').value || '',
      balance: parseFloat(document.getElementById('ec-bal').value) || 0,
      daily_limit: parseInt(document.getElementById('ec-daily').value) || 100,
      monthly_limit: parseInt(document.getElementById('ec-monthly').value) || 3000,
      agent_id: parseInt(document.getElementById('ec-agent').value),
      notes: document.getElementById('ec-notes').value || ''
    };

    const result = await apiFetch(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

    if (result && result.id) {
      closeModal();
      toast('Client updated', 'success');
      pgClients();
    } else {
      toast(result?.error || 'Failed to update client', 'error');
    }
  } catch (err) {
    console.error('Save client error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('ec-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
  }
}

async function toggleClient(id, status) {
  try {
    const newS = status === 'active' ? 'suspended' : 'active';
    const result = await apiFetch(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newS })
    });

    if (result && result.id) {
      toast(`Client ${newS}`, 'info');
      pgClients();
    } else {
      toast('Failed to toggle client', 'error');
    }
  } catch (err) {
    console.error('Toggle client error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

async function deleteClient(id) {
  if (!confirm('Delete this client?')) return;

  try {
    const result = await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
    if (result && result.success) {
      toast('Client deleted', 'warning');
      pgClients();
    } else {
      toast('Failed to delete client', 'error');
    }
  } catch (err) {
    console.error('Delete client error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════
//  CLIENT BALANCES
// ═══════════════════════════════════════════════

async function pgClientBalances() {
  try {
    const data = await apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=100`);
    const total = (data?.data || []).reduce((s, c) => s + (c.balance || 0), 0);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Client Balances</div>
        <div class="page-subtitle">Total: <strong class="text-success">$${total.toFixed(2)}</strong> — view only, balance adjustments are handled by Owner</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgClientBalances()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="card">
        ${buildTable(
          ['#', 'Client', 'Agent ID', 'Balance', 'Service', 'Status'],
          (data?.data || []).map(c => [
            c.id || '—',
            `<strong>${c.username || '—'}</strong>`,
            `Agent #${c.agent_id || '—'}`,
            `<strong class="text-${c.balance > 200 ? 'success' : 'warning'}">$${c.balance || 0}</strong>`,
            c.service || '—',
            statusBadge(c.status)
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Client balances error:', err);
    toast('Failed to load client balances', 'error');
  }
}

// ── CLIENT LIMITS ─────────────────────────────────────────────────

async function pgClientLimits() {
  try {
    const data = await apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=100`);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Limits &amp; Quotas</div>
        <div class="page-subtitle">SMS limits per client</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgClientLimits()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="card">
        ${buildTable(['Client', 'Service', 'Daily Limit', 'Monthly Limit', 'Total SMS', 'Used %', 'Action'],
          (data?.data || []).map(c => {
            const usagePct = c.monthly_limit ? Math.round((c.total_sms || 0) / c.monthly_limit * 100) : 0;
            const fillColor = usagePct > 90 ? 'red' : 'green';
            return [
              c.username || '—',
              c.service || '—',
              `<input type="number" value="${c.daily_limit || 100}" style="width:80px;" id="dl-${c.id}" min="1">`,
              `<input type="number" value="${c.monthly_limit || 3000}" style="width:90px;" id="ml-${c.id}" min="1">`,
              c.total_sms || 0,
              `<div class="progress-bar" style="width:80px;">
                <div class="progress-bar-fill ${fillColor}" style="width:${Math.min(usagePct, 100)}%"></div>
              </div>`,
              `<button class="btn btn-success btn-sm" onclick="saveLimit(${c.id})"><i class="fas fa-save"></i></button>`
            ];
          })
        )}
      </div>
    `;
  } catch (err) {
    console.error('Client limits error:', err);
    toast('Failed to load client limits', 'error');
  }
}

async function saveLimit(id) {
  try {
    const daily = parseInt(document.getElementById(`dl-${id}`)?.value) || 100;
    const monthly = parseInt(document.getElementById(`ml-${id}`)?.value) || 3000;

    const result = await apiFetch(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ daily_limit: daily, monthly_limit: monthly })
    });

    if (result && result.id) {
      toast('Limits saved', 'success');
    } else {
      toast('Failed to save limits', 'error');
    }
  } catch (err) {
    console.error('Save limit error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════
//  SMS OVERVIEW
// ═══════════════════════════════════════════════

async function pgSmsOverview() {
  try {
    const stats = await apiFetch(`/api/manager/${MANAGER_ID}/stats`);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">SMS Overview</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgSmsOverview()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
        ${statCard('Total SMS', 'fas fa-comment-sms', stats?.total_sms || 0, 'blue', 'All clients')}
        ${statCard('Revenue Today', 'fas fa-dollar-sign', '$' + (stats?.revenue_today || 0).toFixed(2), 'green', 'Earnings')}
        ${statCard('Active Clients', 'fas fa-users', stats?.active_clients || 0, 'purple', 'Sending')}
        ${statCard('Numbers Used', 'fas fa-mobile-screen', stats?.numbers_assigned || 0, 'yellow', 'Assigned')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">24h Traffic</div></div>
        <div class="chart-container" style="height:250px;">
          <canvas id="sms-chart"></canvas>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-header"><div class="card-title">SMS CDR Stats</div></div>
        <div class="filters-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="date" id="mcdr-from" value="${new Date().toISOString().split('T')[0]}">
          <input type="date" id="mcdr-to" value="${new Date().toISOString().split('T')[0]}">
          <input id="mcdr-num" placeholder="Search Number or Message">
          <input id="mcdr-cli" placeholder="Search CLI">
          <button class="btn btn-primary btn-sm" onclick="loadMgrCdr(1)"><i class="fas fa-chart-bar"></i> Show Report</button>
        </div>
        <div id="mgr-cdr-wrap" style="margin-top:12px;"></div>
      </div>
    `;

    loadMgrCdr(1);

    try {
      const ctx = document.getElementById('sms-chart');
      const trafficData = stats?.traffic_data || Array.from({ length: 24 }, () => 0);
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
    console.error('SMS overview error:', err);
    toast('Failed to load SMS overview', 'error');
  }
}

// ── LIVE TRAFFIC ──────────────────────────────────────────────────

let mgrCdrPerPage = 25;
async function loadMgrCdr(page = 1) {
  const wrap = document.getElementById('mgr-cdr-wrap');
  if (!wrap) return;
  try {
    const dateFrom = document.getElementById('mcdr-from')?.value || new Date().toISOString().split('T')[0];
    const dateTo = document.getElementById('mcdr-to')?.value || new Date().toISOString().split('T')[0];
    const numSearch = document.getElementById('mcdr-num')?.value || '';
    const cliSearch = document.getElementById('mcdr-cli')?.value || '';

    const limitParam = mgrCdrPerPage === 'all' ? 100000 : mgrCdrPerPage;
    const params = new URLSearchParams();
    params.append('page', mgrCdrPerPage === 'all' ? 1 : page);
    params.append('limit', limitParam);
    params.append('date_from', dateFrom);
    params.append('date_to', dateTo);
    params.append('manager_id', MANAGER_ID);
    if (numSearch) params.append('search', numSearch);
    if (cliSearch) params.append('cli', cliSearch);

    const data = await apiFetch(`/api/sms/logs?${params.toString()}`);
    const logs = data?.data || [];
    const total = data?.total || 0;
    const perPage = mgrCdrPerPage === 'all' ? (total || 1) : mgrCdrPerPage;

    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;color:var(--text-muted);">Show</span>
          <select onchange="mgrCdrPerPage=this.value==='all'?'all':parseInt(this.value);loadMgrCdr(1)" style="width:80px;">
            <option value="25" ${mgrCdrPerPage === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${mgrCdrPerPage === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${mgrCdrPerPage === 100 ? 'selected' : ''}>100</option>
            <option value="all" ${mgrCdrPerPage === 'all' ? 'selected' : ''}>All</option>
          </select>
          <span style="font-size:13px;color:var(--text-muted);">entries</span>
        </div>
      </div>
      ${buildTable(
        ['DATE', 'RANGE', 'NUMBER', 'CLI', 'SMS', 'CURRENCY', 'PAYOUT'],
        logs.map(s => [
          fmtShort(s.timestamp),
          s.range_label || `${s.country || ''}-${s.provider || ''}`,
          `<span class="monospace">${s.number || '—'}</span>`,
          s.cli || '—',
          `<span class="text-muted">${s.message || '—'}</span>`,
          'USD',
          `<span class="text-success">$${s.profit || 0}</span>`
        ])
      )}
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;">
        <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((page-1)*perPage+1, total)} to ${Math.min(page*perPage, total)} of ${total} entries</span>
        ${mgrCdrPerPage === 'all' ? '' : pagination(page, total, perPage, loadMgrCdr)}
      </div>
    `;
  } catch (err) {
    console.error('CDR error:', err);
    toast('Failed to load SMS CDR', 'error');
  }
}

function pgTraffic() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Live Traffic</div></div>
      <div class="page-actions">
        <span class="badge badge-green"><span class="pulse-dot" style="display:inline-block;"></span> Live</span>
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-chart-line"></i></div>
        <div><div class="stat-label">MPS</div><div class="stat-value" id="t-mps">—</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-comment-sms"></i></div>
        <div><div class="stat-label">Session Total</div><div class="stat-value" id="t-total">0</div></div></div>
      <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-percent"></i></div>
        <div><div class="stat-label">Success Rate</div><div class="stat-value" id="t-rate">—</div></div></div>
    </div>
    <div class="card">
      <div class="chart-container" style="height:280px;"><canvas id="t-chart"></canvas></div>
    </div>
  `;

  const labels = [],
    data = [];
  const ctx = document.getElementById('t-chart');
  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, label: 'MPS', borderColor: '#334155', backgroundColor: 'rgba(51,65,85,0.08)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] },
    options: chartOpts()
  });

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${wsProto}://${location.host}/ws/live-traffic`);
  activeWS.push(ws);

  ws.onmessage = e => {
    try {
      const d = JSON.parse(e.data);
      const el = document.getElementById('t-mps');
      if (!el) { ws.close(); return; }
      el.textContent = d.mps || '—';
      document.getElementById('t-total').textContent = d.total || 0;
      document.getElementById('t-rate').textContent = (d.success_rate || 0) + '%';
      labels.push(new Date(d.timestamp || Date.now()).toLocaleTimeString());
      data.push(d.mps || 0);
      if (labels.length > 60) { labels.shift();
        data.shift(); }
      chart.update('none');
    } catch (err) {
      console.warn('WebSocket message error:', err);
    }
  };

  ws.onerror = () => {
    const el = document.getElementById('t-mps');
    if (el) el.textContent = '⚠️';
  };
}

// ── REPORTS ───────────────────────────────────────────────────────

async function pgReports() {
  try {
    const [stats, agents, clients] = await Promise.all([
      apiFetch(`/api/manager/${MANAGER_ID}/stats`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=50`),
      apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=100`)
    ]);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Reports</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="exportReport()"><i class="fas fa-download"></i> Export</button>
          <button class="btn btn-outline btn-sm" onclick="pgReports()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="stats-grid">
        ${statCard('Agents', 'fas fa-user-secret', agents?.total || 0, 'purple')}
        ${statCard('Clients', 'fas fa-users', clients?.total || 0, 'blue')}
        ${statCard('Total SMS', 'fas fa-comment-sms', stats?.total_sms || 0, 'green')}
        ${statCard('Revenue', 'fas fa-dollar-sign', '$' + (stats?.revenue_today || 0).toFixed(2), 'yellow')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Agent Summary</div></div>
        ${buildTable(['Agent', 'Clients', 'Numbers', 'Commission', 'Status'],
          (agents?.data || []).map(a => [
            a.username || '—',
            a.clients_count || 0,
            a.numbers_assigned || 0,
            (a.commission_rate || 0) + '%',
            statusBadge(a.status)
          ])
        )}
      </div>
      <div class="card" style="margin-top:20px;">
        <div class="card-header"><div class="card-title">Top Clients by Balance</div></div>
        ${buildTable(['Client', 'Agent ID', 'Balance', 'Service', 'SMS Count'],
          (clients?.data || []).sort((a, b) => b.balance - a.balance).slice(0, 10).map(c => [
            c.username || '—',
            `Agent #${c.agent_id || '—'}`,
            `<strong class="text-success">$${c.balance || 0}</strong>`,
            c.service || '—',
            c.total_sms || 0
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Reports error:', err);
    toast('Failed to load reports', 'error');
  }
}

function exportReport() {
  toast('Report exported', 'success');
}

// ── NEWS ──────────────────────────────────────────────────────────
async function pgNews() {
  try {
    const result = await apiFetch(`/api/announcements?role=Manager&manager_id=${MANAGER_ID}`);
    const data = result?.data || [];

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">News</div><div class="page-subtitle">Sent to your own Agents and Clients only</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="openNewMgrAnnouncementModal()"><i class="fas fa-plus"></i> New Post</button>
        </div>
      </div>
      ${data.length > 0 ? data.map(a => `
        <div class="card" style="margin-bottom:14px;border-left:3px solid var(--${a.type === 'warning' ? 'yellow-light' : a.type === 'success' ? 'green-light' : 'accent'});">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              ${badge(a.type || 'info', a.type === 'warning' ? 'yellow' : a.type === 'success' ? 'green' : 'blue')}
              <strong>${a.title || '—'}</strong>
              ${a.sender_role === 'Admin' || a.sender_role === 'Owner' ? badge('From Owner', 'purple') : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="text-muted fs-12">${fmtShort(a.created)}</span>
              ${a.sender_role === 'Manager' && a.sender_id === MANAGER_ID ? `<button class="btn-icon" onclick="deleteMgrAnnouncement(${a.id})" title="Delete"><i class="fas fa-trash" style="color:var(--red-light);"></i></button>` : ''}
            </div>
          </div>
          <p class="text-secondary">${a.body || ''}</p>
        </div>
      `).join('') : `<div class="empty-state"><i class="fas fa-inbox"></i><p>No announcements yet</p></div>`}
    `;
  } catch (err) {
    console.error('News error:', err);
    toast('Failed to load news', 'error');
  }
}

function openNewMgrAnnouncementModal() {
  openModal('New Announcement', `
    <p class="text-muted" style="font-size:12px;margin-bottom:12px;">This will be visible to your own Agents and Clients only.</p>
    <form onsubmit="submitMgrAnnouncement(event)">
      <div class="form-group"><label class="form-label">Title *</label><input id="mgr-ann-title" placeholder="Announcement title" required></div>
      <div class="form-group"><label class="form-label">Body *</label><textarea id="mgr-ann-body" rows="4" placeholder="Announcement content" required></textarea></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select id="mgr-ann-type">
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

async function submitMgrAnnouncement(event) {
  event.preventDefault();
  const title = document.getElementById('mgr-ann-title')?.value.trim();
  const body = document.getElementById('mgr-ann-body')?.value.trim();
  const type = document.getElementById('mgr-ann-type')?.value;
  if (!title || !body) { toast('Title and body are required', 'error'); return; }

  const result = await apiFetch('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, body, type, sender_role: 'Manager', sender_id: MANAGER_ID, sender_username: MANAGER_USER.username })
  });
  if (!result) return;
  closeModal();
  toast('Announcement posted!', 'success');
  pgNews();
}

async function deleteMgrAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
  toast('Deleted', 'warning');
  pgNews();
}

// ── PAYOUT REQUESTS (from my own agents only) ──────────────────────
async function pgPayoutRequests() {
  try {
    const result = await apiFetch(`/api/payout-requests?manager_id=${MANAGER_ID}`);
    const requests = result?.data || [];
    const pending = requests.filter(r => r.status === 'pending').length;

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Payout Requests</div><div class="page-subtitle">${pending} pending — from your own Agents only</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgPayoutRequests()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="card">
        ${buildTable(
          ['#', 'Agent', 'Amount', 'Method', 'Wallet', 'Status', 'Time', 'Actions'],
          requests.map(r => [
            r.id || '—',
            r.user || '—',
            `<strong class="text-success">$${r.amount || 0}</strong>`,
            badge(r.method || '—', 'blue'),
            `<span class="monospace text-muted" style="font-size:11px;">${r.wallet || '—'}</span>`,
            statusBadge(r.status),
            fmtShort(r.timestamp),
            r.status === 'pending' ? `
              <button class="btn btn-success btn-sm" onclick="mgrApprovePayout(${r.id})"><i class="fas fa-check"></i> Approve</button>
              <button class="btn btn-danger btn-sm" onclick="mgrRejectPayout(${r.id})"><i class="fas fa-times"></i> Reject</button>
            ` : (r.status === 'paid' ? `<button class="btn btn-outline btn-sm" onclick='downloadPayoutInvoice(${JSON.stringify(r)})'><i class="fas fa-file-invoice"></i> Invoice</button>` : '—')
          ])
        )}
      </div>
    `;
  } catch (err) {
    console.error('Payout requests error:', err);
    toast('Failed to load payout requests', 'error');
  }
}

async function mgrApprovePayout(id) {
  await apiFetch(`/api/payout-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
  toast('Marked as paid', 'success');
  pgPayoutRequests();
}
async function mgrRejectPayout(id) {
  if (!confirm('Reject this payout request?')) return;
  await apiFetch(`/api/payout-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
  toast('Request rejected', 'warning');
  pgPayoutRequests();
}

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
          <div class="inv-logo">𝑴𝑨𝑰𝑻 <span>𝑺𝑴𝑺</span></div>
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

// ── SMS TEST PANEL ────────────────────────────────────────────────
let mgTpPage = 1, mgTpPerPage = 25, mgRsPage = 1, mgRsPerPage = 25;
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
            <select id="mg-tp-range" style="min-width:150px;" onchange="mgTpPage=1;loadMgTestNumbers()">
              <option value="">Select Range</option>
              ${ranges.map(r => `<option value="${r.id}">${r.country || ''} ${r.prefix || ''}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm" onclick="mgTpPage=1;loadMgTestNumbers()"><i class="fas fa-filter"></i> Filter</button>
          </div>
          <div class="dt-toolbar" style="margin-top:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Show</span>
              <select onchange="mgTpPerPage=this.value==='all'?'all':parseInt(this.value);mgTpPage=1;loadMgTestNumbers()" style="width:80px;">
                <option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span style="font-size:13px;color:var(--text-muted);">entries</span>
            </div>
          </div>
          <div id="mg-tp-wrap"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Recent SMS Test</div></div>
          <div class="dt-toolbar">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;color:var(--text-muted);">Show</span>
              <select onchange="mgRsPerPage=this.value==='all'?'all':parseInt(this.value);mgRsPage=1;loadMgRecentSms()" style="width:80px;">
                <option value="25">25</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span style="font-size:13px;color:var(--text-muted);">entries</span>
            </div>
          </div>
          <div id="mg-rs-wrap"></div>
        </div>
      </div>
    `;
    loadMgTestNumbers();
    loadMgRecentSms();
  } catch (err) {
    console.error('SMS Test Panel error:', err);
    toast('Failed to load test panel', 'error');
  }
}

async function loadMgTestNumbers() {
  const wrap = document.getElementById('mg-tp-wrap');
  if (!wrap) return;
  const rangeFilter = document.getElementById('mg-tp-range')?.value || '';
  const limitParam = mgTpPerPage === 'all' ? 100000 : mgTpPerPage;
  const params = new URLSearchParams();
  params.append('page', mgTpPerPage === 'all' ? 1 : mgTpPage);
  params.append('limit', limitParam);
  if (rangeFilter) params.append('range', rangeFilter);
  const data = await apiFetch(`/api/sms/test-numbers?${params.toString()}`);
  const rows = data?.data || [];
  const total = data?.total || 0;
  const perPage = mgTpPerPage === 'all' ? (total || 1) : mgTpPerPage;

  wrap.innerHTML = buildTable(
    ['Range', 'Test Number'],
    rows.map(n => [
      n.range_label || '—',
      `<span class="monospace fw-600">${n.number || '—'}</span>`
    ])
  ) + `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((mgTpPage-1)*perPage+1,total)}–${Math.min(mgTpPage*perPage,total)} of ${total}</span>
      ${mgTpPerPage === 'all' ? '' : pagination(mgTpPage, total, perPage, (p) => { mgTpPage = p; loadMgTestNumbers(); })}
    </div>
  `;
}

async function loadMgRecentSms() {
  const wrap = document.getElementById('mg-rs-wrap');
  if (!wrap) return;
  const limitParam = mgRsPerPage === 'all' ? 100000 : mgRsPerPage;
  const params = new URLSearchParams();
  params.append('page', mgRsPerPage === 'all' ? 1 : mgRsPage);
  params.append('limit', limitParam);
  const data = await apiFetch(`/api/sms/test-logs?${params.toString()}`);
  const rows = data?.data || [];
  const total = data?.total || 0;
  const perPage = mgRsPerPage === 'all' ? (total || 1) : mgRsPerPage;

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
      <span style="font-size:13px;color:var(--text-muted);">Showing ${total === 0 ? 0 : Math.min((mgRsPage-1)*perPage+1,total)}–${Math.min(mgRsPage*perPage,total)} of ${total}</span>
      ${mgRsPerPage === 'all' ? '' : pagination(mgRsPage, total, perPage, (p) => { mgRsPage = p; loadMgRecentSms(); })}
    </div>
  `;
}

// ── API TOKENS (scoped to my own agents only) ────────────────────
async function pgApiTokens() {
  try {
    const data = await apiFetch(`/api/tokens?manager_id=${MANAGER_ID}`) || [];
    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">API Tokens</div><div class="page-subtitle">Generate access keys for your own Agents only</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="mgrCreateNewToken()"><i class="fas fa-plus"></i> New Token</button>
        </div>
      </div>
      <div class="card">
        ${buildTable(
          ['#', 'Name', 'Agent', 'Token', 'Calls', 'Created', 'Last Used', 'Status', 'Actions'],
          data.map(t => [
            t.id || '—',
            `<strong>${t.name || '—'}</strong>`,
            t.agent_username ? `<span class="badge badge-blue">${t.agent_username}</span>` : '<span class="text-muted">—</span>',
            `<span class="monospace api-token-full" style="font-size:11px;">${t.token || '—'}</span>`,
            t.calls || 0,
            fmtShort(t.created),
            t.last_used ? fmtShort(t.last_used) : '—',
            statusBadge(t.status),
            `<button class="btn-icon" onclick="mgrCopyToken('${t.token || ''}')"><i class="fas fa-copy"></i></button>
             <button class="btn btn-danger btn-sm" onclick="mgrDeleteToken(${t.id})"><i class="fas fa-trash"></i></button>`
          ])
        )}
      </div>
      <div class="card" style="margin-top:20px;">
        <div class="card-header"><div class="card-title">Usage Example</div></div>
        <div class="code-block">curl -H "Authorization: Bearer YOUR_TOKEN" \\
     -H "Content-Type: application/json" \\
     ${window.location.origin}/api/numbers
        </div>
      </div>
    `;
  } catch (err) {
    console.error('API Tokens error:', err);
    toast('Failed to load API tokens', 'error');
  }
}

async function mgrCreateNewToken() {
  const agentsData = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=500`);
  const agents = agentsData?.data || [];
  if (!agents.length) { toast('You have no agents yet', 'warning'); return; }
  openModal('Create API Token', `
    <form id="create-token-form" onsubmit="mgrDoCreateToken(event)">
      <div class="form-group"><label class="form-label">Agent *</label>
        <select id="new-token-agent" required>
          <option value="">— Select Agent —</option>
          ${agents.map(a => `<option value="${a.id}">${a.username}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Token Name</label>
        <input id="new-token-name" placeholder="e.g. Production Key" required></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create</button>
      </div>
    </form>
  `);
}

async function mgrDoCreateToken(event) {
  event.preventDefault();
  const name = document.getElementById('new-token-name').value.trim();
  const agentId = parseInt(document.getElementById('new-token-agent')?.value);
  if (!agentId) { toast('Please select an agent', 'error'); return; }
  if (!name) { toast('Please enter a token name', 'error'); return; }

  const result = await apiFetch('/api/tokens', {
    method: 'POST',
    body: JSON.stringify({ name, agent_id: agentId, created_by: 'Manager' })
  });
  if (!result) return;
  closeModal();
  openModal('API Token Created', `
    <div class="alert alert-success" style="margin-bottom:14px;">API token created successfully. Save this token now.</div>
    <div class="code-block api-token-full" id="new-api-token">${result.token || ''}</div>
    <div class="form-actions" style="margin-top:14px;">
      <button type="button" class="btn btn-primary" onclick="mgrCopyToken('${result.token || ''}')">Copy Full Token</button>
      <button type="button" class="btn btn-outline" onclick="closeModal();pgApiTokens()">Done</button>
    </div>
  `);
  toast('✅ API token created!', 'success');
}

function mgrCopyToken(token) {
  navigator.clipboard.writeText(token).then(() => toast('Token copied', 'success')).catch(() => toast('Copy failed', 'error'));
}

async function mgrDeleteToken(id) {
  if (!confirm('Delete this API token? Any integration using it will stop working.')) return;
  await apiFetch(`/api/tokens/${id}`, { method: 'DELETE' });
  toast('Token deleted', 'warning');
  pgApiTokens();
}


// ═══════════════════════════════════════════════

let mgrNumbersPerPage = 25;
let _mgrNpSort = { col: null, dir: 'asc' };
async function pgNumbers(page = 1) {
  try {
    const rangeFilter = document.getElementById('num-range-filter')?.value || '';
    const clientFilter = document.getElementById('num-client-filter')?.value || '';
    const statusFilter = document.getElementById('num-status-filter')?.value || '';
    const searchQuery = document.getElementById('num-search')?.value || '';

    const limitParam = mgrNumbersPerPage === 'all' ? 100000 : mgrNumbersPerPage;
    const params = new URLSearchParams();
    params.append('page', mgrNumbersPerPage === 'all' ? 1 : page);
    params.append('limit', limitParam);
    params.append('manager_id', MANAGER_ID);
    if (rangeFilter) params.append('range', rangeFilter);
    if (clientFilter) params.append('client_id', clientFilter);
    if (statusFilter) params.append('status', statusFilter);
    if (searchQuery) params.append('search', searchQuery);

    const [data, rangesData, rateCardData, clientsData, agentsData, allMyNumbersData] = await Promise.all([
      apiFetch(`/api/numbers?${params.toString()}`),
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch('/api/numbers/rate-card'),
      apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=200`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`),
      apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=100000`)
    ]);

    const numbers = data?.data || [];
    const total = data?.total || 0;
    const perPage = mgrNumbersPerPage === 'all' ? (total || 1) : mgrNumbersPerPage;
    const totalPages = mgrNumbersPerPage === 'all' ? 1 : (Math.ceil(total / perPage) || 1);
    const ranges = rangesData || [];
    const myCountryProviderSet = new Set((allMyNumbersData?.data || []).map(n => `${n.country}|${n.provider}`));
    const myRanges = ranges.filter(r => myCountryProviderSet.has(`${r.country}|${r.provider}`));
    const rateCard = rateCardData || [];
    const clients = clientsData?.data || [];
    const agents = agentsData?.data || [];

    const rangeLookup = {}; ranges.forEach(r => rangeLookup[`${r.country}|${r.provider}`] = r);
    const rateLookup = {}; rateCard.forEach(r => rateLookup[`${r.country}|${r.provider}`] = r);
    const clientById = {}; clients.forEach(c => clientById[c.id] = c);
    numbers.forEach(n => { n.client_daily_limit = n.client_id ? (clientById[n.client_id]?.daily_limit ?? 0) : 0; });

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Number Pool</div>
          <div class="page-subtitle">Numbers available to your clients</div></div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="loadPage('assign-numbers')">
            <i class="fas fa-share-from-square"></i> Allocate to Agent
          </button>
          <button class="btn btn-outline btn-sm" onclick="window.open('/api/numbers/download?manager_id=${MANAGER_ID}','_blank')">
            <i class="fas fa-download"></i> Download CSV
          </button>
          <button class="btn btn-outline btn-sm" onclick="pgNumbers(1)"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="filters-bar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <select id="num-range-filter" onchange="pgNumbers(1)" style="min-width:160px;">
            <option value="">Select Range</option>
            ${myRanges.map(r => `<option value="${r.id}" ${rangeFilter == r.id ? 'selected' : ''}>${r.country || ''} ${r.prefix || ''}</option>`).join('')}
          </select>
          ${zySelectSearch('num-client-filter', 'Search clients…')}
          <select id="num-client-filter" onchange="pgNumbers(1)" style="min-width:150px;">
            <option value="">Select Client</option>
            ${clients.map(cl => `<option value="${cl.id}" ${clientFilter == cl.id ? 'selected' : ''}>${cl.username}</option>`).join('')}
          </select>
          <select id="num-status-filter" onchange="pgNumbers(1)">
            <option value="">All Numbers</option>
            <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="blocked" ${statusFilter === 'blocked' ? 'selected' : ''}>Blocked</option>
            <option value="assigned" ${statusFilter === 'assigned' ? 'selected' : ''}>Assigned</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="pgNumbers(1)"><i class="fas fa-filter"></i> Filter</button>
        </div>
      </div>
      <div class="card">
        <div class="dt-toolbar" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="mgrNumbersPerPage=this.value==='all'?'all':parseInt(this.value);pgNumbers(1)" style="width:80px;">
              <option value="25" ${mgrNumbersPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${mgrNumbersPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${mgrNumbersPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${mgrNumbersPerPage === 500 ? 'selected' : ''}>500</option>
              <option value="all" ${mgrNumbersPerPage === 'all' ? 'selected' : ''}>All</option>
            </select>
            <span style="font-size:13px;color:var(--text-muted);">entries</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="copyMgrNumbers()"><i class="fas fa-copy"></i> Copy</button>
            <button class="btn btn-outline btn-sm" onclick="exportMgrNumbersCsv()"><i class="fas fa-file-csv"></i> CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportMgrNumbersPdf()"><i class="fas fa-file-pdf"></i> PDF</button>
            <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
          </div>
        </div>
        <div class="filters-bar" style="margin-bottom:12px;justify-content:space-between;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="num-bulk-target-type" onchange="toggleMgrBulkTargetOptions()">
              <option value="agent">Assign to Agent</option>
              <option value="client">Assign to Client</option>
            </select>
            ${zySelectSearch('num-bulk-agent', 'Search agents…')}
            <select id="num-bulk-agent">
              <option value="">— Select Agent —</option>
              ${agents.filter(a => a.status === 'active').map(a => `<option value="${a.id}">${a.username}</option>`).join('')}
            </select>
            ${zySelectSearch('num-bulk-client', 'Search clients…')}
            <select id="num-bulk-client" style="display:none;">
              <option value="">— Select Client —</option>
              ${clients.filter(cl => cl.status === 'active').map(cl => `<option value="${cl.id}">${cl.username}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="mgrAssignSelected()"><i class="fas fa-user-plus"></i> Assign Selected</button>
            <button class="btn btn-danger btn-sm" onclick="mgrRevokeSelected()"><i class="fas fa-rotate-left"></i> Revoke Selected</button>
            <button class="btn btn-warning btn-sm" onclick="mgrReturnSelected()"><i class="fas fa-user-minus"></i> Return Selected</button>
            <span id="mgr-num-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <input id="num-search" placeholder="Search number..." value="${searchQuery}" onkeyup="if(event.key==='Enter') pgNumbers(1)">
            <button class="btn btn-outline btn-sm" onclick="pgNumbers(1)"><i class="fas fa-search"></i></button>
          </div>
        </div>
        ${mgrBuildNumbersTable(numbers, rangeLookup, rateLookup, agents)}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <span style="font-size:13px;color:var(--text-muted);">
            Showing ${total === 0 ? 0 : Math.min((page - 1) * perPage + 1, total)} to ${Math.min(page * perPage, total)} of ${total} entries
          </span>
          ${mgrNumbersPerPage === 'all' ? '' : paginationWithNumbers(page, totalPages, pgNumbers)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Numbers error:', err);
    toast('Failed to load numbers', 'error');
  }
}

function mgrBuildNumbersTable(numbers, rangeLookup, rateLookup, agents) {
  agents = agents || [];
  const cols = [
    { key: 'range', label: 'RANGE' }, { key: 'prefix', label: 'PREFIX' }, { key: 'number', label: 'NUMBER' },
    { key: 'my_payout', label: 'MY PAYOUT' }, { key: 'client', label: 'CLIENT' },
    { key: 'payout', label: 'PAYOUT' }, { key: 'limits', label: 'LIMITS' }
  ];
  const agentLookup = {}; agents.forEach(a => agentLookup[a.id] = a.username);
  let rows = numbers.map(n => {
    const rInfo = rangeLookup[`${n.country}|${n.provider}`] || null;
    const rateInfo = rateLookup[`${n.country}|${n.provider}`] || null;
    const clientLabel = n.client_name || n.client_username
      ? (n.client_name || n.client_username)
      : (n.agent_id && agentLookup[n.agent_id] ? `${agentLookup[n.agent_id]} (Agent)` : '');
    // The Range's own payout (Admin-set, authoritative) is always the real
    // rate — rate_card is only a fallback for numbers whose range was
    // removed/renamed. This must match resolve_payout() on the backend or
    // "MY PAYOUT" can show $0 while the Range clearly has a real rate.
    const resolvedRate = (rInfo && rInfo.payout != null) ? rInfo.payout
                        : (rateInfo && rateInfo.sell_rate != null) ? rateInfo.sell_rate
                        : (n.manager_payout != null ? n.manager_payout : (n.client_payout != null ? n.client_payout : null));
    return {
      n, range: rInfo?.range_name || `${n.country || ''}-${n.provider || ''}`,
      prefix: rInfo?.prefix || '—', number: n.number || '',
      my_payout: resolvedRate,
      range_term: rInfo?.payout_schedule || null,
      client: clientLabel,
      payout: resolvedRate,
      limits_sd: n.client_daily_limit ?? 0
    };
  });
  if (_mgrNpSort.col) {
    rows.sort((a, b) => {
      let av = a[_mgrNpSort.col], bv = b[_mgrNpSort.col];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av == null) av = ''; if (bv == null) bv = '';
      if (av < bv) return _mgrNpSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return _mgrNpSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  const headers = [
    `<input type="checkbox" onchange="document.querySelectorAll('.mgr-num-check').forEach(cb=>cb.checked=this.checked);mgrUpdateSelectedCount()">`,
    ...cols.map(c => `<span class="sortable ${_mgrNpSort.col === c.key ? 'sort-' + _mgrNpSort.dir : ''}" onclick="_mgrNpSort=_mgrNpSort.col==='${c.key}'?{col:'${c.key}',dir:_mgrNpSort.dir==='asc'?'desc':'asc'}:{col:'${c.key}',dir:'asc'};pgNumbers(1)">${c.label}<span class="sort-arrow"></span></span>`)
  ];
  const bodyRows = rows.map(r => {
    const n = r.n;
    return [
      `<input type="checkbox" class="mgr-num-check" value="${n.id}" data-assigned="${n.client_id ? '1' : '0'}" onchange="mgrUpdateSelectedCount()">`,
      r.range, r.prefix,
      `<span class="monospace fw-600">${r.number || '—'}</span>`,
      r.my_payout != null ? `${(r.range_term || n.payment_term) ? (r.range_term || n.payment_term).charAt(0).toUpperCase()+(r.range_term || n.payment_term).slice(1) : 'Not set'}<br><span class="text-success fw-600">$${r.my_payout}</span>` : '—',
      r.client
        ? `${r.client} <button class="btn-icon" onclick="mgrQuickAssign(${n.id},'${n.number || ''}')" title="Reassign"><i class="fas fa-pen"></i></button> <button class="btn-icon" onclick="mgrRevokeOne(${n.id})" title="Revoke"><i class="fas fa-rotate-left"></i></button>`
        : `<button class="btn-icon" onclick="mgrQuickAssign(${n.id},'${n.number || ''}')" title="Assign to client"><i class="fas fa-pen"></i></button>`,
      r.payout != null ? `$${r.payout}` : '—',
      `SD : ${r.limits_sd} | SW : 0`
    ];
  });
  return buildTable(headers, bodyRows);
}

function mgrUpdateSelectedCount() {
  const n = document.querySelectorAll('.mgr-num-check:checked').length;
  const el = document.getElementById('mgr-num-selected-count');
  if (el) el.textContent = `${n} selected`;
}
async function mgrAssignSelected() {
  const ids = Array.from(document.querySelectorAll('.mgr-num-check:checked')).map(cb => parseInt(cb.value));
  const targetType = document.getElementById('num-bulk-target-type')?.value || 'client';
  const targetId = parseInt(document.getElementById(`num-bulk-${targetType}`)?.value);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!targetId) { toast(`Please select an ${targetType}`, 'error'); return; }
  await openMgrAllocateModal(ids, targetType, targetId);
}
function toggleMgrBulkTargetOptions() {
  const type = document.getElementById('num-bulk-target-type')?.value;
  document.getElementById('num-bulk-agent').style.display = type === 'agent' ? 'block' : 'none';
  document.getElementById('num-bulk-client').style.display = type === 'client' ? 'block' : 'none';
}
async function mgrRevokeOne(numberId) {
  if (!confirm('Revoke this number and return it to the unassigned pool?')) return;
  const result = await apiFetch(`/api/numbers/${numberId}/unassign`, { method: 'POST' });
  if (!result) return;
  toast('✅ Number revoked', 'warning');
  pgNumbers(1);
}

async function mgrRevokeSelected() {
  const ids = Array.from(document.querySelectorAll('.mgr-num-check:checked')).map(cb => parseInt(cb.value));
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!confirm(`Revoke ${ids.length} number(s) and return them to the pool?`)) return;
  try {
    const result = await apiFetch('/api/numbers/bulk-unassign-many', {
      method: 'POST', body: JSON.stringify({ number_ids: ids })
    });
    toast(`✅ Revoked ${result?.revoked || ids.length} number(s)`, 'warning');
    pgNumbers(1);
  } catch (err) {
    console.error(err); toast('Some numbers failed to revoke', 'error');
  }
}

async function mgrReturnSelected() {
  const ids = Array.from(document.querySelectorAll('.mgr-num-check:checked')).filter(cb => cb.dataset.assigned === '1').map(cb => parseInt(cb.value));
  if (!ids.length) { toast('Select at least one assigned number to return', 'warning'); return; }
  if (!confirm(`Return ${ids.length} number(s) to the pool?`)) return;
  try {
    const result = await apiFetch('/api/numbers/bulk-unassign-many', {
      method: 'POST', body: JSON.stringify({ number_ids: ids })
    });
    toast(`✅ Returned ${result?.revoked || ids.length} number(s)`, 'warning');
    pgNumbers(1);
  } catch (err) {
    console.error(err); toast('Some numbers failed to return', 'error');
  }
}

// ── Unified Allocate Modal: Select Agent/Client already chosen → Payterm
// (only the terms Admin actually set for this range) → auto-filled Payout ──
async function openMgrAllocateModal(numberIds, targetType, targetId) {
  const [ranges, allPool] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=2000`)
  ]);
  const firstNum = (allPool?.data || []).find(n => numberIds.includes(n.id));
  const range = (ranges || []).find(r => r.country === firstNum?.country && r.provider === firstNum?.provider);
  const term = range?.payout_schedule === 'monthly' ? 'Monthly' : 'Weekly';
  const rate = range?.payout || 0;

  let targetLabel = '';
  if (targetType === 'agent') {
    const agentsData = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=500`);
    targetLabel = (agentsData?.data || []).find(a => a.id === targetId)?.username || '';
  } else {
    const clientsData = await apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=500`);
    targetLabel = (clientsData?.data || []).find(c => c.id === targetId)?.username || '';
  }

  openModal(`Allocate ${numberIds.length} Number(s) — ${targetLabel}`, `
    <form onsubmit="submitMgrAllocate(event, ${JSON.stringify(numberIds)}, '${targetType}', ${targetId})">
      <div style="background:var(--bg-hover);border-radius:8px;padding:12px 14px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span class="text-muted">Payment Term</span><strong>${term}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span class="text-muted">Payout</span><strong class="text-success">$${rate}</strong>
        </div>
      </div>
      <p class="fs-12 text-muted" style="margin-bottom:16px;">This is Owner's fixed rate for this range — it cannot be changed here.</p>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Allocate</button>
      </div>
    </form>
  `);
}

async function submitMgrAllocate(event, numberIds, targetType, targetId) {
  event.preventDefault();
  try {
    await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({
        number_ids: numberIds, target_type: targetType, target_id: targetId,
        notes: 'Assigned by manager'
      })
    });
    closeModal();
    toast(`✅ Allocated ${numberIds.length} number(s)!`, 'success');
    pgNumbers(1);
  } catch (err) {
    console.error('Allocate error:', err);
    toast('Some numbers failed to assign', 'error');
  }
}

async function mgrQuickAssign(numberId, number) {
  try {
    const [clientsData, agentsData] = await Promise.all([
      apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=200`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`)
    ]);
    const clients = (clientsData?.data || []).filter(c => c.status === 'active');
    const agents = (agentsData?.data || []).filter(a => a.status === 'active');

    openModal(`Assign Number — ${number}`, `
      <form id="mgr-qa-target-form" onsubmit="mgrQaProceed(event, ${numberId})">
        <div class="form-group">
          <label class="form-label">Assign To</label>
          <select id="mgr-qa-type" onchange="toggleMgrQaTargetOptions()">
            <option value="agent">Agent</option>
            <option value="client">Client</option>
          </select>
        </div>
        <div class="form-group" id="mgr-qa-agent-wrap">
          <label class="form-label">Select Agent *</label>
          ${zySelectSearch('mgr-qa-agent', 'Search agents…')}
          <select id="mgr-qa-agent">
            <option value="">— Select Agent —</option>
            ${agents.map(a => `<option value="${a.id}">${a.username}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="mgr-qa-client-wrap" style="display:none;">
          <label class="form-label">Select Client *</label>
          ${zySelectSearch('mgr-qa-client', 'Search clients…')}
          <select id="mgr-qa-client">
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
  } catch (err) { toast('Failed to load accounts', 'error'); }
}
function toggleMgrQaTargetOptions() {
  const type = document.getElementById('mgr-qa-type')?.value;
  document.getElementById('mgr-qa-agent-wrap').style.display = type === 'agent' ? 'block' : 'none';
  document.getElementById('mgr-qa-client-wrap').style.display = type === 'client' ? 'block' : 'none';
}
async function mgrQaProceed(event, numberId) {
  event.preventDefault();
  const targetType = document.getElementById('mgr-qa-type')?.value || 'client';
  const targetId = parseInt(document.getElementById(`mgr-qa-${targetType}`)?.value);
  if (!targetId) { toast(`Please select an ${targetType}`, 'error'); return; }
  await openMgrAllocateModal([numberId], targetType, targetId);
}
function copyMgrNumbers() {
  const nums = Array.from(document.querySelectorAll('.mgr-num-check')).map(cb => cb.closest('tr')?.querySelector('.monospace')?.textContent || '');
  navigator.clipboard.writeText(nums.join('\n')).then(() => toast('Copied', 'success')).catch(() => toast('Copy failed', 'error'));
}
function exportMgrNumbersCsv() {
  const rows = Array.from(document.querySelectorAll('table tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).slice(1).map(td => `"${td.textContent.trim().replace(/"/g,'""')}"`).join(',')
  );
  const csv = ['Range,Prefix,Number,My Payout,Client,Payout,Limits', ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `numbers_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}
function exportMgrNumbersPdf() {
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Numbers</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:6px;font-size:12px;}</style></head><body>${document.querySelector('.table-wrap').outerHTML}<script>window.onload=()=>window.print();</script></body></html>`);
  win.document.close();
}

async function searchPoolNumbers() {
  const q = document.getElementById('num-search')?.value || '';
  const status = document.getElementById('num-status-filter')?.value || '';

  try {
    const data = await apiFetch(`/api/numbers?search=${encodeURIComponent(q)}&status=${status}&manager_id=${MANAGER_ID}&limit=50`);
    const wrap = document.querySelector('.table-wrap');
    if (wrap) {
      wrap.outerHTML = buildTable(
        ['#', 'Number', 'App', 'Country', 'Provider', 'User', 'Status', 'Actions'],
        (data?.data || []).map(n => [
          n.id || '—',
          `<span class="monospace">${n.number || '—'}</span>`,
          n.app || '—',
          n.country || '—',
          n.provider || '—',
          n.user || '<span class="text-muted">Unassigned</span>',
          statusBadge(n.status),
          `<button class="btn btn-outline btn-sm" onclick="loadPage('assign-numbers')"><i class="fas fa-user-plus"></i></button>
           <button class="btn btn-outline btn-sm" onclick="toast('Number details', 'info')"><i class="fas fa-eye"></i></button>`
        ])
      );
      toast(`Found ${data?.data?.length || 0} results`, 'info');
    }
  } catch (err) {
    console.error('Search error:', err);
    toast('Search failed', 'error');
  }
}

function filterPoolNumbers() {
  searchPoolNumbers();
}

function resetPoolFilters() {
  const searchInput = document.getElementById('num-search');
  const statusSelect = document.getElementById('num-status-filter');
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = '';
  pgNumbers(1);
  toast('Filters reset', 'info');
}

// ═══════════════════════════════════════════════
//  ASSIGN NUMBERS TO AGENT (Manager → Agent)
// ═══════════════════════════════════════════════

async function pgAssignNumbers(page = 1) {
  try {
    const [numData, agentsData] = await Promise.all([
      apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=2000`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`)
    ]);
    const numbers = numData?.data || [];
    const agents = (agentsData?.data || []).filter(a => a.status === 'active');
    const agentLookup = {}; agents.forEach(a => agentLookup[a.id] = a.username);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Assign to Agent</div>
        <div class="page-subtitle">Give numbers to an Agent — includes numbers already with a different Agent, so you can move them directly</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="loadPage('my-numbers')"><i class="fas fa-arrow-left"></i> Number Pool</button>
        </div>
      </div>
      <div class="card">
        <div class="filters-bar" style="margin-bottom:12px;justify-content:space-between;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${zySelectSearch('atag-agent', 'Search agents…')}
            <select id="atag-agent">
              <option value="">— Select Agent —</option>
              ${agents.map(a => `<option value="${a.id}">${a.username}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="atagAssignSelected()"><i class="fas fa-user-plus"></i> Assign Selected</button>
            <span id="atag-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
          </div>
        </div>
        ${buildTable(
          ['', 'Number', 'Country', 'Currently With'],
          numbers.map(n => [
            `<input type="checkbox" class="atag-check" value="${n.id}">`,
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            n.country || '—',
            n.client_name || n.client_username ? `${n.client_name || n.client_username} (Client)` :
              (n.agent_id && agentLookup[n.agent_id] ? `${agentLookup[n.agent_id]} (Agent)` : '<span class="text-muted">Unassigned</span>')
          ])
        )}
      </div>
    `;
    document.querySelectorAll('.atag-check').forEach(cb => cb.addEventListener('change', atagUpdateCount));
  } catch (err) {
    console.error('Assign numbers error:', err);
    toast('Failed to load data', 'error');
  }
}

function atagUpdateCount() {
  const n = document.querySelectorAll('.atag-check:checked').length;
  const el = document.getElementById('atag-selected-count');
  if (el) el.textContent = `${n} selected`;
}

async function atagAssignSelected() {
  const ids = Array.from(document.querySelectorAll('.atag-check:checked')).map(cb => parseInt(cb.value));
  const agentId = parseInt(document.getElementById('atag-agent')?.value);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!agentId) { toast('Please select an agent', 'error'); return; }
  try {
    const result = await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({ number_ids: ids, target_type: 'agent', target_id: agentId, notes: 'Assigned by manager' })
    });
    toast(`✅ Assigned ${result?.assigned || ids.length} number(s)!`, 'success');
    pgAssignNumbers();
  } catch (err) {
    console.error('Assign to agent error:', err);
    toast('Some numbers failed to assign', 'error');
  }
}

// ═══════════════════════════════════════════════
//  ASSIGN NUMBERS TO CLIENT (Manager → Client)
// ═══════════════════════════════════════════════

async function pgAssignToClient(page = 1) {
  try {
    const [numData, agentsData, clientsData] = await Promise.all([
      apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=2000`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`),
      apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=500`)
    ]);
    const numbers = numData?.data || [];
    const agents = (agentsData?.data || []).filter(a => a.status === 'active');
    const clients = (clientsData?.data || []).filter(cl => cl.status === 'active');
    const agentLookup = {}; agents.forEach(a => agentLookup[a.id] = a.username);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Assign to Client</div>
        <div class="page-subtitle">Give numbers directly to a client under your management — includes numbers already with an Agent or a different Client</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="loadPage('my-numbers')"><i class="fas fa-arrow-left"></i> Number Pool</button>
        </div>
      </div>
      <div class="card">
        <div class="filters-bar" style="margin-bottom:12px;justify-content:space-between;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${zySelectSearch('atac-client', 'Search clients…')}
            <select id="atac-client">
              <option value="">— Select Client —</option>
              ${clients.map(cl => `<option value="${cl.id}">${cl.username}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="atacAssignSelected()"><i class="fas fa-user-plus"></i> Assign Selected</button>
            <span id="atac-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
          </div>
        </div>
        ${buildTable(
          ['', 'Number', 'Country', 'Currently With'],
          numbers.map(n => [
            `<input type="checkbox" class="atac-check" value="${n.id}">`,
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            n.country || '—',
            n.client_name || n.client_username ? `${n.client_name || n.client_username} (Client)` :
              (n.agent_id && agentLookup[n.agent_id] ? `${agentLookup[n.agent_id]} (Agent)` : '<span class="text-muted">Unassigned</span>')
          ])
        )}
      </div>
    `;
    document.querySelectorAll('.atac-check').forEach(cb => cb.addEventListener('change', atacUpdateCount));
  } catch (err) {
    console.error('Assign to client error:', err);
    toast('Failed to load data', 'error');
  }
}

function atacUpdateCount() {
  const n = document.querySelectorAll('.atac-check:checked').length;
  const el = document.getElementById('atac-selected-count');
  if (el) el.textContent = `${n} selected`;
}

async function atacAssignSelected() {
  const ids = Array.from(document.querySelectorAll('.atac-check:checked')).map(cb => parseInt(cb.value));
  const clientId = parseInt(document.getElementById('atac-client')?.value);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!clientId) { toast('Please select a client', 'error'); return; }
  try {
    const result = await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({ number_ids: ids, target_type: 'client', target_id: clientId, notes: 'Assigned by manager' })
    });
    toast(`✅ Assigned ${result?.assigned || ids.length} number(s)!`, 'success');
    pgAssignToClient();
  } catch (err) {
    console.error('Assign to client error:', err);
    toast('Some numbers failed to assign', 'error');
  }
}

// ═══════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════

function pgProfile() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="page-header"><div><div class="page-title">My Profile</div></div></div>
    <div class="two-col">
      <div class="card">
        <div style="text-align:center;padding:20px 0;">
          <div style="width:72px;height:72px;background:linear-gradient(135deg,#334155,#1e293b);border-radius:50%;
            margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;">
            <i class="fas fa-user-tie"></i>
          </div>
          <div style="font-size:18px;font-weight:700;">${MANAGER_USER.username || 'Manager'}</div>
          <div class="text-muted" style="margin-top:4px;">Manager Account</div>
        </div>
        <div class="separator"></div>
        <form id="profile-form" onsubmit="updateProfile(event)">
          <div class="form-group"><label class="form-label">Username</label>
            <input value="${MANAGER_USER.username || ''}" readonly></div>
          <div class="form-group"><label class="form-label">New Password</label>
            <input type="password" id="profile-pass" placeholder="Leave blank to keep current"></div>
          <div class="form-group"><label class="form-label">Confirm Password</label>
            <input type="password" id="profile-pass-confirm" placeholder="Confirm new password"></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="profile-submit-btn">
              <i class="fas fa-lock"></i> Update
            </button>
          </div>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Account Info</div></div>
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
            <span class="text-muted">Role</span><span class="badge badge-purple">Manager</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
            <span class="text-muted">Status</span><span class="badge badge-green">Active</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
            <span class="text-muted">ID</span><span class="badge badge-gray">#${MANAGER_ID || '?'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;">
            <span class="text-muted">Owner Panel</span>
            <a href="/owner" class="text-accent"><i class="fas fa-arrow-right"></i> Go to Owner</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function updateProfile(event) {
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

    const payload = {};
    if (password) payload.password = password;

    const result = await apiFetch(`/api/users/${MANAGER_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (result && result.id) {
      toast('Password updated successfully', 'success');
      document.getElementById('profile-pass').value = '';
      document.getElementById('profile-pass-confirm').value = '';
    } else {
      toast('Failed to update password', 'error');
    }
  } catch (err) {
    console.error('Update profile error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('profile-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-lock"></i> Update';
    }
  }
}

// ── EARNINGS ──────────────────────────────────────────────────────

async function pgEarnings() {
  try {
    const stats = await apiFetch(`/api/manager/${MANAGER_ID}/stats`);
    const earnings = await apiFetch(`/api/manager/${MANAGER_ID}/earnings`);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">My Earnings</div>
        <div class="page-subtitle">Commission and revenue overview</div></div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgEarnings()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
        ${statCard('Today', 'fas fa-dollar-sign', '$' + (earnings?.today || 0).toFixed(2), 'green', '')}
        ${statCard('This Month', 'fas fa-calendar-days', '$' + (earnings?.this_month || 0).toFixed(2), 'blue', '')}
        ${statCard('Last Month', 'fas fa-history', '$' + (earnings?.last_month || 0).toFixed(2), 'cyan', '')}
        ${statCard('All Time', 'fas fa-coins', '$' + (earnings?.all_time || 0).toFixed(2), 'yellow', '')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Earnings Chart (Last 30 Days)</div></div>
        <div class="chart-container"><canvas id="earn-chart"></canvas></div>
      </div>
      <div class="card" style="margin-top:16px;">
        <div class="card-header"><div class="card-title">Commission Breakdown</div></div>
        ${buildTable(['Date', 'SMS Count', 'Rate', 'Commission', 'Status'],
          (earnings?.history || []).map(e => [
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
      const chartData = earnings?.chart_data || Array.from({ length: 30 }, () => 0);
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
  sessionStorage.removeItem('manager_current_page');
  window.top.location.href = '/login';
}
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});
resetIdleTimer();

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const lastPage = sessionStorage.getItem('manager_current_page') || 'dashboard';
  loadPage(lastPage);
});