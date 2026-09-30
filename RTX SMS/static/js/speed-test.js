/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — TEST PANEL shell + dashboard
   Same skin as the manager/agent panels (speed-panel.css), but with
   the test panel's own menu, tiles and pages:
       Dashboard · SMS Test Numbers · Test SMS Summary Reports
   Loaded FIRST, before speed-kit.js / speed-test-pages.js.
   ═══════════════════════════════════════════════════════════════ */

document.body.classList.add('light', 'rmsui', 'tpui');
function toggleTheme() { /* the panel is always light */ }

/* ── Session ────────────────────────────────────────────────── */
let TP_USER = {};
(function tpAuth() {
  try {
    TP_USER = JSON.parse(sessionStorage.getItem('tp_user') ||
                         sessionStorage.getItem('admin_user') || '{}');
  } catch (e) { TP_USER = {}; }
  if (!TP_USER.username) {
    TP_USER = { username: 'Public Tester', role: 'Tester' };
  }
})();

function doLogout() {
  if (window.SpeedAuth) {
    window.SpeedAuth.clearSession();
    return;
  }
  ['tp_logged_in', 'tp_user', 'admin_logged_in', 'admin_user', 'active_session_active', 'active_session_role'].forEach(k => {
    try { sessionStorage.removeItem(k); } catch (e) {}
    try { localStorage.removeItem(k); } catch (e) {}
  });
  window.location.replace('/login');
}

/* ── API + toast (the kit and the pages use these) ───────────── */
async function apiFetch(path, opts = {}, retries = 2) {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return await res.json();
  } catch (err) {
    if (retries > 0 && (err.name === 'TypeError' || String(err.message).toLowerCase().includes('failed to fetch'))) {
      await new Promise(r => setTimeout(r, 350));
      return apiFetch(path, opts, retries - 1);
    }
    console.error(`apiFetch error [${path}]:`, err);
    if (!opts.silent) {
      toast(err.message || 'Request failed', 'error');
    }
    return null;
  }
}
function toast(msg, type = 'info') {
  const box = document.getElementById('toast-container');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() {
  const ov = document.getElementById('modal-overlay');
  if (ov) { ov.classList.remove('show', 'active'); ov.style.display = ''; }
  const m = document.getElementById('modal');
  if (m) m.classList.remove('zy-modal');
}

/* ── Icons (cropped from the source panel) ──────────────────── */
const ZY_ICON_BASE = '/static/img/icons/';
function zyIcon(n, cls) { return `<img class="${cls || 'zy-icimg'}" src="${ZY_ICON_BASE + n}.png" alt="">`; }

/* ── Menu — exactly the three items the source test panel has ── */
const TP_MENU = [
  { t: 'Dashboard',                 ic: 'dashboard', page: 'dashboard' },
  { t: 'SMS Test Numbers',          ic: 'envelope',  page: 'test-numbers' },
  { t: 'Test SMS Summary Reports',  ic: 'mi_cubes',  page: 'test-reports' }
];
const TP_LABELS = {
  'dashboard': 'Dashboard',
  'test-numbers': 'SMS Test Numbers',
  'test-reports': 'Test SMS CDR Stats'
};

/* ── Shell ──────────────────────────────────────────────────── */
(function tpBuildShell() {
  const mega = document.getElementById('zy-mega');
  if (mega) {
    mega.innerHTML = TP_MENU.map(m => `
      <div class="zy-mblock">
        <div class="zy-mtop" onclick="loadPage('${m.page}')">
          <span class="zy-mi">${zyIcon(m.ic)}</span>${m.t}
        </div>
      </div>`).join('');
    if (window.innerWidth >= 992) mega.classList.add('open');
  }

  const u = TP_USER.username || 'Test';
  const el = document.getElementById('tp-username');
  if (el) el.textContent = u;

  document.addEventListener('click', e => {
    const m = document.getElementById('zy-user-menu');
    if (m && !e.target.closest('.zy-head-right')) m.classList.remove('open');
  });
})();

function zyToggleMenu() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function zyToggleUser(e) { e.stopPropagation(); document.getElementById('zy-user-menu')?.classList.toggle('open'); }
function toggleSidebar() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }

/* ── Router ─────────────────────────────────────────────────── */
const TP_PAGES = {
  'dashboard':    () => tpDashboard(),
  'test-numbers': () => pgTestNumbers(),
  'test-reports': () => pgTestCdrStats()
};
function loadPage(page) {
  const fn = TP_PAGES[page] || TP_PAGES['dashboard'];
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = TP_LABELS[page] || 'Dashboard';
  if (window.zyCloseSidebar) window.zyCloseSidebar();
  document.getElementById('zy-user-menu')?.classList.remove('open');
  return fn();
}

/* ── Small 5-row table used by the dashboard panels ─────────── */
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
    const ic = i === t.sort
      ? `<img class="zy-sort-ic${t.dir < 0 ? ' zy-desc' : ''}" src="${ZY_ICON_BASE}ui_sort_asc.png" alt="">`
      : `<img class="zy-sort-ic" src="${ZY_ICON_BASE}ui_sort.png" alt="">`;
    return `<th onclick="zySort('${id}',${i})">${h}${ic}</th>`;
  }).join('');

  host.innerHTML = pager + `<div class="zy-dt-wrap"><table class="zy-dt">
      <thead><tr>${head}</tr></thead>
      <tbody>${slice.length
        ? slice.map(r => `<tr>${r.map((c, i) => `<td class="${i === t.sort ? 'sorted' : ''}">${zyCell(c).h ?? ''}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="zy-empty" colspan="${t.headers.length}">No data available in table</td></tr>`}
      </tbody></table></div>`;
}

/* ── "SMS LAST 1 Week" chart (drawn on the canvas, no CDN) ──── */
function zyLineChart(id, labels, values) {
  const cv = document.getElementById(id); if (!cv) return;
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);

    const padL = 34, padR = 12, padT = 10, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const max = Math.max(2, ...values);
    const step = Math.max(1, Math.ceil(max / 8));
    const top = Math.ceil(max / step) * step;

    x.strokeStyle = '#e2e2e2'; x.lineWidth = 1;
    x.font = '11px Roboto, Arial, sans-serif'; x.fillStyle = '#555';
    for (let v = 0; v <= top; v += step) {
      const y = padT + ih - (v / top) * ih;
      x.beginPath(); x.moveTo(padL, y + .5); x.lineTo(padL + iw, y + .5); x.stroke();
      x.textAlign = 'right'; x.fillText(String(v), padL - 6, y + 4);
    }
    const n = values.length;
    const px = i => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    for (let i = 0; i < n; i++) {
      x.beginPath(); x.moveTo(px(i) + .5, padT); x.lineTo(px(i) + .5, padT + ih); x.stroke();
    }
    x.textAlign = 'center';
    labels.forEach((l, i) => { if (i % 2 === 0) x.fillText(l, px(i), h - 8); });

    x.strokeStyle = '#659A00'; x.lineWidth = 2.5; x.beginPath();
    values.forEach((v, i) => {
      const y = padT + ih - (v / top) * ih;
      i ? x.lineTo(px(i), y) : x.moveTo(px(i), y);
    });
    x.stroke();
    x.fillStyle = '#659A00';
    values.forEach((v, i) => {
      const y = padT + ih - (v / top) * ih;
      x.beginPath(); x.arc(px(i), y, 5, 0, Math.PI * 2); x.fill();
    });
  }
  draw();
  if (window._tpChartR) window.removeEventListener('resize', window._tpChartR);
  window._tpChartR = () => { clearTimeout(window._tpChartT); window._tpChartT = setTimeout(draw, 150); };
  window.addEventListener('resize', window._tpChartR);
}

/* ── DASHBOARD ──────────────────────────────────────────────── */
async function tpDashboard() {
  const c = document.getElementById('page-content');
  const [stats, logs, ranges] = await Promise.all([
    apiFetch('/api/sms/test-stats'),
    apiFetch('/api/sms/test-logs?limit=500'),
    apiFetch('/api/numbers/sms-ranges')
  ]);

  const s = stats || {};
  const rangeList = Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []);
  const logList = (logs && logs.data) || [];

  /* last 7 days from the test logs, oldest first */
  const labels = [], traffic = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    traffic.push(logList.filter(l => String(l.timestamp || l.date || '').slice(0, 10) === key).length);
  }

  const tiles = [
    ['Dashboard',        't_monitor', 'dashboard',    true],
    ['Test Numbers',     't_calc',    'test-numbers', false],
    ['Detailed Reports', 't_pie',     'test-reports', false],
    ['Statistics',       't_donut',   'test-reports', false],
    ['Logout',           't_person',  '',             false]
  ];

  const strips = [
    ['Today SMS',       'stat_today',  s.today ?? 0],
    ['Last 7 Day SMS',  'stat_7day',   s.this_week ?? 0],
    ['Last 30 Day SMS', 'stat_30day',  s.this_month ?? 0]
  ];

  const rangeRows = rangeList.map(r => [
    { v: r.name || r.country || '', h: r.name || r.country || '' },
    { v: r.test_number || '',       h: r.test_number || '' }
  ]);

  c.innerHTML = `
    <div class="zy-tiles">
      ${tiles.map(([t, ic, p, on]) => `<div class="zy-tile${on ? ' zy-tile-on' : ''}"
          onclick="${p ? `loadPage('${p}')` : 'doLogout()'}">${zyIcon(ic, 'zy-tileimg')}<span>${t}</span></div>`).join('')}
    </div>

    <div class="zy-strips">
      ${strips.map(([t, ic, v]) => `<div class="zy-strip">
          <span class="zy-strip-ic">${zyIcon(ic, 'zy-stripimg')}</span>
          <span class="zy-strip-txt"><b>${t}</b><i>${v}</i></span>
          <span class="zy-strip-up">&#8593;</span>
        </div>`).join('')}
    </div>

    <div class="zy-panel zy-chart-panel">
      <div class="zy-chart-title">SMS LAST 1 Week</div>
      <div class="zy-chart-box"><canvas id="tp-week-chart"></canvas></div>
    </div>

    <div class="zy-panel">
      <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('list')}</span> News &amp; Notifications</div>
      <div class="zy-panel-body">${zyTable('tp-news', ['Date', 'Headline', 'News'], [], 5)}</div>
    </div>

    <div class="zy-panel">
      <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('users')}</span> Recent Ranges</div>
      <div class="zy-panel-body">${zyTable('tp-ranges', ['Range', 'Test Number'], rangeRows, 5)}</div>
    </div>`;

  zyRender('tp-news');
  zyRender('tp-ranges');
  zyLineChart('tp-week-chart', labels, traffic);
}

/* boot */
document.addEventListener('DOMContentLoaded', () => loadPage('test-reports'));
