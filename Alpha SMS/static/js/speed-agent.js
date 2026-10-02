/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Agent panel shell + dashboard
   Same skin as the manager panel (speed-panel.css); only the menu
   and the dashboard blocks differ.
   Loads AFTER agent.js / agent_features.js
   ═══════════════════════════════════════════════════════════════ */

document.body.classList.add('light', 'rmsui');
try { localStorage.setItem('theme', 'light'); } catch (e) {}
function toggleTheme() { /* disabled */ }

/* ── icons (cut from the source panel) ─────────────────────── */
const ZY_ICON_BASE = window.ZY_ICON_BASE || '/static/img/icons/';
function zyIcon(n, cls) {
  const data = window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n];
  return `<img class="${cls || 'zy-icimg'}" src="${data || (ZY_ICON_BASE + n + '.png')}" alt="">`;
}
function zyImg(n, cls) { return zyIcon(n, cls); }

/* ── brand ─────────────────────────────────────────────────── */
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

/* ── menu model (from the agent screenshots) ───────────────── */
const ZY_MENU = {
  'dash':      { t: 'Dashboard',            ic: 'dashboard', page: 'dashboard' },
  'iprn':      { t: 'IPRN SMS Module',      ic: 'envelope',
                 sub: [['SMS Ranges', 'sms-ranges'], ['My SMS Numbers', 'my-sms-numbers'],
                       ['SMS RateCard', 'sms-ratecard'], ['Access Search', 'access-search']] },
  'news':      { t: 'News for Clients',     ic: 'news', page: 'news-clients' },
  'clients':   { t: 'My Clients',           ic: 'user', page: 'my-clients' },
  'cdr':       { t: 'CDR & STATISTICS',     ic: 'chart', page: 'detailed-sms' },
  'credit':    { t: 'My Credit Notes',      ic: 'bank', page: 'credit-notes' },
  'payments':  { t: 'Payment Requests',     ic: 'dollar', page: 'payment-requests' },
  'bank':      { t: 'Bank Accounts',        ic: 'bankacc', page: 'bank-accounts' },
  'statements':{ t: 'Statements',           ic: 'statement',
                 sub: [['USD Statements', 'usd-statements'], ['EUR Statements', 'eur-statements'],
                       ['GBP Statements', 'gbp-statements']] },
  'voice':     { t: 'Voice Test Panel',     ic: 'rss', page: 'voice-test-panel' },
  'smstest':   { t: 'SMS Test Panel',       ic: 'rss', page: 'sms-test-panel' }
};
const ZY_SIDE_ORDER = ['dash', 'iprn', 'smstest', 'clients', 'cdr', 'credit', 'payments', 'bank', 'statements', 'news'];
const ZY_MEGA_ORDER = ['dash', 'iprn', 'news', 'clients', 'cdr', 'credit', 'payments', 'bank', 'statements', 'voice', 'smstest'];

const ZY_LABELS = {
  'dashboard': 'Dashboard', 'sms-ranges': 'SMS Ranges', 'my-sms-numbers': 'My SMS Numbers',
  'sms-ratecard': 'SMS RateCard', 'access-search': 'CLI Search', 'news-clients': 'NewsMaster',
  'my-clients': 'Clients', 'detailed-sms': 'SMS CDR Reports', 'summary-sms': 'SMS CDR Stats',
  'client-sms-stats': 'Client SMS Stats', 'sms-range-stats': 'SMS Range Stats',
  'sms-number-stats': 'SMS Number Stats', 'credit-notes': 'My Credit Notes',
  'payment-requests': 'Payment Requests', 'bank-accounts': 'Bank Accounts',
  'usd-statements': 'USD Statements', 'eur-statements': 'EUR Statements', 'gbp-statements': 'GBP Statements',
  'voice-test-panel': 'Test Panel', 'sms-test-panel': 'SMS Test Panel', 'profile': 'My Profile'
};

/* ── week chart, drawn on canvas (no CDN) ──────────────────── */
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
    c.strokeStyle = '#659A00'; c.lineWidth = 2.5; c.lineJoin = 'round'; c.beginPath();
    data.forEach((v, i) => i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)));
    c.stroke(); c.fillStyle = '#659A00';
    data.forEach((v, i) => { c.beginPath(); c.arc(px(i), py(v), 5, 0, Math.PI * 2); c.fill(); });
  };
  draw();
  if (window._zyChartR) window.removeEventListener('resize', window._zyChartR);
  window._zyChartR = () => { clearTimeout(window._zyChartT); window._zyChartT = setTimeout(draw, 150); };
  window.addEventListener('resize', window._zyChartR);
}

/* ── build the shell ───────────────────────────────────────── */
(function zyBuildShell() {
  const logo = document.getElementById('zy-logo');
  if (logo) logo.innerHTML = ZY_LOGO;

  const side = document.getElementById('zy-sidenav');
  if (side) side.innerHTML = ZY_SIDE_ORDER.map(key => {
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

  const mega = document.getElementById('zy-mega');
  if (mega) {
    mega.innerHTML = ZY_MEGA_ORDER.map(key => {
      const m = ZY_MENU[key];
      const click = m.page ? `loadPage('${m.page}')` : '';
      const sub = m.sub ? `<div class="zy-msub zy-msub-white">` +
        m.sub.map(([t, p]) => `<div onclick="loadPage('${p}')">${t}</div>`).join('') + `</div>` : '';
      return `<div class="zy-mblock">
                <div class="zy-mtop" ${click ? `onclick="${click}"` : ''}>
                  <span class="zy-mi">${zyIcon(m.ic)}</span>${m.t}
                </div>${sub}</div>`;
    }).join('');
    if (window.innerWidth >= 992) mega.classList.add('open');
  }

  function tick() {
    const el = document.getElementById('zy-clock'); if (!el) return;
    const d = new Date(), p = n => String(n).padStart(2, '0');
    el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);

  let sess = {};
  try { sess = JSON.parse(sessionStorage.getItem('admin_user') || '{}'); } catch (e) {}
  const u = (window.AGENT_USER && AGENT_USER.username) || sess.username || 'Agent';
  ['mgr-username', 'mgr-username-side', 'agent-username', 'client-username', 'zy-um-name'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = u;
  });
  const sub = document.getElementById('agent-name-sub');
  if (sub) sub.textContent = 'Agent Panel';

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

const _zyPrevLoad = loadPage;
loadPage = function (page) {
  _zyPrevLoad(page);
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = ZY_LABELS[page] || page;
  if (window.zyCloseSidebar) window.zyCloseSidebar();
  document.getElementById('zy-user-menu')?.classList.remove('open');
  window.scrollTo({ top: 0 });
};

/* ═══ DASHBOARD (agent layout) ══════════════════════════════ */
pgDashboard = async function () {
  const c = document.getElementById('page-content');
  const crumb = document.querySelector('.zy-crumb');
  if (crumb) crumb.innerHTML = `<a onclick="loadPage('dashboard')">Home</a><span class="zy-sep">&raquo;</span><span id="breadcrumb">Dashboard</span>`;
  try {
    const [clients, numbers, daily, news] = await Promise.all([
      apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=200`),
      apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`),
      apiFetch(`/api/sms/daily-stats?agent_id=${AGENT_ID}`),
      apiFetch(`/api/announcements?role=Agent&user_id=${AGENT_ID}`)
    ]);
    const clientList = (clients && clients.data) || [];
    const numberList = (numbers && numbers.data) || [];
    const traffic = (daily && daily.weekly_traffic) || [0, 0, 0, 0, 0, 0, 0];
    const newsList = (news && (news.data || news)) || [];

    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const tiles = [
      ['Dashboard',  't_monitor', 'dashboard'],
      ['Ranges',     't_flag',    'sms-ranges'],
      ['Clients',    't_person',  'my-clients'],
      ['Statistics', 't_donut',   'summary-sms'],
      ['My Numbers', 't_calc',    'my-sms-numbers']
    ];
    const strips = [
      ['Today SMS',       'stat_today', (daily && daily.today) || 0],
      ['Last 7 Day SMS',  'stat_7day',  (daily && daily.this_week) || 0],
      ['Last 30 Day SMS', 'stat_30day', (daily && daily.this_month) || 0]
    ];
    const circles = [
      ['NEW ACCOUNTS',   'circ_accounts', clientList.length],
      ['NEW NUMBERS',    'circ_numbers',  numberList.length],
      ['SMS THIS MONTH', 'circ_sms',      (daily && daily.this_month) || 0]
    ];

    const newsRows = newsList.slice(0, 25).map(n => [
      { v: n.created || n.date || '', h: String(n.created || n.date || '').replace('T', ' ').slice(0, 19) },
      { v: n.title || '', h: n.title || '' },
      { v: n.message || n.body || '', h: n.message || n.body || '' }
    ]);
    const clientRows = clientList.slice(0, 25).map(x => [
      { v: x.username || '', h: x.username || '' },
      { v: x.email || '', h: x.email || '' },
      { v: x.skype_id || '', h: x.skype_id || '' },
      { v: x.status || '', h: `<span class="zy-badge-active ${x.status === 'active' ? '' : 'zy-badge-off'}">${x.status === 'active' ? 'Active' : 'Inactive'}</span>` },
      { v: '', h: `<button class="zy-gear" onclick="loadPage('my-clients')">${zyIcon('ui_gear')}</button>` }
    ]);

    c.innerHTML = `
      <div class="zy-tiles">
        ${tiles.map(([t, ic, p]) => `<div class="zy-tile" onclick="loadPage('${p}')">${zyIcon(ic, 'zy-tileimg')}<span>${t}</span></div>`).join('')}
      </div>

      <div class="zy-strips">
        ${strips.map(([t, ic, v]) => `<div class="zy-strip">
            <span class="zy-strip-ic">${zyIcon(ic)}</span>
            <span class="zy-strip-txt"><b>${t}</b><i>${v}</i></span>
            <span class="zy-strip-up">&#8593;</span></div>`).join('')}
      </div>

      <div class="zy-panel zy-chart-panel">
        <div class="zy-chart-title">SMS LAST 7 DAYS</div>
        <div class="zy-chart-box"><canvas id="zy-week-chart"></canvas></div>
      </div>

      <div class="zy-circles">
        ${circles.map(([t, ic, v]) => `<div class="zy-circle">
            <span class="zy-circle-ic">${zyIcon(ic)}</span>
            <span class="zy-circle-txt"><b>${v}</b><i>${t}</i></span></div>`).join('')}
      </div>

      <div class="zy-panel">
        <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('list')}</span> News &amp; Notifications</div>
        <div class="zy-panel-body">${zyTable('zy-news', ['Date', 'Headline', 'News'], newsRows, 5)}</div>
      </div>

      <div class="zy-panel">
        <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('users')}</span> Recent Clients
          <button class="zy-ph-plus" onclick="loadPage('my-clients')" title="Add Client">${zyIcon('ui_plus')}</button>
        </div>
        <div class="zy-panel-body">${zyTable('zy-clients', ['Username', 'Email', 'Skype', 'Status', 'Action'], clientRows, 5)}</div>
      </div>`;

    zyRender('zy-news'); zyRender('zy-clients');
    zyLineChart('zy-week-chart', labels, traffic);
  } catch (err) {
    console.error('Agent dashboard error:', err);
    c.innerHTML = `<div class="zy-panel"><div class="zy-panel-body" style="text-align:center;padding:30px;">
        Dashboard could not load. <button class="zy-gear" onclick="pgDashboard()">Retry</button></div></div>`;
  }
};

/* ── small table used on the dashboard ─────────────────────── */
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
  t.page = Math.min(Math.max(1, p), Math.max(1, Math.ceil(t.rows.length / t.perPage))); zyRender(id);
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
  const nums = []; for (let i = 1; i <= Math.min(total, 4); i++) nums.push(i);
  const pager = `<div class="zy-pager">
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',1)">First</button>
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',${page - 1})">Previous</button>
    ${nums.map(n => `<button class="${n === page ? 'on' : ''}" onclick="zyPage('${id}',${n})">${n}</button>`).join('')}
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${page + 1})">Next</button>
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${total})">Last</button></div>`;
  const head = t.headers.map((h, i) => {
    const on = i === t.sort;
    const ic = (typeof zySortIc === 'function') ? zySortIc(on, t.dir) : '';
    return `<th class="${on ? 'sorted' : ''}" onclick="zySort('${id}',${i})">${h}${ic}</th>`;
  }).join('');
  const body = slice.length
    ? slice.map(r => `<tr>${r.map((c, i) => `<td class="${i === t.sort ? 'sorted' : ''}">${zyCell(c).h ?? ''}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="zy-empty" colspan="${t.headers.length}">No data available in table</td></tr>`;
  host.innerHTML = `${pager}<div class="zy-dt-wrap"><table class="zy-dt">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
