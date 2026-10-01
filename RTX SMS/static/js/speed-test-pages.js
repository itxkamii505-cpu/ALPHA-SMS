/* 𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — TEST PANEL inner pages. Requires speed-test.js + speed-kit.js */

let TP_RANGES = [];

/* ═══ 1. SMS TEST NUMBERS ═══════════════════════════════════ */
async function pgTestNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Test Numbers']);
  c.innerHTML = `<div class="zy-intro">Here you can see all test numbers.. you can make call on them and see test reports.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">SMS Test Numbers
        <div class="zy-head-acts">
          ${zyS2('tn-range', 'Select Range', [])}
          <button class="zy-act zy-act-red zy-act-wide" onclick="tpTnFilter()">Filter</button>
        </div>
      </div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const [nums, ranges] = await Promise.all([
    apiFetch('/api/sms/test-numbers?limit=500'),
    apiFetch('/api/numbers/sms-ranges')
  ]);
  TP_RANGES = Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []);
  ZY_S2['tn-range'].items = TP_RANGES.map(r => r.name || r.country || '');

  TP_TNROWS = ((nums && nums.data) || []).map(n => [
    n.range_label || n.range || `${n.country || ''} ${n.provider || ''}`.trim(),
    n.prefix || '',
    n.number || '',
    n.payout != null && n.payout !== '' ? n.payout : 'Ask',
    { v: '', h: `SD : <b>${n.sd_limit != null ? n.sd_limit : 0}</b> | SW : <b>${n.sw_limit != null ? n.sw_limit : 0}</b>` }
  ]);

  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-testnums', { cols: ['Range', 'Prefix', 'Test Number', 'Payout', 'Limits'], rows: TP_TNROWS });
  zy2Render('dt-testnums');
}
let TP_TNROWS = [];
function tpTnFilter() {
  const q = zyS2Value('tn-range').toLowerCase();
  const t = ZYT2['dt-testnums']; if (!t) return;
  t.rows = q ? TP_TNROWS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : TP_TNROWS;
  t.page = 1; zy2Render('dt-testnums');
}

/* ═══ 2. TEST SMS CDR STATS ═════════════════════════════════ */
async function pgTestCdrStats() {
  const c = document.getElementById('page-content');
  zyCrumb(['Test SMS CDR Stats']);
  const today = new Date().toISOString().slice(0, 10);
  c.innerHTML = `<div class="zy-intro">Here You can view all the sms stats.</div>
    <div class="zy-filterbox">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">From Date:</label>
        <input type="date" class="zy-fb-input" id="tc-from" value="${today}" style="cursor:pointer;padding:6px 10px;font-weight:600;min-width:130px;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">To Date:</label>
        <input type="date" class="zy-fb-input" id="tc-to" value="${today}" style="cursor:pointer;padding:6px 10px;font-weight:600;min-width:130px;">
        <select class="zy-fb-input" id="tc-range"><option value="">Filter Range</option></select>
        <input class="zy-fb-input" id="tc-num" placeholder="Search Number">
        <input class="zy-fb-input" id="tc-cli" placeholder="Search CLI">
      </div>
      <div class="zy-groupby"><b>Group By :</b>
        ${['Date', 'Month', 'Range', 'Number', 'CLI'].map(g =>
          `<label><input type="checkbox" class="grp-chk" value="${g.toLowerCase()}"> ${g}</label>`).join('')}
      </div>
      <div class="zy-fb-btns">
        <button class="zy-btn-orange" onclick="zy2Export('dt-testcdr','csv')">Export Report</button>
        <button class="zy-btn-blue" onclick="pgTestCdrStatsLoad()">Show Report</button>
      </div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">SMS CDR Reports &amp; Stats</div>
      <div class="zy-panel-body" id="tc-body"><div class="zy-loading">Loading…</div></div></div>`;

  const ranges = await apiFetch('/api/numbers/sms-ranges');
  TP_RANGES = Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []);
  const sel = document.getElementById('tc-range');
  if (sel) sel.innerHTML = `<option value="">Filter Range</option>` +
    TP_RANGES.map(r => `<option value="${r.id}">${zyEsc(r.name || r.country || '')}</option>`).join('');

  pgTestCdrStatsLoad();
}

async function pgTestCdrStatsLoad() {
  const body = document.getElementById('tc-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('tc-from'), to = val('tc-to');
  const num = val('tc-num').toLowerCase(), cli = val('tc-cli').toLowerCase();
  const rangeId = val('tc-range');
  const rangeName = (TP_RANGES.find(r => String(r.id) === String(rangeId)) || {}).name || '';

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (from) params.append('date_from', from.slice(0, 10));
  if (to) params.append('date_to', to.slice(0, 10));
  if (rangeName) params.append('range', rangeName);
  if (num) params.append('search', num);
  if (cli) params.append('cli', cli);
  if (checkedBoxes.length) params.append('group_by', checkedBoxes.join(','));
  params.append('limit', '500');

  const res = await apiFetch(`/api/sms/test-logs?${params.toString()}`);
  const data = (res && res.data) || [];

  if (res && res.grouped && checkedBoxes.length) {
    const keyLabels = {
      date: 'Date',
      month: 'Month',
      range: 'Range',
      number: 'Number',
      cli: 'CLI'
    };
    const cols = [...checkedBoxes.map(k => keyLabels[k] || k), 'SMS Count'];
    const rows = data.map(g => [
      ...checkedBoxes.map(k => g[k] || '—'),
      g.sms_count || g.count || 0
    ]);
    const totalSms = data.reduce((s, g) => s + (g.sms_count || g.count || 0), 0);

    body.innerHTML = zyDT2('dt-testcdr', {
      cols,
      rows,
      sort: checkedBoxes.length,
      dir: -1,
      footRow: `<td><b>Total Groups ${rows.length}</b></td>` +
               '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
               `<td><b>Total SMS: ${totalSms}</b></td>`
    });
    zy2Render('dt-testcdr');
  } else {
    const rows = data
      .filter(s => zyInRange('tc', s.timestamp || s.date))
      .filter(s => !num || String(s.number || '').toLowerCase().includes(num))
      .filter(s => !cli || String(s.cli || '').toLowerCase().includes(cli))
      .filter(s => !rangeName || String(s.range_label || s.range || '').includes(rangeName))
      .map(s => [
        String(s.timestamp || s.date || '').replace('T', ' ').slice(0, 19),
        s.range_label || s.range || `${s.country || ''} ${s.provider || ''}`.trim(),
        s.number || '',
        zyMaskCli(s.cli),
        s.sms || s.message ? 'XXXXX' : '',
        s.status || ''
      ]);

    body.innerHTML = zyDT2('dt-testcdr', {
      cols: ['Date', 'Range', 'Number', 'CLI', 'SMS', 'Status'],
      rows,
      sort: 0,
      dir: -1
    });
    zy2Render('dt-testcdr');
  }
}

/* CLI masking lives in speed-kit.js as zyMaskCli() — first character only,
   then XXXXX. The SMS body is masked completely (see the rows above). */
