/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — AGENT pages. Requires speed-kit.js
   ═══════════════════════════════════════════════════════════════ */

let ZY_RANGES = [], ZY_CLIENTS = [], ZY_NUMROWS = [], ZY_TESTNUMS = [];

async function zyFillClients(selectId, label) {
  const res = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=200`);
  ZY_CLIENTS = zyList(res);
  const el = document.getElementById(selectId);
  if (el) el.innerHTML = `<option value="">${label || 'Filter Client'}</option>` +
    ZY_CLIENTS.map(c => `<option value="${c.id}">${zyEsc(c.username)}</option>`).join('');
  return ZY_CLIENTS;
}
const zyClientName = id => (ZY_CLIENTS.find(c => String(c.id) === String(id)) || {}).username || '';
const zyNA = v => (v === '' || v == null) ? '<span class="zy-na">NA</span>' : v;

/* ═══ SMS RANGES ════════════════════════════════════════════ */
async function pgSmsRanges() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS Ranges']);
  c.innerHTML = `<div class="zy-intro">Our All Ranges will show here.. you can search your desired range and request numbers.</div>
    <div class="zy-panel"><div class="zy-panel-head">All SMS Ranges/Terminations</div>
    <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const list = zyList(await apiFetch('/api/numbers/sms-ranges'));
  const rows = list.map(r => [
    r.range_name || r.name || r.country || '—',
    r.prefix || '',
    r.test_number || '',
    r.currency || 'USD',
    { v: '', h: zyNA('') },
    { v: r.payout ?? '', h: r.payout != null ? `$ ${r.payout}` : zyNA('') },
    { v: '', h: zyNA('') },
    { v: '', h: zyNA('') }
  ]);
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-ranges', {
    cols: ['Range', 'Prefix', 'Test Number', 'Currency', '1/1', '7/1', '7/7', '30/45'], rows });
  zy2Render('dt-ranges');
}

/* ═══ MY SMS NUMBERS ════════════════════════════════════════ */
async function pgMySmsNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'My SMS Numbers']);
  c.innerHTML = `<div class="zy-intro">Here you can see numbers assigned to your account. You can make update process and transfer numbers to your server ip or assign numbers to your clients.</div>
    <div class="zy-intro">Abbrevations : SD - SMS Daily, SW - SMS Weekly</div>
    <div class="zy-panel">
      <div class="zy-panel-head">My SMS Numbers
        <div class="zy-head-acts">
          ${zyS2('num-range', 'Select Range', [], zyNumFilter)}
          <button class="zy-act zy-act-teal" onclick="zyAssignToClient()" title="Assign to client">${zyImg('btn_a_assign')}</button>
          <button class="zy-act zy-act-red" onclick="zyTransferNumbers()" title="Transfer">${zyImg('btn_a_transfer')}</button>
          <button class="zy-act zy-act-red" onclick="loadPage('my-sms-numbers')" title="Refresh">${zyImg('btn_a_refresh')}</button>
        </div>
      </div>
      <div class="zy-filterbar">
        ${zySelectSearch('num-client', 'Search clients…')}
        <select id="num-client"><option value="">Select Client</option></select>
        <button class="zy-btn-red" onclick="pgMySmsNumbers()">Filter</button>
      </div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const [nums, ranges] = await Promise.all([
    apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`),
    apiFetch('/api/numbers/sms-ranges')
  ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['num-range'].items = ZY_RANGES.map(r => r.range_name || r.name || r.country || '');
  await zyFillClients('num-client', 'Select Client');

  const rows = zyList(nums).map(n => {
    const rangeName = n.range_name || n.range_label || n.range || n.country || '—';
    const r = [
      { v: rangeName, h: rangeName },
      n.prefix || '',
      n.number || '',
      { v: n.payout ?? '', h: `${n.payterm || 'Weekly'}<br>$ ${n.payout ?? 0}` },
      { v: zyClientName(n.client_id), h: zyClientName(n.client_id) || zyImg('ui_pencil', 'zy-pen') },
      { v: n.client_payout ?? '', h: n.client_payout ?? '' },
      { v: '', h: `SD : <b>${n.sms_daily || 0}</b> | SW : <b>${n.sms_weekly || 0}</b>` }
    ];
    r.__id = n.id; return r;
  });
  ZY_NUMROWS = rows;
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-numbers', {
    cols: ['Range', 'Prefix', 'Number', 'My Payout', 'Client', 'Payout', 'Limits'], rows, check: true });
  zy2Render('dt-numbers');
}
function zyNumFilter() {
  const q = zyS2Value('num-range').toLowerCase();
  const t = ZYT2['dt-numbers']; if (!t) return;
  t.rows = q ? ZY_NUMROWS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_NUMROWS;
  t.page = 1; zy2Render('dt-numbers');
}
function zyAssignToClient() {
  const ids = zy2Checked('dt-numbers');
  const t = ZYT2['dt-numbers'];
  const picked = t.rows.filter(r => ids.includes(String(r.__id))).map(r => zyCell2(r[2]).v);
  zyModal('Assign Numbers to Client', `
    <label class="zy-lbl">Numbers</label>
    <div class="zy-numlist">${picked.length ? picked.join(', ') : 'No numbers selected'}</div>
    <label class="zy-lbl">Select Client</label>
    ${zySelectSearch('as-client', 'Search clients…')}
    <select id="as-client" class="zy-input"><option value="">Please Select</option>
      ${ZY_CLIENTS.map(c => `<option value="${c.id}">${zyEsc(c.username)}</option>`).join('')}</select>
    <label class="zy-lbl">Payout</label>
    <input id="as-payout" class="zy-input" placeholder="0.00">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zyDoAssignClient(${JSON.stringify(ids).replace(/"/g, '&quot;')})">Assign</button>`);
}
async function zyDoAssignClient(ids) {
  const client = document.getElementById('as-client').value;
  if (!client) { toast('Select a client', 'error'); return; }
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  await apiFetch('/api/numbers/bulk-assign-many', {
    method: 'POST', body: JSON.stringify({ number_ids: ids.map(Number), target_type: 'client', target_id: Number(client), client_id: Number(client) })
  });
  closeModal(); toast('Numbers assigned', 'success'); loadPage('my-sms-numbers');
}
function zyTransferNumbers() {
  const ids = zy2Checked('dt-numbers');
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  zyModal('Transfer Numbers', `
    <label class="zy-lbl">Server IP</label>
    <input id="tr-ip" class="zy-input" placeholder="0.0.0.0">
    <label class="zy-lbl">Numbers</label>
    <div class="zy-numlist">${ids.length} selected</div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="closeModal();toast('Transfer requested','success')">Transfer</button>`);
}

/* ═══ SMS RATECARD ══════════════════════════════════════════ */
async function pgSmsRateCard() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS RateCard']);
  c.innerHTML = `<div class="zy-intro">Here you can export ratecard and send it to your clients by updating payouts.</div>
    <div class="zy-panel"><div class="zy-panel-head">SMS RateCard
      <button class="zy-act-export" onclick="zy2Export('dt-rate','csv')">${zyImg('btn_export')} Export</button></div>
    <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
  const rows = ranges.map(r => [
    r.range_name || r.name || r.country || '—', r.prefix || '', r.test_number || '',
    r.currency || 'USD',
    { v: r.payout ?? '', h: r.payout != null ? `$ ${r.payout}` : zyNA('') },
    { v: '', h: zyNA('') }, { v: '', h: zyNA('') }, { v: '', h: zyNA('') }, { v: '', h: zyNA('') }
  ]);
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-rate', {
    cols: ['Range', 'Prefix', 'Test Number', 'Currency', '7/1', '7/7', '15/15', '15/30', '30/30'], rows });
  zy2Render('dt-rate');
}

/* ═══ ACCESS / CLI SEARCH ═══════════════════════════════════ */
async function pgAccessSearch() {
  const c = document.getElementById('page-content');
  zyCrumb(['CLI Search']);
  c.innerHTML = `<div class="zy-intro">Here You can search ranges running by cli.</div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="cs-from" value="${zyToday()} 00:00:00">
      <input class="zy-fb-input" id="cs-to" value="${zyToday()} 23:59:59">
      <input class="zy-fb-input" id="cs-cli" placeholder="Search CLI">
      <input class="zy-fb-input" id="cs-text" placeholder="Search Content">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgAccessSearchLoad()">Show Report</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">Ranges Running With CLI</div>
      <div class="zy-panel-body" id="cs-body"><div class="zy-loading">Loading…</div></div></div>`;
  pgAccessSearchLoad();
}
async function pgAccessSearchLoad() {
  const body = document.getElementById('cs-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const logs = zyList(await apiFetch(`/api/sms/logs?agent_id=${AGENT_ID}&limit=500`));
  const cli = (document.getElementById('cs-cli') || {}).value || '';
  const txt = (document.getElementById('cs-text') || {}).value || '';
  const seen = new Set();
  const rows = logs
    .filter(s => zyInRange('cs', s.timestamp))
    .filter(s => !cli || String(s.cli || s.app || '').toLowerCase().includes(cli.toLowerCase()))
    .filter(s => !txt || String(s.message || '').toLowerCase().includes(txt.toLowerCase()))
    .map(s => [zyDateOnly(s.timestamp), s.range_name || s.range_label || s.range || s.country || '—'])
    .filter(r => { const k = r.join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
  body.innerHTML = zyDT2('dt-cli', { cols: ['Date', 'Range'], rows, sort: 0, dir: -1 });
  zy2Render('dt-cli');
}

/* ═══ NEWS FOR CLIENTS (NewsMaster) ═════════════════════════ */
async function pgNewsClients() {
  const c = document.getElementById('page-content');
  zyCrumb(['System Master', 'NewsMaster']);
  c.innerHTML = `<div class="zy-intro">Here you can put News &amp; Updates for your clients and agents, so they can see it on their panel and get connected with you.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">News &amp; Updates
        <div class="zy-head-acts">
          <button class="zy-act zy-act-blue" onclick="zyAddNewsModal()" title="Add News">${zyImg('btn_add')}</button>
          <button class="zy-act zy-act-red" onclick="zyDeleteChecked('dt-news','announcements')" title="Delete">${zyImg('btn_trash')}</button>
        </div>
      </div>
      <div class="zy-datebar">
        <div class="zy-daterow"><input id="nw-from" value="${zyMonthStart()}"><button class="zy-cal"><i class="fas fa-table-cells"></i></button></div>
        <div class="zy-daterow"><input id="nw-to" value="${zyToday()}"><button class="zy-cal"><i class="fas fa-table-cells"></i></button></div>
        <button class="zy-btn-blue" onclick="pgNewsLoad()">Filter</button>
      </div>
      <div class="zy-panel-body" id="nw-body"><div class="zy-loading">Loading…</div></div>
    </div>`;
  pgNewsLoad();
}
async function pgNewsLoad() {
  const body = document.getElementById('nw-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch(`/api/announcements?role=Agent&user_id=${AGENT_ID}`));
  const rows = list.map(n => {
    const r = [
      { v: n.created || n.date || '', h: zyDateOnly(n.created || n.date) },
      n.title || '', n.message || n.body || '',
      { v: '', h: `<button class="zy-gear" onclick="toast('Open news','success')">${zyImg('ui_gear')}</button>` }
    ];
    r.__id = n.id; return r;
  });
  body.innerHTML = zyDT2('dt-news', { cols: ['Date', 'Headline', 'News', 'Action'], rows, check: true, sort: 0, dir: -1 });
  zy2Render('dt-news');
}
function zyAddNewsModal() {
  zyModal('Add News', `
    <label class="zy-lbl">Headline</label><input class="zy-input" id="nn-title" placeholder="Headline">
    <label class="zy-lbl">News</label><input class="zy-input" id="nn-body" placeholder="News">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveNews()">Add</button>`);
}
async function zySaveNews() {
  const p = { title: document.getElementById('nn-title').value.trim(),
              message: document.getElementById('nn-body').value.trim(),
              audience: 'Client', created_by: AGENT_ID };
  if (!p.title) { toast('Headline required', 'error'); return; }
  await apiFetch('/api/announcements', { method: 'POST', body: JSON.stringify(p) });
  closeModal(); zyFlash('News Added.'); loadPage('news-clients');
}

/* ═══ MY CLIENTS ════════════════════════════════════════════ */
async function pgMyClients() {
  const c = document.getElementById('page-content');
  zyCrumb(['Users Master', 'Clients']);
  c.innerHTML = `<div class="zy-intro">Clients are the very low level(end users). They can get numbers from their agents and make traffic on them and see reportings.</div>
    <div class="zy-panel"><div class="zy-panel-head">Manage Clients
      <div class="zy-head-acts">
        <button class="zy-act zy-act-blue" onclick="zyAddClientModal()" title="Add Client">${zyImg('btn_add')}</button>
        <button class="zy-act zy-act-red" onclick="zyDeleteChecked('dt-clients','clients')" title="Delete">${zyImg('btn_trash')}</button>
      </div></div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const list = zyList(await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=500`));
  ZY_CLIENTS = list;
  const rows = list.map(x => {
    const r = [x.username || '', x.full_name || '', x.email || '', x.phone || '', x.skype_id || '',
      { v: x.status === 'active' ? 'yes' : '', h: zyTick(x.status === 'active') }];
    r.__id = x.id; return r;
  });
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-clients', {
    cols: ['Username', 'Name', 'Email', 'Contact', 'Skype', 'Active'], rows, check: true });
  zy2Render('dt-clients');
}
function zyAddClientModal() {
  zyModal('Add New Client', `
    <label class="zy-lbl">Username</label><input class="zy-input" id="nc-user" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Password</label><input class="zy-input" id="nc-pass" type="password" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Email</label><input class="zy-input" id="nc-mail" placeholder="abc@xyz.com">
    <label class="zy-lbl">Skype ID</label><input class="zy-input" id="nc-skype" placeholder="Skype ID">
    <label class="zy-lbl">Contact No.</label><input class="zy-input" id="nc-phone" placeholder="441768499506">
    <label class="zy-lbl">Name</label><input class="zy-input" id="nc-name" placeholder="Name">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveClient()">Add</button>`);
}
async function zySaveClient() {
  const p = {
    username: document.getElementById('nc-user').value.trim(),
    password: document.getElementById('nc-pass').value,
    email: document.getElementById('nc-mail').value.trim(),
    skype_id: document.getElementById('nc-skype').value.trim(),
    contact_no: document.getElementById('nc-phone').value.trim(),
    full_name: document.getElementById('nc-name').value.trim(),
    agent_id: AGENT_ID
  };
  if (p.username.length < 6 || p.password.length < 6) { toast('Username and password need 6+ characters', 'error'); return; }
  const r = await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(p) });
  if (r && r.id) { closeModal(); zyFlash('Client Added.'); loadPage('my-clients'); }
}
async function zyDeleteChecked(tableId, kind) {
  const ids = zy2Checked(tableId);
  if (!ids.length) { toast('Nothing selected', 'error'); return; }
  zyModal('Delete', `<p class="zy-confirm">Delete ${ids.length} selected?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyDoDelete('${kind}',${JSON.stringify(ids).replace(/"/g, '&quot;')})">Delete</button>`);
}
async function zyDoDelete(kind, ids) {
  for (const id of ids) await apiFetch(`/api/${kind}/${id}`, { method: 'DELETE' });
  closeModal(); toast('Deleted', 'success');
  loadPage(kind === 'clients' ? 'my-clients' : 'news-clients');
}

/* ═══ SMS CDR REPORTS (detailed) ════════════════════════════ */
async function pgDetailedSms() { zyCdrPage(false); }
async function pgSummarySms() { zyCdrPage(true); }
async function zyCdrPage(summary) {
  const c = document.getElementById('page-content');
  zyCrumb([summary ? 'SMS CDR Stats' : 'SMS CDR Reports']);
  c.innerHTML = `<div class="zy-intro">Here You can view all the SMS ${summary ? 'stats and grouped metrics' : 'detail records'}.</div>
    <div class="zy-filterbox">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">From Date:</label>
        <input type="date" class="zy-fb-input" id="rp-from" value="${zyToday()}" style="cursor:pointer;padding:6px 10px;font-weight:600;min-width:130px;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">To Date:</label>
        <input type="date" class="zy-fb-input" id="rp-to" value="${zyToday()}" style="cursor:pointer;padding:6px 10px;font-weight:600;min-width:130px;">
        <select class="zy-fb-input" id="rp-range"><option value="">Filter Range</option></select>
        <select class="zy-fb-input" id="rp-client"><option value="">Filter Client</option></select>
        <input class="zy-fb-input" id="rp-num" placeholder="Search Number">
        <input class="zy-fb-input" id="rp-cli" placeholder="Search CLI">
      </div>
      <div class="zy-groupby"><b>Group By :</b>
        ${['Date', 'Month', 'Range', 'Client', 'Number', 'CLI'].map(g =>
          `<label><input type="checkbox" class="grp-chk" value="${g.toLowerCase()}"> ${g}</label>`).join('')}
      </div>
      <div class="zy-fb-btns">
        <button class="zy-btn-orange" onclick="zy2Export('dt-cdr','csv')">Export Report</button>
        <button class="zy-btn-blue" onclick="zyCdrLoad(${!!summary})">Show Report</button>
      </div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">${summary ? 'CDR Reports &amp; Stats' : 'SMS CDR Reports &amp; Stats'}</div>
      <div class="zy-panel-body" id="rp-body"><div class="zy-empty" style="padding:40px;text-align:center;color:var(--text-muted,#64748b);"><i class="fas fa-chart-bar" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.6;"></i>Select filters above and click <b>Show Report</b> to view SMS stats.</div></div></div>`;
  const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
  ZY_RANGES = ranges;
  const rEl = document.getElementById('rp-range');
  if (rEl) rEl.innerHTML = `<option value="">Filter Range</option>` +
    ranges.map(r => `<option value="${r.id}">${zyEsc(r.range_name || r.name || r.country || '')}${r.prefix ? ` (${zyEsc(r.prefix)})` : ''}</option>`).join('');
  await zyFillClients('rp-client', 'Filter Client');
}

async function zyCdrLoad(summary) {
  const body = document.getElementById('rp-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const rangeId = val('rp-range'), clientId = val('rp-client');
  const num = val('rp-num'), cli = val('rp-cli');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (typeof AGENT_ID !== 'undefined' && AGENT_ID) params.append('agent_id', AGENT_ID);
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (rangeId) params.append('range', rangeId);
  if (clientId) params.append('client_id', clientId);
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
      client: 'Client',
      number: 'Number',
      cli: 'CLI'
    };
    const cols = [
      ...checkedBoxes.map(k => keyLabels[k] || k),
      'SMS Count',
      'Currency',
      'My Payout',
      'Client Payout',
      'Profit'
    ];
    const rows = data.map(g => [
      ...checkedBoxes.map(k => g[k] || '—'),
      g.sms_count || 0,
      g.currency || 'USD',
      `$${Number(g.payout || 0).toFixed(4)}`,
      `$${Number(g.client_payout || 0).toFixed(4)}`,
      `$${Number(g.profit || 0).toFixed(4)}`
    ]);
    const totalSms = data.reduce((s, g) => s + (g.sms_count || 0), 0);
    const totalPayout = data.reduce((s, g) => s + (parseFloat(g.payout) || 0), 0);
    const totalClientPayout = data.reduce((s, g) => s + (parseFloat(g.client_payout) || 0), 0);
    const totalProfit = data.reduce((s, g) => s + (parseFloat(g.profit) || 0), 0);

    body.innerHTML = zyDT2('dt-cdr', {
      cols,
      rows,
      sort: checkedBoxes.length,
      dir: -1,
      footRow: `<td><b>Total Groups ${rows.length}</b></td>` +
               '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
               `<td><b>Total SMS: ${totalSms}</b></td>` +
               `<td><b>USD</b></td>` +
               `<td><b>$${totalPayout.toFixed(4)}</b></td>` +
               `<td><b>$${totalClientPayout.toFixed(4)}</b></td>` +
               `<td><b>$${totalProfit.toFixed(4)}</b></td>`
    });
    zy2Render('dt-cdr');
  } else {
    const rows = data.map(s => [
      zyDateOnly(s.timestamp),
      s.range_name || s.range_label || s.range || s.country || '—',
      s.number || '',
      (s.cli || s.app || '—'),
      zyClientName(s.client_id) || s.client || '—',
      s.message || '',
      s.currency || '$',
      s.payout != null ? s.payout : '',
      s.client_payout != null ? s.client_payout : ''
    ]);
    const foot = `<td><b>Total SMS ${rows.length}</b></td><td></td><td></td><td></td><td></td>
      <td><b>Currency</b><br>${ZY_CCY.join('<br>')}</td>
      <td><b>My Payout</b><br>${zySumByCcy(data, s => s.payout)}</td>
      <td><b>${summary ? 'Agent' : 'Client'} Payout</b><br>${zySumByCcy(data, s => s.client_payout)}</td>
      <td><b>Profit</b><br>${zySumByCcy(data, s => (parseFloat(s.payout) || 0) - (parseFloat(s.client_payout) || 0))}</td>`;
    body.innerHTML = zyDT2('dt-cdr', {
      cols: ['Date', 'Range', 'Number', 'CLI', 'Client', 'SMS', 'Currency', 'My Payout', 'Client Payout'],
      rows,
      sort: 0,
      dir: -1,
      footRow: foot
    });
    zy2Render('dt-cdr');
  }
}

/* ═══ STATS PAGES (client / range / number) ═════════════════ */
function pgClientSmsStats() { return zyStatsPage('client'); }
function pgSmsRangeStats() { return zyStatsPage('range'); }
function pgSmsNumberStats() { return zyStatsPage('number'); }
async function zyStatsPage(kind) {
  const c = document.getElementById('page-content');
  const meta = {
    client: ['Client SMS Stats', 'Clients', 'Client', 'Filter Client'],
    range:  ['SMS Range Stats',  'SMS Ranges', 'Range', 'Filter Range'],
    number: ['SMS Number Stats', 'Numbers', 'Number', null]
  }[kind];
  zyCrumb([meta[0]]);
  c.innerHTML = `<div class="zy-intro">Here you will get summarize ${kind === 'range' ? 'reports of SMS Ranges' : 'sms reports of ' + meta[1]}.</div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="st-from" value="${zyToday()} 00:00:00">
      <input class="zy-fb-input" id="st-to" value="${zyToday()} 23:59:59">
      ${meta[3] ? `<select class="zy-fb-input" id="st-pick"><option value="">${meta[3]}</option></select>` : ''}
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="zyStatsLoad('${kind}')">Show Report</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">${meta[0]}</div>
      <div class="zy-panel-body" id="st-body"><div class="zy-loading">Loading…</div></div></div>`;
  if (kind === 'client') await zyFillClients('st-pick', 'Filter Client');
  if (kind === 'range') {
    const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
    document.getElementById('st-pick').innerHTML = `<option value="">Filter Range</option>` +
      ranges.map(r => `<option value="${r.id}">${zyEsc(r.range_name || r.name || r.country)}</option>`).join('');
  }
  zyStatsLoad(kind);
}
async function zyStatsLoad(kind) {
  const body = document.getElementById('st-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const logs = zyList(await apiFetch(`/api/sms/logs?agent_id=${AGENT_ID}&limit=500`))
    .filter(s => zyInRange('st', s.timestamp));
  const keyOf = s => kind === 'client' ? zyClientName(s.client_id)
                   : kind === 'range' ? (s.range_name || s.range_label || s.range || s.country || '—')
                   : (s.number || '');
  const group = {};
  logs.forEach(s => {
    const k = keyOf(s) || '—';
    group[k] = group[k] || { sms: 0, mine: 0, client: 0 };
    group[k].sms++;
    group[k].mine += Number(s.payout || 0);
    group[k].client += Number(s.client_payout || 0);
  });
  const label = kind === 'client' ? 'Client' : kind === 'range' ? 'Range' : 'Number';
  const rows = Object.entries(group).map(([k, v]) =>
    [k, v.sms, 'USD', v.mine.toFixed(3), v.client.toFixed(3)]);
  body.innerHTML = zyDT2('dt-stats', {
    cols: [label, 'SMS', 'Currency', 'My Payout', 'Client Payout'], rows, sort: 1, dir: -1 });
  zy2Render('dt-stats');
}

/* ═══ MY CREDIT NOTES ═══════════════════════════════════════ */
async function pgCreditNotes() {
  const c = document.getElementById('page-content');
  zyCrumb(['My Credit Notes']);
  c.innerHTML = `<div class="zy-intro">These are the credit notes for your account. you can request payment after due date.</div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="cn-from" value="${zyMonthStart()} 00:00:00">
      <input class="zy-fb-input" id="cn-to" value="${zyToday()} 23:59:59">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgCreditNotesLoad()">Show Report</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">Credit Notes</div>
      <div class="zy-panel-body" id="cn-body"><div class="zy-loading">Loading…</div></div></div>`;
  pgCreditNotesLoad();
}
async function pgCreditNotesLoad() {
  const body = document.getElementById('cn-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch('/api/credit-notes?limit=500'))
    .filter(n => String(n.agent_id) === String(AGENT_ID))
    .filter(n => zyInRange('cn', n.created || n.date));
  const rows = list.map(n => {
    const due = new Date(String(n.date || n.created || '').slice(0, 10));
    due.setDate(due.getDate() + 1);
    return [(n.date || n.created || '').slice(0, 10), n.reason || 'SMS', n.term || 'Weekly',
            n.currency || 'USD', Number(n.amount || 0).toFixed(3),
            isNaN(due) ? '' : due.toISOString().slice(0, 10),
            { v: '', h: `<button class="zy-dl zy-dl-red">${zyImg('btn_dl_red')}</button>` }];
  });
  body.innerHTML = zyDT2('dt-credit', {
    cols: ['Date', 'For', 'Term', 'Currency', 'Payout', 'Due Date', 'Download'], rows, sort: 0, dir: -1 });
  zy2Render('dt-credit');
}

/* ═══ PAYMENT REQUESTS ══════════════════════════════════════ */
async function pgPaymentRequests() {
  const c = document.getElementById('page-content');
  zyCrumb(['Payment Requests']);
  c.innerHTML = `<div class="zy-intro">Here you can track your payment requests. and make new requests.</div>
    <div class="zy-balbox">
      <div class="zy-bal zy-bal-usd">USD Balance: <span id="bal-usd">0</span></div>
      <div class="zy-bal zy-bal-eur">EUR Balance: <span id="bal-eur">0</span></div>
      <div class="zy-bal zy-bal-gbp">GBP Balance: <span id="bal-gbp">0</span></div>
    </div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="pr-from" value="${zyMonthStart()} 00:00:00">
      <input class="zy-fb-input" id="pr-to" value="${zyToday()} 23:59:59">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgPaymentRequestsLoad()">Show Report</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">Payment Requests</div>
      <div class="zy-panel-body" id="pr-body"><div class="zy-loading">Loading…</div></div></div>`;
  const earn = await apiFetch(`/api/agent/${AGENT_ID}/earnings`);
  const bal = (earn && (earn.balance ?? earn.total)) || 0;
  const el = document.getElementById('bal-usd'); if (el) el.textContent = bal;
  pgPaymentRequestsLoad();
}
async function pgPaymentRequestsLoad() {
  const body = document.getElementById('pr-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch(`/api/payout-requests?agent_id=${AGENT_ID}`))
    .filter(r => zyInRange('pr', r.timestamp));
  const rows = list.map(r => [
    zyDateOnly(r.timestamp), r.currency || 'USD',
    r.amount != null ? Number(r.amount).toFixed(2) : '',
    { v: r.status || '', h: `<span class="zy-badge-active ${r.status === 'paid' ? '' : 'zy-badge-off'}">${(r.status || '').replace(/^./, ch => ch.toUpperCase())}</span>` },
    r.method || r.mode || '', r.notes || '', r.paid_amount != null ? r.paid_amount : ''
  ]);
  body.innerHTML = zyDT2('dt-payreq', {
    cols: ['Date', 'Currency', 'Amount', 'Status', 'Payment Mode', 'Details', 'Paid Amount'], rows, sort: 0, dir: -1 });
  zy2Render('dt-payreq');
}

/* ═══ BANK ACCOUNTS ═════════════════════════════════════════ */
async function pgBankAccounts() {
  const c = document.getElementById('page-content');
  zyCrumb(['Bank Accounts']);
  c.innerHTML = `<div class="zy-intro">Here you can add your bank accounts and use them while requesting payments.</div>
    <div class="zy-panel"><div class="zy-panel-head">Manage Bank Accounts
      <div class="zy-head-acts">
        <button class="zy-act zy-act-blue" onclick="zyAddBankModal()" title="Add Bank Account">${zyImg('btn_add')}</button>
      </div></div>
      <div class="zy-panel-body" id="bk-body"><div class="zy-loading">Loading…</div></div></div>`;
  let list = [];
  try { list = zyList(await apiFetch(`/api/bank-accounts?agent_id=${AGENT_ID}`)); } catch (e) { list = []; }
  const rows = list.map(b => [b.currency || '', b.country || '', b.bank_name || '', b.bank_branch || '',
                              b.bank_address || '', b.account_no || '', b.beneficiary || '']);
  document.getElementById('bk-body').innerHTML = zyDT2('dt-bank', {
    cols: ['Currency', 'Country', 'Bank Name', 'Bank Branch', 'Bank Address', 'Account No.', 'Beneficiary'], rows });
  zy2Render('dt-bank');
}
const ZY_COUNTRIES = ['Afghanistan', 'Aland Islands', 'Albania', 'Algeria', 'American Samoa', 'Andorra', 'Angola',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Bahrain', 'Bangladesh', 'Belgium', 'Brazil', 'Canada', 'China',
  'Egypt', 'France', 'Germany', 'India', 'Indonesia', 'Iraq', 'Italy', 'Japan', 'Kenya', 'Malaysia', 'Nigeria',
  'Pakistan', 'Philippines', 'Saudi Arabia', 'Singapore', 'Spain', 'Turkey', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Vietnam'];
function zyAddBankModal() {
  zyModal('Add New Bank Account', `
    <label class="zy-lbl">Currency</label>
    <select class="zy-input" id="bk-cur"><option value="">Select Currency</option>
      <option>USD</option><option>EUR</option><option>GBP</option></select>
    <label class="zy-lbl">Country</label>
    ${zyS2('bk-country', 'Select Country', ZY_COUNTRIES)}
    <label class="zy-lbl">Bank Name</label><input class="zy-input" id="bk-name" placeholder="Bank Name">
    <label class="zy-lbl">Bank Branch</label><input class="zy-input" id="bk-branch" placeholder="Bank Branch">
    <label class="zy-lbl">Bank Address</label><input class="zy-input" id="bk-addr" placeholder="Bank Address">
    <label class="zy-lbl">Account No./IBAN</label><input class="zy-input" id="bk-acc" placeholder="Account Number/IBAN">
    <label class="zy-lbl">Beneficiary Name</label><input class="zy-input" id="bk-ben" placeholder="Beneficiary Name">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveBank()">Add</button>`);
}
async function zySaveBank() {
  const p = { agent_id: AGENT_ID,
    currency: document.getElementById('bk-cur').value,
    country: zyS2Value('bk-country'),
    bank_name: document.getElementById('bk-name').value.trim(),
    bank_branch: document.getElementById('bk-branch').value.trim(),
    bank_address: document.getElementById('bk-addr').value.trim(),
    account_no: document.getElementById('bk-acc').value.trim(),
    beneficiary: document.getElementById('bk-ben').value.trim() };
  if (!p.currency || !p.bank_name) { toast('Currency and bank name required', 'error'); return; }
  try { await apiFetch('/api/bank-accounts', { method: 'POST', body: JSON.stringify(p) }); } catch (e) {}
  closeModal(); zyFlash('Bank Account Added.'); loadPage('bank-accounts');
}

/* ═══ STATEMENTS ════════════════════════════════════════════ */
async function pgStatements(cur) {
  const c = document.getElementById('page-content');
  zyCrumb([cur + ' Statements']);
  c.innerHTML = `<div class="zy-gap"></div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="sm-from" value="${zyMonthStart()} 00:00:00">
      <input class="zy-fb-input" id="sm-to" value="${zyToday()} 23:59:59">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgStatementsLoad('${cur}')">Show Report</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">${cur} Statements</div>
      <div class="zy-panel-body" id="sm-body"><div class="zy-loading">Loading…</div></div></div>`;
  pgStatementsLoad(cur);
}
async function pgStatementsLoad(cur) {
  const body = document.getElementById('sm-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  let balance = 0;
  const rows = zyList(await apiFetch('/api/credit-notes?limit=500'))
    .filter(n => String(n.agent_id) === String(AGENT_ID))
    .filter(n => (n.currency || 'USD') === cur)
    .filter(n => zyInRange('sm', n.created || n.date))
    .sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')))
    .map(n => {
      const credit = Number(n.amount || 0);
      balance = Math.round((balance + credit) * 1000) / 1000;
      return [zyDateOnly(n.created || n.date), credit.toFixed(2), '0', 'Credit Note', balance.toFixed(2), n.reason || ''];
    }).reverse();
  body.innerHTML = zyDT2('dt-stmt', {
    cols: ['Date', 'Credit', 'Debit', 'Transaction For', 'Balance', 'Remarks'], rows, sort: 0, dir: -1 });
  zy2Render('dt-stmt');
}

/* ═══ TEST PANELS ═══════════════════════════════════════════ */
function pgVoiceTestPanel() { return zyTestPanel(true); }
function pgSmsTestPanel() { return zyTestPanel(false); }
async function zyTestPanel(voice) {
  const c = document.getElementById('page-content');
  zyCrumb([voice ? 'Test Panel' : 'SMS Test Panel']);
  const intro = voice
    ? `<div class="zy-intro">We are pleased to introduce the test numbers of our interconnected terminations. You can test the reachability of our number ranges using the following numbers.</div>
       <div class="zy-intro">To test:</div>
       <ul class="zy-list">
         <li>Choose a test number from a termination you are interested in.</li>
         <li>Make a call to the selected number.</li>
         <li>If the test is successful, you will hear: "You have reached the test number".</li>
         <li>Check also the Last calls stats (last 1 hour) below if your test was successful.</li>
       </ul>`
    : `<div class="zy-intro">Here you can see all test numbers.. you can make call on them and see test reports.</div>`;
  c.innerHTML = `${intro}
    <div class="zy-panel">
      <div class="zy-panel-head">${voice ? 'Test Numbers' : 'SMS Test Numbers'}
        <div class="zy-head-acts">
          ${zyS2('tp-range', 'Select Range', [])}
          <button class="zy-act zy-act-red zy-act-wide" onclick="zyTestFilter()">Filter</button>
        </div>
      </div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">${voice ? 'Recent Test Details' : 'Recent SMS Test'}</div>
      <div class="zy-panel-body" id="tp-recent"><div class="zy-loading">Loading…</div></div></div>`;

  const [nums, ranges, logs] = voice
    ? await Promise.all([
        apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`),
        apiFetch('/api/numbers/sms-ranges'),
        apiFetch(`/api/sms/logs?agent_id=${AGENT_ID}&limit=500`)
      ])
    : await Promise.all([
        apiFetch('/api/sms/test-numbers?limit=500'),
        apiFetch('/api/numbers/sms-ranges'),
        apiFetch('/api/sms/test-logs?limit=500')
      ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['tp-range'].items = ZY_RANGES.map(r => r.range_name || r.name || r.country || '');

  if (voice) {
    ZY_TESTNUMS = zyList(nums).map(n => [
      n.range_name || n.range_label || n.range || (n.country && n.provider && n.provider !== 'Manual' ? `${n.country} ${n.provider}` : (n.country || '—')), n.prefix || '', n.number || '',
      n.payout != null && n.payout !== '' ? n.payout : 'Ask',
      { v: '', h: `SD : <b>${n.sms_daily || 0}</b> | SW : <b>${n.sms_weekly || 0}</b>` }
    ]);
    c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-testnums', {
      cols: ['Range', 'Prefix', 'Test Number', 'Payout', 'Limits'], rows: ZY_TESTNUMS });
    zy2Render('dt-testnums');

    const rows = zyList(logs).map(s => [
      zyDateOnly(s.timestamp), s.range_name || s.range_label || s.range || (s.country && s.provider && s.provider !== 'Manual' ? `${s.country} ${s.provider}` : (s.country || '—')),
      s.number || '', zyMaskCli(s.cli || s.app), s.message ? 'XXXXX' : ''
    ]);
    document.getElementById('tp-recent').innerHTML = zyDT2('dt-testlog', {
      cols: ['Date', 'Range', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
    zy2Render('dt-testlog');
    return;
  }

  ZY_TESTNUMS = zyList(nums).map(n => [n.range_name || n.range_label || n.range || (n.country ? `${n.country}` : '—'), n.number || '']);
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-testnums', {
    cols: ['Range', 'Test Number'], rows: ZY_TESTNUMS });
  zy2Render('dt-testnums');

  const mask = s => String(s || '').replace(/./g, '*').slice(0, 6);
  const rows = zyList(logs).map(s => [
    zyDateOnly(s.timestamp), s.range_name || s.range_label || s.range || (s.country ? `${s.country}` : '—'),
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

/* ── router ─────────────────────────────────────────────────── */
(function zyHookAgentPages() {
  const map = {
    'dashboard': () => pgDashboard(),
    'sms-ranges': pgSmsRanges, 'my-sms-numbers': pgMySmsNumbers, 'sms-ratecard': pgSmsRateCard,
    'access-search': pgAccessSearch, 'news-clients': pgNewsClients, 'my-clients': pgMyClients,
    'detailed-sms': pgDetailedSms, 'summary-sms': pgSummarySms,
    'client-sms-stats': pgClientSmsStats, 'sms-range-stats': pgSmsRangeStats,
    'sms-number-stats': pgSmsNumberStats, 'credit-notes': pgCreditNotes,
    'payment-requests': pgPaymentRequests, 'bank-accounts': pgBankAccounts,
    'usd-statements': () => pgStatements('USD'), 'eur-statements': () => pgStatements('EUR'),
    'gbp-statements': () => pgStatements('GBP'),
    'voice-test-panel': pgVoiceTestPanel, 'sms-test-panel': pgSmsTestPanel
  };
  const prev = loadPage;
  loadPage = function (page) {
    if (map[page]) {
      document.getElementById('zy-user-menu')?.classList.remove('open');
      if (window.innerWidth < 992) document.getElementById('zy-mega')?.classList.remove('open');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + page)?.classList.add('active');
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('agent_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
  };
})();
