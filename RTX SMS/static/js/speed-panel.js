/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Manager Panel shell + dashboard
   Loads AFTER manager.js and manager_features.js
   ═══════════════════════════════════════════════════════════════ */

/* Force the light MAIT SMS look (no dark mode in this design) */
document.body.classList.add('light', 'rmsui');
try { localStorage.setItem('theme', 'light'); } catch (e) {}
function toggleTheme() { /* disabled in MAIT SMS panel skin */ }

/* ── Menu model ─────────────────────────────────────────────── */
const ZY_MENU = {
  'dashboard-x':   { t: 'Dashboard',            ic: 'dashboard', page: 'dashboard' },
  'iprn':          { t: 'IPRN SMS Module',      ic: 'envelope',
                     sub: [['SMS Ranges', 'sms-overview'], ['SMS Numbers', 'my-numbers'],
                           ['SMS RateCard', 'payout-rates-view'], ['SMS Bulk Allocations', 'assign-numbers']] },
  'users':         { t: 'Users Master',         ic: 'shuffle',
                     sub: [['Agents', 'agents'], ['Clients', 'clients']] },
  'news':          { t: 'News for Clients',     ic: 'news', page: 'news' },
  'myclients':     { t: 'My Clients',           ic: 'user', page: 'clients' },
  'cdr':           { t: 'CDR & STATISTICS',     ic: 'chart', page: 'reports' },
  'credit':        { t: 'Agent Credit Notes',   ic: 'bank', page: 'my-earnings' },
  'payments':      { t: 'Payment Requests',     ic: 'dollar', page: 'payout-requests' },
  'statements':    { t: 'Statements',           ic: 'statement',
                     sub: [['USD Statements', 'usd-statements'], ['EUR Statements', 'eur-statements'], ['GBP Statements', 'gbp-statements']] },
  'testpanel':     { t: 'SMS Test Panel',       ic: 'rss', page: 'sms-test-panel' }
};
const ZY_SIDE_ORDER = ['dashboard-x', 'iprn', 'users', 'testpanel', 'cdr', 'credit', 'payments', 'statements'];
const ZY_MEGA_ORDER = ['dashboard-x', 'iprn', 'users', 'news', 'myclients', 'cdr', 'credit', 'payments', 'statements', 'testpanel'];

const ZY_LABELS = {
  'dashboard': 'SMS Dashboard', 'sms-overview': 'SMS Ranges', 'my-numbers': 'SMS Numbers',
  'payout-rates-view': 'SMS RateCard', 'assign-numbers': 'SMS Bulk Allocations',
  'agents': 'Agents', 'clients': 'Clients', 'news': 'News for Clients',
  'reports': 'SMS Reports', 'my-earnings': 'Agent Credit Notes',
  'payout-requests': 'Payment Requests', 'sms-test-panel': 'SMS Test Panel',
  'add-agent': 'Add Agent', 'add-client': 'Add Client', 'profile': 'My Profile',
  'agent-performance': 'Agent Performance', 'client-balances': 'Client Balances',
  'client-limits': 'Limits & Quotas', 'traffic': 'Live Traffic', 'api-tokens': 'API Tokens',
  'assign-to-client': 'Assign to Client', 'transfer-history': 'Transfer History'
};


/* ── Icons — cut straight from the source panel (same colours, 1:1) ── */
const ZY_ICON_BASE = window.ZY_ICON_BASE || '/static/img/icons/';
function zyIcon(n, cls) {
  const data = window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n];
  return `<img class="${cls || 'zy-icimg'}" src="${data || (ZY_ICON_BASE + n + '.png')}" alt="">`;
}

/* ── 𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 brand (logo + wordmark) ────────────────────────── */
const ZY_LOGO_SRC = window.ZY_LOGO_SRC || '/static/img/mait-sms-logo.png';
const ZY_LOGO = `
<svg viewBox="0 0 250 62" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zyg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#20344a"/><stop offset="52%" stop-color="#0d1b2a"/>
      <stop offset="53%" stop-color="#050b12"/><stop offset="100%" stop-color="#16283a"/>
    </linearGradient>
  </defs>
  <g fill="url(#zyg)" font-family="Arial Black, Arial, sans-serif" font-size="40" font-weight="900"
     letter-spacing="7" transform="skewX(-4)">
    <text x="6" y="38">𝑴𝑨𝑰𝑻</text>
  </g>
  <path d="M74 6 L94 6 L78 34 Z" fill="#8FE51F" opacity=".95"/>
  <text x="14" y="55" fill="#5E9800" font-family="Arial, sans-serif" font-size="13" letter-spacing="9">SMS</text>
  <rect x="70" y="50" width="60" height="2" fill="#5E9800"/>
</svg>`;

/* ── Dashboard tile icons (cut from the source panel) ───────── */
const ZY_ICONS = {
  monitor: zyIcon('t_monitor', 'zy-tileimg'),
  flag:    zyIcon('t_flag',    'zy-tileimg'),
  person:  zyIcon('t_person',  'zy-tileimg'),
  donut:   zyIcon('t_donut',   'zy-tileimg'),
  calc:    zyIcon('t_calc',    'zy-tileimg')
};

/* ── Build the shell ────────────────────────────────────────── */
(function zyBuildShell() {
  const logo = document.getElementById('zy-logo');
  if (logo) logo.innerHTML = ZY_LOGO;

  /* sidebar */
  const side = document.getElementById('zy-sidenav');
  if (side) {
    side.innerHTML = ZY_SIDE_ORDER.map(key => {
      const m = ZY_MENU[key];
      const idAttr = m.page ? ` id="nav-${m.page}"` : '';
      const cls = m.page ? 'zy-snav nav-item' : 'zy-snav';
      const click = m.page ? `loadPage('${m.page}')` : `zySideSub('sb-${key}')`;
      const caret = m.sub ? `<i class="fas fa-chevron-down zy-caret"></i>` : '';
      const sub = m.sub ? `<div class="zy-ssub" id="sb-${key}">` +
        m.sub.map(([t, p]) => `<div onclick="loadPage('${p}')">${t}</div>`).join('') + `</div>` : '';
      return `<div class="${cls}"${idAttr} onclick="${click}">
                <span class="zy-ic">${zyIcon(m.ic)}</span><span>${m.t}</span>${caret}
              </div>${sub}`;
    }).join('');
  }

  /* mega menu */
  const mega = document.getElementById('zy-mega');
  if (mega) {
    mega.innerHTML = ZY_MEGA_ORDER.map(key => {
      const m = ZY_MENU[key];
      const click = m.page ? `loadPage('${m.page}')` : '';
      const sub = m.sub ? `<div class="zy-msub">` +
        m.sub.map(([t, p]) => `<div onclick="loadPage('${p}')">${t}</div>`).join('') + `</div>` : '';
      return `<div class="zy-mblock">
                <div class="zy-mtop" ${click ? `onclick="${click}"` : ''}>
                  <span class="zy-mi">${zyIcon(m.ic)}</span>${m.t}
                </div>${sub}</div>`;
    }).join('');
    if (window.innerWidth >= 992) mega.classList.add('open');
  }

  /* clock */
  function tick() {
    const el = document.getElementById('zy-clock');
    if (!el) return;
    const d = new Date(), p = n => String(n).padStart(2, '0');
    el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);

  /* usernames — read from whichever role object is present, else the session.
     The same shell serves Manager / Agent / Client, so fill every id. */
  let sess = {};
  try { sess = JSON.parse(sessionStorage.getItem('admin_user') || '{}'); } catch (e) {}
  const roleUser = window.MANAGER_USER || window.AGENT_USER || window.CLIENT_USER || sess;
  const u = (roleUser && roleUser.username) || sess.username || '';
  ['mgr-username', 'mgr-username-side', 'agent-username', 'client-username', 'zy-um-name'].forEach(id => {
    const el = document.getElementById(id); if (el && u) el.textContent = u;
  });
  const sub = document.getElementById('mgr-name-sub');
  if (sub) sub.textContent = 'Manager Panel';

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

/* ── Breadcrumb "Home » X" + close mobile sidebar drawer on navigation ── */
const _zyPrevLoad = loadPage;
loadPage = function (page) {
  _zyPrevLoad(page);
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = ZY_LABELS[page] || bc.textContent || page;
  if (window.zyCloseSidebar) window.zyCloseSidebar();
  document.getElementById('zy-user-menu')?.classList.remove('open');
  window.scrollTo({ top: 0 });
};

/* ── DataTable (MAIT SMS / DataTables look) ────────────────────── */
const ZYT = {};
function zyTable(id, headers, rows, perPage) {
  ZYT[id] = { headers, rows, perPage: perPage || 5, sort: 0, dir: 1, page: 1 };
  return `<div id="${id}"></div>`;
}
function zySort(id, col) {
  const t = ZYT[id]; if (!t) return;
  if (t.sort === col) t.dir = -t.dir; else { t.sort = col; t.dir = 1; }
  t.page = 1; zyRender(id);
}
function zyPage(id, p) {
  const t = ZYT[id]; if (!t) return;
  const max = Math.max(1, Math.ceil(t.rows.length / t.perPage));
  t.page = Math.min(Math.max(1, p), max); zyRender(id);
}
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

  const nums = [];
  for (let i = 1; i <= Math.min(total, 4); i++) nums.push(i);

  const pager = `<div class="zy-pager">
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',1)">First</button>
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',${page - 1})">Previous</button>
    ${nums.map(n => `<button class="${n === page ? 'on' : ''}" onclick="zyPage('${id}',${n})">${n}</button>`).join('')}
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${page + 1})">Next</button>
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${total})">Last</button>
  </div>`;

  const head = t.headers.map((h, i) => {
    const on = i === t.sort;
    const ic = (typeof zySortIc === 'function')
      ? zySortIc(on, t.dir)
      : `<span class="zy-sort">${on ? (t.dir === 1 ? '▲' : '▼') : '⇅'}</span>`;
    return `<th class="${on ? 'sorted' : ''}" onclick="zySort('${id}',${i})">${h}${ic}</th>`;
  }).join('');

  const body = slice.length
    ? slice.map(r => `<tr>${r.map((c, i) => {
        const cell = zyCell(c);
        return `<td class="${i === t.sort ? 'sorted' : ''}">${cell.h ?? ''}</td>`;
      }).join('')}</tr>`).join('')
    : `<tr><td class="zy-empty" colspan="${t.headers.length}">No data available in table</td></tr>`;

  host.innerHTML = `${pager}<div class="zy-dt-wrap"><table class="zy-dt">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ── week chart, drawn on the canvas (no CDN needed) ────────── */
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
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    const L = 46, R = 14, T = 14, B = 34;
    const w = W - L - R, h = H - T - B;
    const peak = Math.max(1, ...data);
    let step = Math.ceil(peak / 5); if (step < 1) step = 1;
    const top = step * 5;

    c.font = '13px Roboto, Arial, sans-serif';
    c.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = Math.round(T + h - (h * i / 5)) + .5;
      c.strokeStyle = '#e2e2e2';
      c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(String(step * i), L - 8, y);
    }
    const n = Math.max(1, labels.length - 1);
    labels.forEach((lb, i) => {
      const x = Math.round(L + (w * i / n)) + .5;
      c.strokeStyle = '#e2e2e2';
      c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + h); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(lb, x, T + h + 10);
    });

    if (!data.length) return;
    const px = i => L + (w * i / n);
    const py = v => T + h - (h * v / top);
    c.strokeStyle = '#659A00'; c.lineWidth = 2.5; c.lineJoin = 'round';
    c.beginPath();
    data.forEach((v, i) => i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)));
    c.stroke();
    c.fillStyle = '#659A00';
    data.forEach((v, i) => { c.beginPath(); c.arc(px(i), py(v), 5, 0, Math.PI * 2); c.fill(); });
  };
  draw();
  if (window._zyChartR) window.removeEventListener('resize', window._zyChartR);
  window._zyChartR = () => { clearTimeout(window._zyChartT); window._zyChartT = setTimeout(draw, 150); };
  window.addEventListener('resize', window._zyChartR);
}

/* ── DASHBOARD (panel layout) ───────────────────────────────── */
pgDashboard = async function () {
  const c = document.getElementById('page-content');
  try {
    const [stats, daily, agentsRes, ranges] = await Promise.all([
      apiFetch(`/api/manager/${MANAGER_ID}/stats`),
      apiFetch(`/api/sms/daily-stats?manager_id=${MANAGER_ID}`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`),
      apiFetch(`/api/numbers/sms-ranges`)
    ]);

    const agents = (agentsRes && agentsRes.data) || [];
    const rangeList = Array.isArray(ranges) ? ranges : [];
    const traffic = (daily && daily.weekly_traffic) || [0, 0, 0, 0, 0, 0, 0];

    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const tiles = [
      ['Dashboard',   ZY_ICONS.monitor, 'dashboard'],
      ['SMS Ranges',  ZY_ICONS.flag,    'sms-overview'],
      ['Agents',      ZY_ICONS.person,  'agents'],
      ['Statistics',  ZY_ICONS.donut,   'reports'],
      ['SMS Numbers', ZY_ICONS.calc,    'my-numbers']
    ];

    const topAgents = agents.filter(a => (a.today_otp || 0) > 0)
      .sort((a, b) => (b.today_otp || 0) - (a.today_otp || 0)).slice(0, 5);

    const rangeRows = rangeList.map(r => [
      { v: r.name || r.range_name || '—', h: r.name || r.range_name || '—' },
      { v: r.prefix || r.prefix_code || '', h: r.prefix || r.prefix_code || '' }
    ]);

    const agentRows = agents.map(a => [
      { v: a.username || '', h: a.username || '—' },
      { v: a.email || '',    h: a.email || '' },
      { v: a.skype || '',    h: a.skype || '' },
      { v: a.status || '',   h: `<span class="zy-badge-active ${a.status === 'active' ? '' : 'zy-badge-off'}">${a.status === 'active' ? 'Active' : 'Inactive'}</span>` },
      { v: '', h: `<button class="zy-gear" onclick="zyAgentActions(${a.id})">${zyIcon('ui_gear')}</button>` }
    ]);

    c.innerHTML = `
      <div class="zy-tiles">
        ${tiles.map(([t, ic, p]) => `<div class="zy-tile" onclick="loadPage('${p}')">${ic}<span>${t}</span></div>`).join('')}
      </div>

      <div class="zy-panel zy-chart-panel">
        <div class="zy-chart-title">SMS LAST 1 Week</div>
        <div class="zy-chart-box"><canvas id="zy-week-chart"></canvas></div>
      </div>

      <div class="zy-section-title">Today's Top Agents</div>
      <div class="zy-dt-wrap" style="margin-bottom:22px;">
        <table class="zy-dt zy-dt-plain">
          <thead><tr><th style="cursor:default">Username</th><th style="cursor:default">Total SMS</th></tr></thead>
          <tbody>
            ${topAgents.length
              ? topAgents.map(a => `<tr><td>${a.username}</td><td>${a.today_otp}</td></tr>`).join('')
              : `<tr><td class="zy-empty" colspan="2">No SMS today</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="zy-panel">
        <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('list')}</span> Recent Billing Groups/Ranges</div>
        <div class="zy-panel-body">${zyTable('zy-ranges', ['Range Name', 'Prefix'], rangeRows, 5)}</div>
      </div>

      <div class="zy-panel">
        <div class="zy-panel-head">
          <span class="zy-ph-ic">${zyIcon('users')}</span> Recent Agents
          <button class="zy-ph-plus" onclick="loadPage('agents')" title="Add Agent">${zyIcon('ui_plus')}</button>
        </div>
        <div class="zy-panel-body">${zyTable('zy-agents', ['Username', 'Email', 'Skype', 'Status', 'Action'], agentRows, 5)}</div>
      </div>
    `;

    zyRender('zy-ranges');
    zyRender('zy-agents');

    zyLineChart('zy-week-chart', labels, traffic);

    const bc = document.getElementById('breadcrumb');
    if (bc) bc.textContent = 'SMS Dashboard';

  } catch (err) {
    console.error('Dashboard error:', err);
    c.innerHTML = `<div class="zy-panel"><div class="zy-panel-body" style="text-align:center;padding:30px;">
        Dashboard could not load. <button class="zy-gear" onclick="pgDashboard()">Retry</button></div></div>`;
  }
};

function zyAgentActions(id) {
  openModal('Agent Actions', `
    <div style="display:grid;gap:10px;">
      <button class="btn btn-primary" onclick="closeModal();openEditAgentModal(${id})"><i class="fas fa-pen"></i> Edit Agent</button>
      <button class="btn btn-outline" onclick="closeModal();loadPage('agent-performance')"><i class="fas fa-chart-line"></i> Performance</button>
      <button class="btn btn-outline" onclick="closeModal();loadPage('agents')"><i class="fas fa-users"></i> All Agents</button>
    </div>`);
}
