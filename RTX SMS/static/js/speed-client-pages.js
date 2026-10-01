/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — CLIENT pages. Requires speed-kit.js
   ═══════════════════════════════════════════════════════════════ */

let ZY_RANGES = [], ZY_NUMROWS = [], ZY_TESTNUMS = [];

/* ═══ MY SMS NUMBERS ════════════════════════════════════════ */
async function pgMyNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['My SMS Numbers']);
  c.innerHTML = `<div class="zy-intro">Here you can see numbers assigned to your account. You can make traffic on these numbers and see stats on them.</div>
    <div class="zy-intro">Abbrevations : SD - SMS Daily, SW - SMS Weekly</div>
    <div class="zy-panel">
      <div class="zy-panel-head">My SMS Numbers
        <div class="zy-head-acts">
          ${zyS2('num-range', 'Select Range', [], zyNumFilter)}
          <button class="zy-act zy-act-red zy-act-wide" onclick="zyNumFilter()">Filter</button>
        </div>
      </div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const [nums, ranges] = await Promise.all([
    apiFetch(`/api/numbers?client_id=${CLIENT_ID}&limit=100000`),
    apiFetch('/api/numbers/sms-ranges')
  ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['num-range'].items = ZY_RANGES.map(r => r.name || r.country || '');

  ZY_NUMROWS = zyList(nums).map(n => [
    n.range || `${n.country || ''} ${n.provider || ''}`.trim(),
    n.prefix || '',
    n.number || '',
    n.payterm || 'Weekly',
    { v: n.payout ?? '', h: n.payout != null ? `$ ${n.payout}` : '' },
    { v: '', h: `SD : <b>${n.sms_daily || 0}</b> | SW : <b>${n.sms_weekly || 0}</b>` }
  ]);
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-numbers', {
    cols: ['Range', 'Prefix', 'Number', 'My Payterm', 'My Payout', 'Limits'], rows: ZY_NUMROWS });
  zy2Render('dt-numbers');
}
function zyNumFilter() {
  const q = zyS2Value('num-range').toLowerCase();
  const t = ZYT2['dt-numbers']; if (!t) return;
  t.rows = q ? ZY_NUMROWS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_NUMROWS;
  t.page = 1; zy2Render('dt-numbers');
}

/* ═══ SMS CDR STATS (CDR & STATISTICS) ═════════════════════════ */
async function pgMySms() {
  const c = document.getElementById('page-content');
  zyCrumb(['CDR & Statistics', 'Detailed Reports']);
  c.innerHTML = `<div class="zy-intro">Detailed records of every inbound SMS.</div>
    <div class="zy-filterbox">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">From Date:</label>
        <input type="date" class="zy-fb-input" id="rp-from" value="${zyToday()}" style="cursor:pointer;padding:6px 10px;font-weight:600;min-width:130px;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">To Date:</label>
        <input type="date" class="zy-fb-input" id="rp-to" value="${zyToday()}" style="cursor:pointer;padding:6px 10px;font-weight:600;min-width:130px;">
        <select class="zy-fb-input" id="rp-range"><option value="">Filter Range</option></select>
        <input class="zy-fb-input" id="rp-num" placeholder="Search Number">
        <input class="zy-fb-input" id="rp-cli" placeholder="Search CLI">
      </div>
      <div class="zy-groupby"><b>Group By :</b>
        ${['Number', 'CLI', 'Hour', 'Day', 'Month', 'Range', 'Currency', 'Status'].map(g =>
          `<label><input type="checkbox" class="grp-chk" value="${g.toLowerCase()}"> ${g}</label>`).join('')}
      </div>
      <div class="zy-fb-btns">
        <button class="zy-btn-orange" onclick="zy2Export('dt-cdr','csv')">Export Report</button>
        <button class="zy-btn-blue" onclick="pgMySmsLoad()">Show Report</button>
      </div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">CDR REPORTS &amp; STATS</div>
      <div class="zy-panel-body" id="rp-body"><div class="zy-empty" style="padding:40px;text-align:center;color:var(--text-muted,#64748b);"><i class="fas fa-chart-bar" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.6;"></i>Select filters above and click <b>Show Report</b> to view SMS stats.</div></div></div>`;
  const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
  ZY_RANGES = ranges;
  const rEl = document.getElementById('rp-range');
  if (rEl) rEl.innerHTML = `<option value="">Filter Range</option>` +
    ranges.map(r => `<option value="${r.id}">${zyEsc(r.name || r.country || '')}</option>`).join('');
}

async function pgMySmsLoad() {
  const body = document.getElementById('rp-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const rangeId = val('rp-range');
  const num = val('rp-num'), cli = val('rp-cli');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (typeof CLIENT_ID !== 'undefined' && CLIENT_ID) params.append('client_id', CLIENT_ID);
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (rangeId) params.append('range', rangeId);
  if (num) params.append('search', num);
  if (cli) params.append('cli', cli);
  if (checkedBoxes.length) params.append('group_by', checkedBoxes.join(','));
  params.append('limit', '500');

  const logs = await apiFetch(`/api/sms/logs?${params.toString()}`);
  const data = (logs && logs.data) || [];

  if (logs && logs.grouped && checkedBoxes.length) {
    const keyLabels = {
      date: 'Date',
      month: 'Month',
      range: 'Range',
      number: 'Number',
      cli: 'CLI'
    };
    const cols = [
      ...checkedBoxes.map(k => keyLabels[k] || k),
      'SMS Count',
      'Currency',
      'My Payout'
    ];
    const rows = data.map(g => [
      ...checkedBoxes.map(k => g[k] || '—'),
      g.sms_count || 0,
      g.currency || 'USD',
      `$${Number(g.client_payout || g.payout || 0).toFixed(4)}`
    ]);
    const totalSms = data.reduce((s, g) => s + (g.sms_count || 0), 0);
    const totalPayout = data.reduce((s, g) => s + (parseFloat(g.client_payout || g.payout) || 0), 0);

    body.innerHTML = zyDT2('dt-cdr', {
      cols,
      rows,
      sort: checkedBoxes.length,
      dir: -1,
      footRow: `<td><b>Total Groups ${rows.length}</b></td>` +
               '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
               `<td><b>Total SMS: ${totalSms}</b></td>` +
               `<td><b>USD</b></td>` +
               `<td><b>$${totalPayout.toFixed(4)}</b></td>`
    });
    zy2Render('dt-cdr');
  } else {
    const rows = data.map(s => [
      zyDateOnly(s.timestamp),
      s.range || `${s.country || ''} ${s.provider || ''}`.trim(),
      s.number || '',
      (s.cli || s.app || '—'),
      s.message || '',
      s.currency || '$',
      s.client_payout != null ? s.client_payout : (s.payout != null ? s.payout : '')
    ]);
    const foot = `<td><b>Total SMS ${rows.length}</b></td><td></td><td></td><td></td>
      <td><b>Currency</b><br>${ZY_CCY.join('<br>')}</td>
      <td></td><td><b>My Payout</b><br>${zySumByCcy(data, s => s.client_payout ?? s.payout)}</td>`;
    body.innerHTML = zyDT2('dt-cdr', {
      cols: ['Date', 'Range', 'Number', 'CLI', 'SMS', 'Currency', 'My Payout'],
      rows,
      sort: 0,
      dir: -1,
      footRow: foot
    });
    zy2Render('dt-cdr');
  }
}

/* ═══ SMS TEST PANEL ════════════════════════════════════════ */
async function pgSmsTestPanel() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Test Panel']);
  c.innerHTML = `<div class="zy-intro">Here you can see all test numbers.. you can make call on them and see test reports.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">SMS Test Numbers
        <div class="zy-head-acts">
          ${zyS2('tp-range', 'Select Range', [])}
          <button class="zy-act zy-act-red zy-act-wide" onclick="zyTestFilter()">Filter</button>
        </div>
      </div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">Recent SMS Test</div>
      <div class="zy-panel-body" id="tp-recent"><div class="zy-loading">Loading…</div></div></div>`;

  const [ranges, nums, logs] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch('/api/sms/test-numbers?limit=500'),
    apiFetch('/api/sms/test-logs?limit=500')
  ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['tp-range'].items = ZY_RANGES.map(r => r.name || r.country || '');

  ZY_TESTNUMS = zyList(nums).map(n => [n.range_label || '—', n.number || '']);

  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-testnums', {
    cols: ['Range', 'Test Number'], rows: ZY_TESTNUMS });
  zy2Render('dt-testnums');

  const mask = s => String(s || '').replace(/./g, '*').slice(0, 6);
  const rows = zyList(logs).map(s => [
    zyDateOnly(s.timestamp), s.range_label || '—',
    s.number || '', zyMaskCli(s.cli), mask(s.message)
  ]);
  document.getElementById('tp-recent').innerHTML = zyDT2('dt-testlog', {
    cols: ['Date', 'Range', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
  zy2Render('dt-testlog');
}
function zyTestFilter() {
  const q = zyS2Value('tp-range').toLowerCase();
  const t = ZYT2['dt-testnums']; if (!t) return;
  t.rows = q ? ZY_TESTNUMS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_TESTNUMS;
  t.page = 1; zy2Render('dt-testnums');
}

/* ═══ CLI SEARCH (Video 01:50-02:00) ═════════════════════════ */
async function pgAccessSearch() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'CLI Search']);
  c.innerHTML = `<div class="zy-intro">See which ranges a sender has been running on in the last 24 hours. Type the sender in full, exactly as it appears. Capital letters do not matter.</div>
    <div class="zy-filterbox">
      <div style="margin-bottom:12px;">
        <label style="display:block;font-weight:700;margin-bottom:5px;font-size:12.5px;">Sender (CLI)</label>
        <input class="zy-fb-input" id="cs-cli" style="width:100%;max-width:480px;" placeholder="The full sender, e.g. facebook">
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-weight:700;margin-bottom:5px;font-size:12.5px;">Message text</label>
        <input class="zy-fb-input" id="cs-text" style="width:100%;max-width:480px;" placeholder="Any words from the message">
      </div>
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgAccessSearchLoad()"><i class="fas fa-search"></i> Search</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">RANGES RUNNING THIS CLI</div>
      <div class="zy-panel-body" id="cs-body"><div class="zy-loading">Loading…</div></div></div>`;
  pgAccessSearchLoad();
}

async function pgAccessSearchLoad() {
  const body = document.getElementById('cs-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const logs = zyList(await apiFetch(`/api/sms/logs?limit=500`));
  const cli = (document.getElementById('cs-cli') || {}).value || '';
  const txt = (document.getElementById('cs-text') || {}).value || '';
  const seen = new Map();
  logs.forEach(s => {
    if (cli && !String(s.cli || s.app || '').toLowerCase().includes(cli.toLowerCase())) return;
    if (txt && !String(s.message || '').toLowerCase().includes(txt.toLowerCase())) return;
    const rName = s.range_label || s.range || `${s.country || ''} ${s.provider || ''}`.trim() || 'General';
    if (!seen.has(rName) || seen.get(rName) < s.timestamp) {
      seen.set(rName, s.timestamp);
    }
  });
  const rows = Array.from(seen.entries()).map(([range, lastSeen]) => [
    range,
    zyDateOnly(lastSeen)
  ]);
  body.innerHTML = zyDT2('dt-cli', { cols: ['Range', 'Last seen'], rows, sort: 1, dir: -1 });
  zy2Render('dt-cli');
}

/* ── router ─────────────────────────────────────────────────── */
(function zyHookClientPages() {
  const map = {
    'dashboard': () => pgDashboard(),
    'access-search': pgAccessSearch,
    'my-numbers': pgMyNumbers,
    'my-sms': pgMySms,
    'sms-test-panel': pgSmsTestPanel
  };
  const prev = loadPage;
  loadPage = function (page) {
    if (map[page]) {
      document.getElementById('zy-user-menu')?.classList.remove('open');
      if (window.innerWidth < 992) document.getElementById('zy-mega')?.classList.remove('open');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + page)?.classList.add('active');
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('client_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
  };
})();
