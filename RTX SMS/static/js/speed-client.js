/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Client panel (shell + dashboard + pages)
   Same skin as the manager/agent panels; the client menu is short:
   Dashboard | My SMS Numbers | SMS Reports | SMS Test Panel
   Loads AFTER client.js, BEFORE speed-kit.js is used by the pages.
   ═══════════════════════════════════════════════════════════════ */

document.body.classList.add('light', 'rmsui');
try { localStorage.setItem('theme', 'light'); } catch (e) {}
function toggleTheme() { /* disabled */ }

const ZY_ICON_BASE = window.ZY_ICON_BASE || '/static/img/icons/';
function zyIcon(n, cls) {
  const data = window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n];
  return `<img class="${cls || 'zy-icimg'}" src="${data || (ZY_ICON_BASE + n + '.png')}" alt="">`;
}
function zyImg(n, cls) { return zyIcon(n, cls); }

/* ── menu (matches video exactly) ────────────────────────── */
const ZY_MENU = {
  'dash':      { t: 'DASHBOARD',        ic: 'dashboard',  page: 'dashboard' },
  'clisearch': { t: 'CLI SEARCH',       ic: 'search',     page: 'access-search' },
  'smsmodule': { t: 'SMS MODULE',       ic: 'envelope',
                 sub: [['My Numbers', 'my-numbers']] },
  'testpanel': { t: 'SMS TEST PANEL',   ic: 'rss',        page: 'sms-test-panel' },
  'users':     { t: 'USERS',            ic: 'user',
                 sub: [['Notifications', 'news']] },
  'cdr':       { t: 'CDR & STATISTICS', ic: 'chart',      page: 'my-sms' },
  'credit':    { t: 'CREDIT NOTES',     ic: 'bank',       page: 'my-earnings' },
  'payments':  { t: 'PAYMENT REQUESTS', ic: 'dollar',     page: 'payout-requests' },
  'account':   { t: 'ACCOUNT',          ic: 'profile',
                 sub: [['My Profile', 'my-profile'], ['REST API', 'api-tokens'], ['Audit Log', 'audit-logs']] }
};
const ZY_SIDE_ORDER = ['dash', 'clisearch', 'smsmodule', 'testpanel', 'users', 'cdr', 'credit', 'payments', 'account'];
const ZY_MEGA_ORDER = ['dash', 'clisearch', 'smsmodule', 'testpanel', 'users', 'cdr', 'credit', 'payments', 'account'];
const ZY_LABELS = {
  'dashboard': 'Dashboard', 'access-search': 'CLI Search', 'my-numbers': 'My SMS Numbers',
  'sms-test-panel': 'SMS Test Panel', 'news': 'Notifications', 'my-sms': 'CDR & Statistics',
  'my-earnings': 'Credit Notes', 'payout-requests': 'Payment Requests',
  'my-profile': 'My Profile', 'api-tokens': 'REST API', 'audit-logs': 'Audit Log'
};

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

/* ── week chart (drawn on canvas, no CDN) ──────────────────── */
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

/* ── shell ─────────────────────────────────────────────────── */
(function zyBuildShell() {
  const side = document.getElementById('zy-sidenav');
  if (side) {
    side.innerHTML = ZY_SIDE_ORDER.map(key => {
      const m = ZY_MENU[key];
      const idAttr = m.page ? ` id="nav-${m.page}"` : '';
      const cls = m.page ? 'zy-snav nav-item' : 'zy-snav';
      const click = m.page ? `loadPage('${m.page}')` : `zySideSub('sb-${key}', this)`;
      const caret = m.sub ? `<i class="fas fa-chevron-down zy-caret"></i>` : '';
      const sub = m.sub ? `<div class="zy-ssub" id="sb-${key}">` +
        m.sub.map(([t, p]) => `<div onclick="loadPage('${p}')">${t}</div>`).join('') + `</div>` : '';
      return `<div class="${cls}"${idAttr} onclick="${click}">
                <span class="zy-ic">${zyIcon(m.ic)}</span><span>${m.t}</span>${caret}
              </div>${sub}`;
    }).join('');
  }

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

  function tick() {
    const el = document.getElementById('zy-clock'); if (!el) return;
    const d = new Date(), p = n => String(n).padStart(2, '0');
    el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tick(); setInterval(tick, 1000);

  let sess = {};
  try { sess = JSON.parse(sessionStorage.getItem('admin_user') || '{}'); } catch (e) {}
  const u = (window.CLIENT_USER && CLIENT_USER.username) || sess.username || 'Client';
  ['mgr-username', 'mgr-username-side', 'agent-username', 'client-username', 'zy-um-name'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = u;
  });
  const sub = document.getElementById('client-name-sub');
  if (sub) sub.textContent = 'Client Panel';

  document.addEventListener('click', e => {
    const m = document.getElementById('zy-user-menu');
    if (m && !e.target.closest('.zy-head-right')) m.classList.remove('open');
  });
})();

function zyToggleMenu() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function zyToggleUser(e) { e.stopPropagation(); document.getElementById('zy-user-menu')?.classList.toggle('open'); }
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

/* ═══ DASHBOARD ═════════════════════════════════════════════ */
pgDashboard = async function () {
  const c = document.getElementById('page-content');
  const crumb = document.querySelector('.zy-crumb');
  if (crumb) crumb.innerHTML = `<a onclick="loadPage('dashboard')">Home</a><span class="zy-sep">&raquo;</span><span id="breadcrumb">Dashboard</span>`;
  try {
    const [numbers, daily, ranges, news] = await Promise.all([
      apiFetch(`/api/numbers?client_id=${CLIENT_ID}&limit=100000`),
      apiFetch(`/api/sms/daily-stats?client_id=${CLIENT_ID}`),
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch(`/api/announcements?role=Client&user_id=${CLIENT_ID}`)
    ]);
    const numberList = (numbers && numbers.data) || numbers || [];
    const rangeList = Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []);
    const newsList = (news && (news.data || news)) || [];
    const traffic = (daily && daily.weekly_traffic) || [0, 0, 0, 0, 0, 0, 0];

    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const tiles = [
      ['Dashboard',      't_monitor', 'dashboard'],
      ['My Numbers',     't_calc',    'my-numbers'],
      ['SMS Test Panel', 't_pie',     'sms-test-panel'],
      ['Statistics',     't_donut',   'my-sms'],
      ['Profile',        't_person',  'my-profile']
    ];
    const strips = [
      ['Today SMS',       'stat_today', (daily && daily.today) || 0],
      ['Last 7 Day SMS',  'stat_7day',  (daily && daily.this_week) || 0],
      ['Last 30 Day SMS', 'stat_30day', (daily && daily.this_month) || 0]
    ];
    const circles = [
      ['NEW RANGES',     'circ_ranges',  rangeList.length],
      ['NEW NUMBERS',    'circ_numbers', numberList.length],
      ['SMS THIS MONTH', 'circ_sms',     (daily && daily.this_month) || 0]
    ];

    const newsRows = newsList.slice(0, 25).map(n => [
      { v: n.created || n.date || '', h: String(n.created || n.date || '').replace('T', ' ').slice(0, 19) },
      n.title || '', n.message || n.body || ''
    ]);
    const rangeRows = rangeList.slice(0, 50).map(r => [
      r.name || `${r.country || ''} ${r.provider || ''}`.trim(),
      r.test_number || ''
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
        <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('users')}</span> Recent Ranges</div>
        <div class="zy-panel-body">${zyTable('zy-ranges', ['Range', 'Test Number'], rangeRows, 5)}</div>
      </div>`;

    zyRender('zy-news'); zyRender('zy-ranges');
    zyLineChart('zy-week-chart', labels, traffic);
  } catch (err) {
    console.error('Client dashboard error:', err);
    c.innerHTML = `<div class="zy-panel"><div class="zy-panel-body" style="text-align:center;padding:30px;">
        Dashboard could not load. <button class="zy-gear" onclick="pgDashboard()">Retry</button></div></div>`;
  }
};

/* ── dashboard mini table ──────────────────────────────────── */
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
