/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Admin panel skin
   Same shell/skin as the manager, agent and client panels.
   The admin's own pages and features are untouched — this only
   rebuilds the frame (header, menu, breadcrumb) and applies the skin.
   Loads AFTER app.js / the admin feature scripts.
   ═══════════════════════════════════════════════════════════════ */

document.body.classList.add('light', 'rmsui');
try { localStorage.setItem('theme', 'light'); } catch (e) {}
function toggleTheme() { /* the reference panel is light only */ }

const ZY_ICON_BASE = window.ZY_ICON_BASE || '/static/img/icons/';
function zyIcon(n, cls) {
  const data = window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n];
  return `<img class="${cls || 'zy-icimg'}" src="${data || (ZY_ICON_BASE + n + '.png')}" alt="">`;
}
function zyImg(n, cls) { return zyIcon(n, cls); }

const ZY_LOGO_SRC = window.ZY_LOGO_SRC || '/static/img/mait-sms-logo.png';
const ZY_LOGO = `
<svg viewBox="0 0 250 62" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="zyg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#20344a"/><stop offset="52%" stop-color="#0d1b2a"/>
    <stop offset="53%" stop-color="#050b12"/><stop offset="100%" stop-color="#16283a"/>
  </linearGradient></defs>
  <g fill="url(#zyg)" font-family="Arial Black, Arial, sans-serif" font-size="40" font-weight="900"
     letter-spacing="7" transform="skewX(-4)"><text x="6" y="38">𝑴𝑨𝑰𝑻</text></g>
  <path d="M74 6 L94 6 L78 34 Z" fill="#8FE51F" opacity=".95"/>
  <text x="14" y="55" fill="#5E9800" font-family="Arial, sans-serif" font-size="13" letter-spacing="9">SMS</text>
  <rect x="70" y="50" width="60" height="2" fill="#5E9800"/>
</svg>`;

const ZY_ADMIN_MENU = [
  { t: null, c: '#e0a030', items: [
      ['Dashboard', 'dashboard', 'fa-gauge-high'],
  ] },
  { t: "NUMBERS GROUP", c: '#e8a33d', items: [
      ['My Numbers', 'my-numbers', 'fa-mobile-screen'],
      ['Bulk Allocation', 'bulk-allocation', 'fa-plus'],
      ['Allocation History', 'allocation-history', 'fa-file-lines'],
      ['SMS Ranges', 'sms-ranges', 'fa-layer-group'],
      ['SMS Rate Card', 'sms-rate-card', 'fa-dollar-sign'],
      ['Search Access', 'search-access', 'fa-magnifying-glass'],
      ['Live Access', 'live-access', 'fa-eye'],
      ['Upload Numbers', 'upload-numbers', 'fa-cloud-arrow-up'],
      ['Blacklist Management', 'blacklist-management', 'fa-ban'],
      ['Revoke Numbers', 'revoke-numbers', 'fa-rotate-right'],
      ['Transfer Numbers', 'transfer-numbers', 'fa-right-left'],
      ['Transfer History', 'number-transfers-log', 'fa-list-check'],
      ['Test Numbers', 'test-numbers', 'fa-terminal'],
      ['SMS Test Panel', 'sms-test-panel', 'fa-vial'],
      ['Test Panel Numbers', 'test-panel-numbers', 'fa-mobile-screen'],
      ['Test Panel Accounts', 'test-panel-accounts', 'fa-user-shield'],
  ] },
  { t: "SMS GROUP", c: '#2f7fc4', items: [
      ['My SMS', 'my-sms', 'fa-comment-sms'],
      ['Profit Stats', 'profit-stats', 'fa-dollar-sign'],
      ['Live OTP Feed', 'live-otp-feed', 'fa-bell'],
      ['SMS Analytics', 'sms-analytics', 'fa-chart-line'],
      ['Search SMS', 'search-sms', 'fa-magnifying-glass'],
      ['Delivery Logs', 'delivery-logs', 'fa-file-lines'],
      ['Failed SMS', 'failed-sms', 'fa-xmark'],
      ['Live Traffic', 'live-traffic', 'fa-chart-line'],
  ] },
  { t: "SMPP SERVER", c: '#5aa93f', items: [
      ['Dashboard', 'smpp-dashboard', 'fa-grid-2'],
      ['SMPP Accounts', 'smpp-accounts', 'fa-users'],
      ['Login Panel', 'login-panels', 'fa-right-to-bracket'],
      ['CR API Connected Panel', 'cr-api-panels', 'fa-link'],
      ['SMPP Sessions', 'smpp-sessions', 'fa-eye'],
      ['Connected Clients', 'connected-clients', 'fa-rotate-right'],
      ['DLR Monitor', 'dlr-monitor', 'fa-file-lines'],
      ['Throughput Monitor', 'throughput-monitor', 'fa-chart-line'],
      ['Security Center', 'smpp-security', 'fa-shield'],
      ['Connection Logs', 'connection-logs', 'fa-file-lines'],
  ] },
  { t: "REQUESTS GROUP", c: '#4caf50', items: [
      ['Registration Requests', 'registration-requests', 'fa-user-plus'],
      ['Payout Requests', 'payout-requests', 'fa-wallet'],
  ] },
  { t: "MANAGEMENT GROUP", c: '#d94f4f', items: [
      ['Users', 'users', 'fa-users'],
      ['Managers', 'managers', 'fa-user-tie'],
      ['Agents', 'agents', 'fa-user-secret'],
      ['Clients', 'clients', 'fa-user-group'],
      ['Hierarchy View', 'hierarchy', 'fa-sitemap'],
      ['Account Balances', 'account-balances', 'fa-wallet'],
      ['Audit Logs', 'audit-logs', 'fa-shield'],
      ['Login Activity', 'login-activity', 'fa-user-clock'],
      ['Business Reports', 'business-reports', 'fa-file-lines'],
      ['Permissions', 'permissions', 'fa-key'],
  ] },
  { t: "HTTP PROVIDERS", c: '#8a8a8a', items: [
      ['Overview &amp; Setup', 'http-overview', 'fa-file-lines'],
      ['Standard Webhook', 'standard-webhook', 'fa-share-nodes'],
      ['Custom Postback', 'custom-postback', 'fa-rotate-right'],
      ['Field Mapping Guide', 'field-mapping', 'fa-layer-group'],
      ['Test Endpoint', 'test-endpoint', 'fa-terminal'],
  ] },
  { t: "API GROUP", c: '#f0862d', items: [
      ['API Tokens', 'api-tokens', 'fa-key'],
      ['API Playground', 'api-playground', 'fa-terminal'],
      ['Live Test', 'live-test', 'fa-paper-plane'],
      ['Webhook Config', 'webhook-config', 'fa-share-nodes'],
      ['Documentation', 'documentation', 'fa-file-lines'],
  ] },
  { t: "COMMUNICATION", c: '#8bc34a', items: [
      ['News &amp; Announcements', 'announcements', 'fa-bell'],
      ['Support Tickets', 'support-tickets', 'fa-circle-question'],
  ] },
  { t: "ACCOUNT", c: '#3b8fd4', items: [
      ['My Profile', 'my-profile', 'fa-user'],
      ['My Payouts', 'my-payouts', 'fa-wallet'],
  ] },
  { t: "SECURITY CENTER", c: '#c0392b', items: [
      ['Firewall Dashboard', 'firewall-dashboard', 'fa-shield-halved'],
      ['Blocked IPs', 'blocked-ips', 'fa-ban'],
      ['Firewall Events', 'firewall-events', 'fa-file-lines'],
      ['Rate Limits', 'rate-limits', 'fa-lock'],
  ] },
  { t: "SETTINGS GROUP", c: '#7f8c8d', items: [
      ['General Settings', 'general-settings', 'fa-gear'],
      ['Security', 'security-settings', 'fa-lock'],
      ['SMPP Settings', 'smpp-settings', 'fa-display'],
      ['Backup &amp; Restore', 'backup-restore', 'fa-rotate-right'],
      ['CLI Manager', 'cli-manager', 'fa-terminal'],
      ['OTP Payout Rates', 'payout-rate-settings', 'fa-percent'],
  ] },
];


/* ── chart fallback: the admin pages use Chart.js from a CDN; if that is blocked
      we draw a simple line/bar chart ourselves so no page can crash ────────── */
if (typeof window.Chart === 'undefined') {
  window.Chart = function (cv, cfg) {
    cv = (cv && cv.canvas) ? cv.canvas : cv;
    const ds = ((cfg.data || {}).datasets || [{}])[0] || {};
    const data = (ds.data || []).map(v => Number(v) || 0);
    const labels = (cfg.data || {}).labels || [];
    const type = cfg.type || 'line';
    const box = cv.getBoundingClientRect();
    const W = cv.width = Math.max(240, box.width || 320);
    const H = cv.height = Math.max(160, box.height || 200);
    const c = cv.getContext('2d');
    const L = 40, R = 10, T = 12, B = 28, w = W - L - R, h = H - T - B;
    const top = Math.max(1, ...data);
    c.clearRect(0, 0, W, H); c.font = '11px Roboto, Arial, sans-serif';
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(T + h - h * i / 4) + .5;
      c.strokeStyle = '#e2e2e2'; c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = '#666'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(String(Math.round(top * i / 4)), L - 6, y);
    }
    const n = Math.max(1, data.length - (type === 'bar' ? 0 : 1));
    const colour = ds.borderColor || ds.backgroundColor || '#659A00';
    if (type === 'bar') {
      const bw = w / Math.max(1, data.length) * .6;
      data.forEach((v, i) => {
        const x = L + w * (i + .5) / data.length, y = T + h - h * v / top;
        c.fillStyle = typeof colour === 'string' ? colour : '#659A00';
        c.fillRect(x - bw / 2, y, bw, T + h - y);
      });
    } else {
      c.strokeStyle = typeof colour === 'string' ? colour : '#659A00';
      c.lineWidth = 2; c.beginPath();
      data.forEach((v, i) => { const x = L + w * i / n, y = T + h - h * v / top; i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    }
    c.fillStyle = '#666'; c.textAlign = 'center'; c.textBaseline = 'top';
    labels.forEach((lb, i) => {
      if (labels.length > 8 && i % Math.ceil(labels.length / 6)) return;
      c.fillText(String(lb), L + w * i / n, T + h + 8);
    });
    this.destroy = function () { c.clearRect(0, 0, W, H); };
    this.update = function () {};
    this.data = cfg.data;
  };
  window.Chart.register = function () {};
}

/* ── build the shell from the menu model ───────────────────── */
(function zyBuildAdminShell() {
  const logo = document.getElementById('zy-logo');
  if (logo) logo.innerHTML = ZY_LOGO;

  const side = document.getElementById('zy-sidenav');
  if (side) side.innerHTML = ZY_ADMIN_MENU.map((g, gi) => {
    if (!g.t) {
      return g.items.map(([label, page, icon]) =>
        `<div class="zy-snav nav-item" id="nav-${page}" onclick="loadPage('${page}')">
           <span class="zy-ic"><i class="fas ${icon}" style="color:${g.c}"></i></span><span>${label}</span></div>`).join('');
    }
    return `<div class="zy-snav" onclick="zySideSub('sb-${gi}')">
              <span class="zy-ic"><i class="fas fa-folder" style="color:${g.c}"></i></span><span>${g.t}</span>
              <i class="fas fa-chevron-down zy-caret"></i></div>
            <div class="zy-ssub" id="sb-${gi}">` +
      g.items.map(([label, page]) => `<div onclick="loadPage('${page}')">${label}</div>`).join('') + `</div>`;
  }).join('');

  const mega = document.getElementById('zy-mega');
  if (mega) {
    mega.innerHTML = ZY_ADMIN_MENU.map(g => {
      if (!g.t) return g.items.map(([label, page, icon]) =>
        `<div class="zy-mblock"><div class="zy-mtop" onclick="loadPage('${page}')">
           <span class="zy-mi"><i class="fas ${icon}" style="color:${g.c}"></i></span>${label}</div></div>`).join('');
      return `<div class="zy-mblock">
                <div class="zy-mtop"><span class="zy-mi"><i class="fas fa-folder" style="color:${g.c}"></i></span>${g.t}</div>
                <div class="zy-msub">` +
        g.items.map(([label, page]) => `<div onclick="loadPage('${page}')">${label}</div>`).join('') +
        `</div></div>`;
    }).join('');
    /* the dashboard must be visible on load — the menu opens on the button */
  }

  function tick() {
    const el = document.getElementById('zy-clock'); if (!el) return;
    const d = new Date(), p = n => String(n).padStart(2, '0');
    el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);

  let u = 'Kamran_Bhatti';
  let r = 'Owner';
  try {
    const au = JSON.parse(sessionStorage.getItem('admin_user')) || {};
    if (au.username) u = au.username;
    if (au.role) r = au.role;
  } catch (e) {}
  ['mgr-username', 'mgr-username-side', 'zy-um-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'zy-um-name') el.textContent = `${u} (${r === 'Admin' ? 'Owner' : r})`;
      else el.textContent = u;
    }
  });
  const roleEl = document.getElementById('brand-role');
  if (roleEl) roleEl.textContent = 'Owner Panel';

  document.addEventListener('click', e => {
    const m = document.getElementById('zy-user-menu');
    if (m && !e.target.closest('.zy-head-right')) m.classList.remove('open');
  });
})();

function zyToggleMenu() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function zyToggleUser(e) { e.stopPropagation(); document.getElementById('zy-user-menu')?.classList.toggle('open'); }
function zySideSub(id, trigger) {
  const el = document.getElementById(id);
  if (!el) return;
  const wasOpen = el.classList.contains('open');
  el.classList.toggle('open');
  const nav = trigger || el.previousElementSibling;
  if (nav && nav.classList.contains('zy-snav')) {
    nav.classList.toggle('open', !wasOpen);
  }
}
function toggleSidebar() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function toggleGroup(id) { document.getElementById(id)?.classList.toggle('open'); }

/* breadcrumb + close the sidebar drawer after navigating */
const ZY_ADMIN_LABELS = {};
ZY_ADMIN_MENU.forEach(g => g.items.forEach(([label, page]) => { ZY_ADMIN_LABELS[page] = label; }));
const _zyPrevLoad = loadPage;
loadPage = function (page) {
  _zyPrevLoad(page);
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = ZY_ADMIN_LABELS[page] || bc.textContent || page;
  if (window.zyCloseSidebar) window.zyCloseSidebar();
  document.getElementById('zy-user-menu')?.classList.remove('open');
  window.scrollTo({ top: 0 });
};

/* ═══ DASHBOARD — same layout as the manager/agent/client panels ═══
   (tiles → stat strips → chart → circle stats → panels)
   The data is the admin's own: /api/dashboard/stats + /api/sms/daily-stats  */
function zyLineChart(id, labels, values) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const data = (values || []).map(v => Number(v) || 0);
  const draw = () => {
    const box = cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(240, box.width), H = Math.max(180, box.height);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const L = 46, R = 14, T = 14, B = 34, w = W - L - R, h = H - T - B;
    const peak = Math.max(1, ...data);
    let step = Math.ceil(peak / 5); if (step < 1) step = 1;
    const top = step * 5;
    c.font = '13px Roboto, Arial, sans-serif'; c.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = Math.round(T + h - (h * i / 5)) + .5;
      c.strokeStyle = '#e2e2e2'; c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(String(step * i), L - 8, y);
    }
    const n = Math.max(1, labels.length - 1);
    labels.forEach((lb, i) => {
      const x = Math.round(L + (w * i / n)) + .5;
      c.strokeStyle = '#e2e2e2'; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + h); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(lb, x, T + h + 10);
    });
    if (!data.length) return;
    const px = i => L + (w * i / n), py = v => T + h - (h * v / top);
    c.strokeStyle = '#334155'; c.lineWidth = 2.5; c.lineJoin = 'round'; c.beginPath();
    data.forEach((v, i) => i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)));
    c.stroke(); c.fillStyle = '#334155';
    data.forEach((v, i) => { c.beginPath(); c.arc(px(i), py(v), 5, 0, Math.PI * 2); c.fill(); });
  };
  draw();
  if (window._zyChartR) window.removeEventListener('resize', window._zyChartR);
  window._zyChartR = () => { clearTimeout(window._zyChartT); window._zyChartT = setTimeout(draw, 150); };
  window.addEventListener('resize', window._zyChartR);
}

const ZYT = {};
function zyTable(id, headers, rows, perPage) {
  ZYT[id] = { headers, rows, perPage: perPage || 5, sort: 0, dir: 1, page: 1 };
  return `<div id="${id}"></div>`;
}
function zySort(id, col) { const t = ZYT[id]; if (!t) return;
  if (t.sort === col) t.dir = -t.dir; else { t.sort = col; t.dir = 1; } t.page = 1; zyRender(id); }
function zyPage(id, p) { const t = ZYT[id]; if (!t) return;
  t.page = Math.min(Math.max(1, p), Math.max(1, Math.ceil(t.rows.length / t.perPage))); zyRender(id); }
function zyCell(c) { return (c && typeof c === 'object') ? c : { v: c, h: c }; }
function zyRender(id) {
  const t = ZYT[id], host = document.getElementById(id);
  if (!t || !host) return;
  const rows = t.rows.slice().sort((a, b) => {
    const x = zyCell(a[t.sort]).v, y = zyCell(b[t.sort]).v;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * t.dir;
    return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * t.dir;
  });
  const total = Math.max(1, Math.ceil(rows.length / t.perPage));
  const page = Math.min(t.page, total);
  const slice = rows.slice((page - 1) * t.perPage, page * t.perPage);
  const nums = []; for (let i = 1; i <= Math.min(total, 4); i++) nums.push(i);
  const pager = `<div class="zy-pager">
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',1)">First</button>
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',${page - 1})">Previous</button>
    ${nums.map(n => `<button class="${n === page ? 'on' : ''}" onclick="zyPage('${id}',${n})">${n}</button>`).join('')}
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${page + 1})">Next</button>
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${total})">Last</button></div>`;
  const head = t.headers.map((h, i) =>
    `<th class="${i === t.sort ? 'sorted' : ''}" onclick="zySort('${id}',${i})">${h}</th>`).join('');
  const body = slice.length
    ? slice.map(r => `<tr>${r.map((c, i) => `<td class="${i === t.sort ? 'sorted' : ''}">${zyCell(c).h ?? ''}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="zy-empty" colspan="${t.headers.length}">No data available in table</td></tr>`;
  host.innerHTML = `${pager}<div class="zy-dt-wrap"><table class="zy-dt">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

renderDashboard = async function () {
  const c = document.getElementById('page-content');
  const bc = document.getElementById('breadcrumb'); if (bc) bc.textContent = 'SMS Dashboard';
  try {
    const [stats, daily, ranges, agents] = await Promise.all([
      apiFetch('/api/dashboard/stats'),
      apiFetch('/api/sms/daily-stats'),
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch('/api/agents?limit=50')
    ]);
    const s = stats || {};
    const d = daily || {};
    const traffic = d.weekly_traffic || s.traffic_data || [0, 0, 0, 0, 0, 0, 0];
    const labels = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const tiles = [
      ['Dashboard',   't_monitor', 'dashboard'],
      ['SMS Ranges',  't_flag',    'sms-ranges'],
      ['Managers',    't_person',  'managers'],
      ['Statistics',  't_donut',   'my-sms'],
      ['My Numbers',  't_calc',    'my-numbers']
    ];
    const strips = [
      ['Yesterday SMS',  'stat_today', d.yesterday || 0],
      ['SMS This Week',  'stat_7day',  d.this_week || 0],
      ['SMS This Month', 'stat_30day', d.this_month || 0],
      ['SMS This Year',  'stat_30day', d.all_time || 0]
    ];
    const circles = [
      ['NEW ACCOUNTS',       'circ_accounts', s.active_users || 0],
      ['NEW RANGES',         'circ_numbers',  s.total_ranges || s.total_numbers || 0],
      ['EST. PROFIT WEEKLY', 'circ_sms',      s.revenue_today || 0],
      ['TODAY SMS',          'stat_today',    d.today || s.total_sms_today || 0],
      ['SMS THIS WEEK',      'stat_7day',     d.this_week || 0]
    ];

    const rangeRows = (Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []))
      .slice(0, 25).map(r => [
        r.name || `${r.country || ''} ${r.provider || ''}`.trim(),
        r.prefix || '', r.payterm || '7/1', r.payout != null ? r.payout : ''
      ]);
    const agtRows = ((agents && agents.data) || []).slice(0, 25).map(a => [
      a.username || '', a.email || '', a.skype_id || '',
      { v: a.status || '', h: `<span class="zy-badge-active ${a.status === 'active' ? '' : 'zy-badge-off'}">${a.status === 'active' ? 'Active' : 'Inactive'}</span>` }
    ]);

    c.innerHTML = `
      ${s.down_connections && s.down_connections.length ? `
        <div class="zy-alert">SMPP Connection Down — OTPs may be missed!<br>
          <small>${s.down_connections.map(x => `${x.company} (${x.status})`).join(', ')}</small></div>` : ''}

      <div class="zy-tiles">
        ${tiles.map(([t, ic, p]) => `<div class="zy-tile" onclick="loadPage('${p}')">${zyIcon(ic, 'zy-tileimg')}<span>${t}</span></div>`).join('')}
      </div>

      <div class="zy-strips">
        ${strips.map(([t, ic, v]) => `<div class="zy-strip">
            <span class="zy-strip-ic">${zyIcon(ic)}</span>
            <span class="zy-strip-txt"><b>${t}</b><i>${v}</i></span>
            <span class="zy-strip-up">&#8593;</span></div>`).join('')}
      </div>

      <div class="zy-dash-mid">
        <div class="zy-panel zy-chart-panel">
          <div class="zy-chart-title">SMS LAST 7 DAYS</div>
          <div class="zy-chart-box"><canvas id="zy-week-chart"></canvas></div>
        </div>
        <div class="zy-circles">
          ${circles.map(([t, ic, v]) => `<div class="zy-circle">
              <span class="zy-circle-ic">${zyIcon(ic)}</span>
              <span class="zy-circle-txt"><b>${v}</b><i>${t}</i></span></div>`).join('')}
        </div>
      </div>

      <div class="zy-section-title">Today's Summary</div>
      <div class="zy-dt-wrap" style="margin-bottom:22px;">
        <table class="zy-dt zy-dt-plain">
          <thead><tr><th style="cursor:default">Item</th><th style="cursor:default">Value</th></tr></thead>
          <tbody>
            <tr><td>Total SMS Today</td><td>${s.total_sms_today || 0}</td></tr>
            <tr><td>Revenue Today</td><td>$${s.revenue_today || 0}</td></tr>
            <tr><td>Active Numbers</td><td>${s.active_numbers || 0}</td></tr>
            <tr><td>Success Rate</td><td>${s.success_rate || 0}%</td></tr>
            <tr><td>Pending Requests</td><td>${s.pending_requests || 0}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="zy-dash-panels">
        <div class="zy-panel">
          <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('list')}</span> Recent Billing Groups/Ranges
            <button class="zy-ph-plus" onclick="loadPage('sms-ranges')" title="SMS Ranges">${zyIcon('ui_plus')}</button>
          </div>
          <div class="zy-panel-body">${zyTable('zy-mgrs', ['Range Name', 'Prefix', 'Payterm', 'Payout'], rangeRows, 5)}</div>
        </div>

        <div class="zy-panel">
          <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('users')}</span> Recent Agents
            <button class="zy-ph-plus" onclick="loadPage('agents')" title="Agents">${zyIcon('ui_plus')}</button>
          </div>
          <div class="zy-panel-body">${zyTable('zy-agts', ['Username', 'Email', 'Skype', 'Status'], agtRows, 5)}</div>
        </div>
      </div>`;

    zyRender('zy-mgrs'); zyRender('zy-agts');
    zyLineChart('zy-week-chart', labels, traffic);
  } catch (err) {
    console.error('Admin dashboard error:', err);
    c.innerHTML = `<div class="zy-panel"><div class="zy-panel-body" style="text-align:center;padding:30px;">
        Dashboard could not load. <button class="zy-gear" onclick="renderDashboard()">Retry</button></div></div>`;
  }
};

/* ═══ SMS CDR STATS (My SMS) — authentic speed panel layout ═══ */
renderMySms = async function () {
  const c = document.getElementById('page-content');
  if (typeof zyCrumb === 'function') {
    zyCrumb(['SMS CDR Stats']);
  }
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = 'SMS CDR Stats';

  c.innerHTML = `
    <div class="zy-intro">Here You can view all the sms stats and grouped metrics.</div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="rp-from" value="${typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10)} 00:00:00">
      <input class="zy-fb-input" id="rp-to" value="${typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10)} 23:59:59">
      <select class="zy-fb-input" id="rp-range"><option value="">Filter Range</option></select>
      <select class="zy-fb-input" id="rp-manager"><option value="">Filter Manager</option></select>
      <select class="zy-fb-input" id="rp-agent"><option value="">Filter Agent</option></select>
      <select class="zy-fb-input" id="rp-client"><option value="">Filter Client</option></select>
      <input class="zy-fb-input" id="rp-num" placeholder="Search Number">
      <input class="zy-fb-input" id="rp-cli" placeholder="Search CLI">
      <div class="zy-groupby"><b>Group By :</b>
        ${['Date', 'Month', 'Range', 'Manager', 'Agent', 'Client', 'Number', 'CLI'].map(g =>
          `<label><input type="checkbox" class="grp-chk" value="${g.toLowerCase()}" onchange="renderMySmsLoad()"> ${g}</label>`).join('')}
      </div>
      <div class="zy-fb-btns">
        <button class="zy-btn-orange" onclick="zy2Export('dt-cdr','csv')">Export Report</button>
        <button class="zy-btn-blue" onclick="renderMySmsLoad()">Show Report</button>
      </div>
    </div>
    <div class="zy-panel">
      <div class="zy-panel-head">SMS CDR Reports &amp; Stats</div>
      <div class="zy-panel-body" id="rp-body"><div class="zy-loading">Loading…</div></div>
    </div>
  `;

  try {
    const [rangesRes, managersRes, agentsRes, clientsRes] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch('/api/users?role=Manager&limit=100000'),
      apiFetch('/api/agents?limit=100000'),
      apiFetch('/api/clients?limit=100000')
    ]);

    const ranges = (Array.isArray(rangesRes) ? rangesRes : (rangesRes && rangesRes.data)) || [];
    const managers = (managersRes && managersRes.data) || [];
    const agents = (agentsRes && agentsRes.data) || [];
    const clients = (clientsRes && clientsRes.data) || [];

    const rEl = document.getElementById('rp-range');
    if (rEl) {
      rEl.innerHTML = '<option value="">Filter Range</option>' +
        ranges.map(r => `<option value="${r.id}">${r.name || `${r.country || ''} ${r.prefix || ''}`.trim() || r.id}</option>`).join('');
    }

    const mEl = document.getElementById('rp-manager');
    if (mEl) {
      mEl.innerHTML = '<option value="">Filter Manager</option>' +
        managers.map(m => `<option value="${m.id}">${m.username || m.name || m.id}</option>`).join('');
    }

    const aEl = document.getElementById('rp-agent');
    if (aEl) {
      aEl.innerHTML = '<option value="">Filter Agent</option>' +
        agents.map(a => `<option value="${a.id}">${a.username || a.name || a.id}</option>`).join('');
    }

    const clEl = document.getElementById('rp-client');
    if (clEl) {
      clEl.innerHTML = '<option value="">Filter Client</option>' +
        clients.map(cl => `<option value="${cl.id}">${cl.username || cl.name || cl.id}</option>`).join('');
    }
  } catch (e) {
    console.warn('Failed to populate dropdowns in SMS CDR Stats:', e);
  }

  renderMySmsLoad();
};

async function renderMySmsLoad() {
  const body = document.getElementById('rp-body');
  if (!body) return;
  body.innerHTML = '<div class="zy-loading">Loading…</div>';

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const rangeId = val('rp-range');
  const managerId = val('rp-manager');
  const agentId = val('rp-agent');
  const clientId = val('rp-client');
  const num = val('rp-num'), cli = val('rp-cli');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (rangeId) params.append('range', rangeId);
  if (managerId) params.append('manager_id', managerId);
  if (agentId) params.append('agent_id', agentId);
  if (clientId) params.append('client_id', clientId);
  if (num) params.append('search', num);
  if (cli) params.append('cli', cli);
  if (checkedBoxes.length) params.append('group_by', checkedBoxes.join(','));
  params.append('limit', '1000');

  try {
    const logs = await apiFetch(`/api/sms/logs?${params.toString()}`);
    const data = (logs && logs.data) || [];

    if (logs && logs.grouped && checkedBoxes.length) {
      const keyLabels = {
        date: 'Date',
        month: 'Month',
        range: 'Range',
        manager: 'Manager',
        agent: 'Agent',
        client: 'Client',
        number: 'Number',
        cli: 'CLI'
      };
      const cols = [
        ...checkedBoxes.map(k => keyLabels[k] || k),
        'SMS Count',
        'Currency',
        'Profit'
      ];
      const rows = data.map(g => [
        ...checkedBoxes.map(k => g[k] || '—'),
        g.sms_count || 0,
        g.currency || 'USD',
        `$${Number(g.profit != null ? g.profit : (g.payout || 0)).toFixed(4)}`
      ]);
      const totalSms = data.reduce((s, g) => s + (g.sms_count || 0), 0);
      const totalProfit = data.reduce((s, g) => s + (parseFloat(g.profit != null ? g.profit : g.payout) || 0), 0);

      body.innerHTML = zyDT2('dt-cdr', {
        cols,
        rows,
        sort: checkedBoxes.length,
        dir: -1,
        footRow: `<td><b>Total Groups ${rows.length}</b></td>` +
                 '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
                 `<td><b>Total SMS: ${totalSms}</b></td>` +
                 `<td><b>USD</b></td>` +
                 `<td><b>$${totalProfit.toFixed(4)}</b></td>`
      });
      zy2Render('dt-cdr');
    } else {
      const rows = data.map(s => [
        (s.timestamp || '').replace('T', ' ').slice(0, 19),
        s.range || s.range_label || 'General',
        s.number || '',
        s.cli || s.app || '—',
        s.message || '',
        s.manager || (s.manager_id ? `Manager #${s.manager_id}` : '—'),
        s.agent || (s.agent_id ? `Agent #${s.agent_id}` : '—'),
        s.client || (s.client_id ? `Client #${s.client_id}` : '—'),
        s.currency || 'USD',
        `$${Number(s.profit || 0).toFixed(4)}`,
        s.status === 'delivered' || s.status === 'success' ? 'Success' : (s.status || 'Success'),
        s.ip || '127.0.0.1'
      ]);
      const totalSms = rows.length;
      const totalProfit = data.reduce((acc, s) => acc + (parseFloat(s.profit) || 0), 0);

      body.innerHTML = zyDT2('dt-cdr', {
        cols: ['Date', 'Range', 'Number', 'CLI', 'SMS Message', 'Manager', 'Agent', 'Client', 'Currency', 'Profit', 'Status', 'IP'],
        rows,
        sort: 0,
        dir: -1,
        footRow: `<td><b>Total SMS: ${totalSms}</b></td>` + '<td></td>'.repeat(7) +
                 `<td><b>USD</b></td>` +
                 `<td><b>$${totalProfit.toFixed(4)}</b></td>` +
                 '<td></td><td></td>'
      });
      zy2Render('dt-cdr');
    }
  } catch (err) {
    console.error('SMS CDR Stats load error:', err);
    body.innerHTML = '<div class="zy-empty">Failed to load SMS CDR stats.</div>';
  }
}
