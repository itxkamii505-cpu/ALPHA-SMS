/* MAIT SMS panel — MANAGER pages. Requires speed-kit.js */

/* ═══ 1. SMS RANGES ═════════════════════════════════════════ */
async function pgSmsRanges() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS Ranges']);
  c.innerHTML = `<div class="zy-intro">Here you can view your termination ranges, and their payouts.</div>
    <div class="zy-panel"><div class="zy-panel-head">View SMS Ranges</div>
    <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const list = zyList(await apiFetch('/api/numbers/sms-ranges'));
  ZY_RANGE_LIST = list;
  const rows = list.map((r, i) => [
    r.name || `${r.country || ''} ${r.provider || ''}`.trim(),
    r.prefix || '',
    { v: r.active === false ? '' : 'yes', h: zyTick(r.active !== false) },
    r.currency || 'USD',
    r.cli_list || r.cli || '',
    { v: '', h: `<button class="zy-rowbtn" onclick="zyRangeMemo(${i})" title="View">${zyImg('btn_range_eye')}</button>` }
  ]);
  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-ranges', { cols: ['Name', 'Prefix', 'Active', 'Currency', 'CLIList', 'Action'], rows });
  zy2Render('dt-ranges');
}
let ZY_RANGE_LIST = [];
/* Limits & Memo popup — the blue eye button on SMS Ranges */
function zyRangeMemo(i) {
  const r = ZY_RANGE_LIST[i] || {};
  const pays = Array.isArray(r.payouts) ? r.payouts
             : (r.payout != null ? [{ term: r.payterm || '7/1', currency: r.currency || 'USD', payout: r.payout }] : []);
  zyModal('', `
    <div class="zy-memo-h">Limits &amp; Memo</div>
    <div class="zy-memo-k">Max SMS Day</div>
    <div class="zy-memo-v">${r.max_sms_day != null ? r.max_sms_day : 0}</div>
    <div class="zy-memo-k">Memo Text</div>
    <div class="zy-memo-v">${zyEsc(r.memo || '')}</div>
    <div class="zy-memo-k">CLI Limits List</div>
    <div class="zy-memo-v">${zyEsc(r.cli_list || '')}</div>
    <div class="zy-memo-h">Agent's Payouts</div>
    <table class="zy-memo-t"><thead><tr><th>Payterm</th><th>Currency</th><th>Payout</th></tr></thead>
      <tbody>${pays.length ? pays.map(p => `<tr><td>${zyEsc(p.term || p.payterm || '')}</td>
        <td>${zyEsc(p.currency || 'USD')}</td><td>${zyEsc(String(p.payout ?? ''))}</td></tr>`).join('')
        : '<tr><td colspan="3"></td></tr>'}</tbody></table>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>`);
}

/* ═══ 2. SMS NUMBERS ════════════════════════════════════════ */
let ZY_RANGES = [], ZY_AGENTS = [];
async function pgSmsNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['IPRN SMS Module', 'SMS Numbers']);
  c.innerHTML = `<div class="zy-intro">Here you can view numbers that are added on system, you can set various services to your numbers and route them to your agents.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">Manage SMS Numbers
        <div class="zy-head-acts">
          ${zyS2('num-range', 'Select Range', [], zyNumFilter)}
          <button class="zy-act zy-act-teal" onclick="zyAllocateAll()" title="Allocate All Numbers">${zyImg('btn_alloc')}</button>
          <button class="zy-act zy-act-red" onclick="zyUnassignSelected()" title="Unassign">${zyImg('btn_unassign')}</button>
        </div>
      </div>
      <div class="zy-filterbar">
        ${zySelectSearch('num-agent', 'Search agents…')}
        <select id="num-agent"><option value="">Select Agent</option></select>
        <select id="num-status"><option value="">All Numbers</option><option value="assigned">Assigned</option><option value="free">Free</option></select>
        <input id="num-filter" placeholder="Filter Number">
        <button class="zy-btn-red" onclick="pgSmsNumbers()">Filter</button>
      </div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const [nums, ranges, agents] = await Promise.all([
    apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=100000`),
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`)
  ]);
  ZY_RANGES = zyList(ranges); ZY_AGENTS = zyList(agents);
  ZY_S2['num-range'].items = ZY_RANGES.map(r => r.name || r.country || '');
  document.getElementById('num-agent').innerHTML =
    `<option value="">Select Agent</option>` + ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('');

  const data = (nums && nums.data) || [];
  const agentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
  const rows = data.map(n => {
    const r = [
      `${n.country || ''} ${n.provider || ''}`.trim(),
      n.prefix || '',
      n.number || '',
      { v: agentName(n.agent_id), h: agentName(n.agent_id) || zyImg('ui_pencil', 'zy-pen') },
      n.payout != null ? n.payout : '',
      { v: '', h: `SD : <b>${n.sd_limit != null ? n.sd_limit : 0}</b> | SW : <b>${n.sw_limit != null ? n.sw_limit : 0}</b>` },
      ''
    ];
    r.__id = n.id; return r;
  });
  ZY_NUMROWS = rows;
  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-numbers', { cols: ['Range', 'Prefix', 'Number', 'Agent', 'Payout', 'Limits', 'Action'], rows, check: true });
  zy2Render('dt-numbers');
}

function zyAllocateAll() {
  const ids = zy2Checked('dt-numbers');
  const t = ZYT2['dt-numbers'];
  const picked = t.rows.filter(r => ids.includes(String(r.__id))).map(r => zyCell2(r[2]).v);
  zyModal('Allocate All Numbers', `
    <label class="zy-lbl">Numbers</label>
    <div class="zy-numlist">${picked.length ? picked.join(', ') : 'No numbers selected'}</div>
    <label class="zy-lbl">Select Agent</label>
    ${zySelectSearch('al-agent', 'Search agents…')}
    <select id="al-agent" class="zy-input"><option value="">Please Select</option>
      ${ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('')}</select>
    <label class="zy-lbl">Payterm</label>
    <select id="al-pay" class="zy-input"><option value="">Please Select</option>
      <option>Weekly</option><option>Bi-Weekly</option><option>Monthly</option></select>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zyDoAllocate(${JSON.stringify(ids).replace(/"/g, '&quot;')})">Allocate</button>`);
}
async function zyDoAllocate(ids) {
  const agent = document.getElementById('al-agent').value;
  if (!agent) { toast('Select an agent', 'error'); return; }
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  await apiFetch('/api/numbers/bulk-assign-many', {
    method: 'POST', body: JSON.stringify({ number_ids: ids.map(Number), agent_id: Number(agent), target_type: 'agent', target_id: Number(agent) })
  });
  closeModal(); toast('Numbers allocated', 'success'); loadPage('my-numbers');
}
async function zyUnassignSelected() {
  const ids = zy2Checked('dt-numbers');
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  await apiFetch('/api/numbers/bulk-unassign-many', { method: 'POST', body: JSON.stringify({ number_ids: ids.map(Number) }) });
  toast('Unassigned', 'success'); loadPage('my-numbers');
}

function zyNumFilter() {
  const q = zyS2Value('num-range').toLowerCase();
  const t = ZYT2['dt-numbers']; if (!t) return;
  t.rows = q ? ZY_NUMROWS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_NUMROWS;
  t.page = 1; zy2Render('dt-numbers');
}
let ZY_NUMROWS = [];

/* ═══ 3. SMS RATECARD ═══════════════════════════════════════ */
async function pgRateCard() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS RateCard']);
  c.innerHTML = `<div class="zy-intro">Here you can export ratecard and send it to your clients by updating payouts.</div>
    <div class="zy-panel"><div class="zy-panel-head">SMS RateCard
      <button class="zy-act-export" onclick="zy2Export('dt-rate','csv')">${zyImg('btn_export')} Export</button></div>
    <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const [ranges, rate] = await Promise.all([apiFetch('/api/numbers/sms-ranges'), apiFetch('/api/numbers/rate-card')]);
  const rc = zyList(rate);
  const rows = zyList(ranges).map(r => {
    const m = rc.find(x => x.range_id === r.id || x.name === r.name) || {};
    return [ r.name || `${r.country || ''} ${r.provider || ''}`.trim(), r.prefix || '',
             r.test_number || m.test_number || '', r.currency || 'USD',
             m.payout != null ? m.payout : (r.payout != null ? r.payout : '') ];
  });
  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-rate', { cols: ['Range', 'Prefix', 'Test Number', 'Currency', 'Payout'], rows });
  zy2Render('dt-rate');
}

/* ═══ 4. SMS BULK ALLOCATIONS ═══════════════════════════════ */
async function pgBulkAllocations() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS Bulk Allocations']);
  c.innerHTML = `<div class="zy-intro">Using Bulk Allocations you can allocate numbers in bulk to any of your agent.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">SMS Bulk Allocations</div>
      <div class="zy-panel-strip"></div>
      <div class="zy-panel-body">
        <label class="zy-lbl">Choose Range</label>
        ${zyS2('ba-range', 'Select Range', [])}
        <label class="zy-lbl">Choose Agent</label>
        ${zyS2('ba-agent', '', [])}
        <label class="zy-lbl">Choose Payterm</label>
        <div class="zy-note">Please ensure your ranges have payouts in selected payterm</div>
        <select class="zy-input" id="ba-pay"><option value="">Please Select</option>
          <option>Weekly</option><option>Bi-Weekly</option><option>Monthly</option></select>
        <label class="zy-lbl">Qty each Range to Allocate</label>
        <input class="zy-input zy-input-sm" id="ba-qty" value="3">
        <div class="zy-center"><button class="zy-btn-grey zy-btn-wide" onclick="zyBulkAllocate()">Allocate Numbers</button></div>
      </div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">Recent Allocations</div>
      <div class="zy-panel-strip"></div>
      <div class="zy-panel-body" id="ba-recent"><div class="zy-loading">Loading…</div></div></div>`;

  const [ranges, agents, hist] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`),
    apiFetch('/api/numbers/allocation-history?limit=200')
  ]);
  ZY_RANGES = zyList(ranges); ZY_AGENTS = zyList(agents);
  ZY_S2['ba-range'].items = ZY_RANGES.map(r => r.name || r.country || '');
  ZY_S2['ba-agent'].items = ZY_AGENTS.map(a => a.username || '');

  const agentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
  const rows = ((hist && hist.data) || []).map(h => [
    (h.date || h.created || '').replace('T', ' ').slice(0, 19),
    h.agent || agentName(h.agent_id) || h.target || '',
    h.qty_each != null ? h.qty_each : (h.count || ''),
    h.total != null ? h.total : (h.count || ''),
    { v: '', h: `<button class="zy-dl zy-dl-red">${zyImg('btn_dl_red')}</button>
                 <button class="zy-dl zy-dl-orange">${zyImg('btn_dl_orange')}</button>` }
  ]);
  document.getElementById('ba-recent').innerHTML =
    zyDT2('dt-alloc', { cols: ['Date', 'Agent', 'Qty/Each Range', 'Total Number', 'Download'], rows, sort: 0, dir: -1 });
  zy2Render('dt-alloc');
}
async function zyBulkAllocate() {
  const name = zyS2Value('ba-agent');
  const agent = (ZY_AGENTS.find(a => a.username === name) || {}).id;
  const qty = parseInt(document.getElementById('ba-qty').value) || 0;
  if (!agent) { toast('Please select an agent', 'error'); return; }
  if (!qty) { toast('Enter quantity', 'error'); return; }
  await apiFetch('/api/numbers/bulk-allocate', {
    method: 'POST',
    body: JSON.stringify({ target_type: 'agent', target_id: Number(agent), count: qty, notes: 'Bulk allocation' })
  });
  zyFlash('Numbers Allocated.'); loadPage('assign-numbers');
}

/* ═══ 5. AGENTS ═════════════════════════════════════════════ */
async function pgAgentsList() {
  const c = document.getElementById('page-content');
  zyCrumb(['Users Master', 'Agents']);
  c.innerHTML = `<div class="zy-intro">Here You can create your Agents, and allocate numbers to them, they can further create their sub-clients and assign numbers to them.</div>
    <div class="zy-panel"><div class="zy-panel-head">Manage Agents
      <div class="zy-head-acts">
        <button class="zy-act zy-act-blue" onclick="zyAddAgentModal()" title="Add Agent">${zyImg('btn_add')}</button>
        <button class="zy-act zy-act-red" onclick="zyDeleteChecked('dt-agents','agents')" title="Delete">${zyImg('btn_trash')}</button>
      </div></div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const res = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=500`);
  ZY_AGENT_LIST = (res && res.data) || [];
  const rows = ZY_AGENT_LIST.map(a => {
    const r = [a.username || '', a.full_name || '', a.email || '', a.phone || '', a.skype_id || '',
      { v: a.status === 'active' ? 'yes' : '', h: zyTick(a.status === 'active') },
      { v: a.verified ? 'yes' : '', h: zyTick(a.verified !== false) },
      a.agent_ip || a.ip || '',
      { v: '', h: `<button class="zy-gentoken" onclick="zyGenToken(${a.id})">Gen Token</button>` },
      { v: '', h: zyRowActions('agent', a.id, true) }];
    r.__id = a.id; return r;
  });
  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-agents', { cols: ['Username', 'Name', 'Email', 'Contact', 'Skype', 'Active',
                                'Verified', 'IP', 'Token', 'Action'], rows, check: true });
  zy2Render('dt-agents');
}
function zyAddAgentModal() {
  zyModal('Add New Agent', `
    <label class="zy-lbl">Username</label><input class="zy-input" id="na-user" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Password</label><input class="zy-input" id="na-pass" type="password" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Email</label><input class="zy-input" id="na-mail" placeholder="abc@xyz.com">
    <label class="zy-lbl">Skype ID</label><input class="zy-input" id="na-skype" placeholder="Skype ID">
    <label class="zy-lbl">Contact No.</label><input class="zy-input" id="na-phone" placeholder="441768499506">
    <label class="zy-lbl">Name</label><input class="zy-input" id="na-name" placeholder="Agent Name">
    <label class="zy-lbl">Company Name</label><input class="zy-input" id="na-company" placeholder="Company Name">
    <label class="zy-lbl">Address</label><textarea class="zy-input zy-area" id="na-addr" placeholder="Address"></textarea>
    <label class="zy-lbl">Country</label>${zyS2('na-country', 'Afghanistan', ZY_COUNTRY_LIST)}
    <label class="zy-lbl">Agent IP (Allocated Numbers will transfer to this IP)</label>
    <input class="zy-input" id="na-ip" placeholder="Enter Server IP">
    <label class="zy-lbl">SMS Delivery URL</label>
    <input class="zy-input" id="na-url" placeholder="https://server1.xyz.com/smsreceiver">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveAgent()">Add</button>`);
}
async function zySaveAgent() {
  const p = {
    username: document.getElementById('na-user').value.trim(),
    password: document.getElementById('na-pass').value,
    email: document.getElementById('na-mail').value.trim(),
    skype_id: document.getElementById('na-skype').value.trim(),
    phone: document.getElementById('na-phone').value.trim(),
    full_name: document.getElementById('na-name').value.trim(),
    company: document.getElementById('na-company').value.trim(),
    address: document.getElementById('na-addr').value.trim(),
    country: zyS2Value('na-country'),
    agent_ip: document.getElementById('na-ip').value.trim(),
    delivery_url: document.getElementById('na-url').value.trim(),
    manager_id: MANAGER_ID
  };
  if (p.username.length < 6 || p.password.length < 6) { toast('Username and password need 6+ characters', 'error'); return; }
  const r = await apiFetch('/api/agents', { method: 'POST', body: JSON.stringify(p) });
  if (r && r.id) { closeModal(); zyFlash('Agent Added.'); loadPage('agents'); }
}

/* ═══ 6. CLIENTS ════════════════════════════════════════════ */
async function pgClientsList() {
  const c = document.getElementById('page-content');
  zyCrumb(['Users Master', 'Clients']);
  c.innerHTML = `<div class="zy-intro">Clients are the very low level(end users). They can get numbers from their agents and make traffic on them and see reportings.</div>
    <div class="zy-panel"><div class="zy-panel-head">Manage Clients
      <div class="zy-head-acts">
        <button class="zy-act zy-act-blue" onclick="zyAddClientModal()" title="Add Client">${zyImg('btn_add')}</button>
        <button class="zy-act zy-act-red" onclick="zyDeleteChecked('dt-clients','clients')" title="Delete">${zyImg('btn_trash')}</button>
      </div></div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const [cl, ag] = await Promise.all([
    apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=500`),
    apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`)
  ]);
  ZY_AGENTS = (ag && ag.data) || [];
  const agentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
  ZY_CLIENT_LIST = (cl && cl.data) || [];
  const rows = ZY_CLIENT_LIST.map(x => {
    const r = [agentName(x.agent_id), x.username || '', x.full_name || '', x.email || '', x.phone || '', x.skype_id || '',
      { v: x.status === 'active' ? 'yes' : '', h: zyTick(x.status === 'active') },
      { v: '', h: zyRowActions('client', x.id, false) }];
    r.__id = x.id; return r;
  });
  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-clients', { cols: ['Agent', 'Username', 'Name', 'Email', 'Contact', 'Skype', 'Active', 'Action'],
                          rows, check: true, sort: 1 });
  zy2Render('dt-clients');
}
function zyAddClientModal() {
  zyModal('Add New Client', `
    <label class="zy-lbl">Select Agent</label>
    <select class="zy-input" id="nc-agent"><option value="">None</option>
      ${ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('')}</select>
    <label class="zy-lbl">Username</label><input class="zy-input" id="nc-user" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Password</label><input class="zy-input" id="nc-pass" type="password" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Email</label><input class="zy-input" id="nc-mail" placeholder="abc@xyz.com">
    <label class="zy-lbl">Skype ID</label><input class="zy-input" id="nc-skype" placeholder="Skype ID">
    <label class="zy-lbl">Contact No.</label><input class="zy-input" id="nc-phone" placeholder="441768499506">
    <label class="zy-lbl">Name</label><input class="zy-input" id="nc-name" placeholder="Client Name">
    <label class="zy-lbl">Company Name</label><input class="zy-input" id="nc-company" placeholder="Company Name">
    <label class="zy-lbl">Address</label><textarea class="zy-input zy-area" id="nc-addr" placeholder="Address"></textarea>
    <label class="zy-lbl">Country</label>${zyS2('nc-country', 'Afghanistan', ZY_COUNTRY_LIST)}`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveClient()">Add</button>`);
}
async function zySaveClient() {
  const p = {
    agent_id: Number(document.getElementById('nc-agent').value) || null,
    username: document.getElementById('nc-user').value.trim(),
    password: document.getElementById('nc-pass').value,
    email: document.getElementById('nc-mail').value.trim(),
    skype_id: document.getElementById('nc-skype').value.trim(),
    contact_no: document.getElementById('nc-phone').value.trim(),
    full_name: document.getElementById('nc-name').value.trim(),
    company: document.getElementById('nc-company').value.trim(),
    address: document.getElementById('nc-addr').value.trim(),
    country: zyS2Value('nc-country'),
    manager_id: MANAGER_ID
  };
  if (p.username.length < 6 || p.password.length < 6) { toast('Username and password need 6+ characters', 'error'); return; }
  const r = await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(p) });
  if (r && r.id) { closeModal(); zyFlash('Client Added.'); loadPage('clients'); }
}
let ZY_AGENT_LIST = [], ZY_CLIENT_LIST = [];

/* Per-row action buttons — same set as the reference panel:
   agents  = unassign(X) / view / edit / delete,  clients = view / edit / delete */
function zyRowActions(kind, id, withX) {
  return (withX ? `<button class="zy-rowbtn" onclick="zyRowUnassign('${kind}',${id})" title="Unassign Numbers">${zyImg('btn_row_x')}</button>` : '') +
    `<button class="zy-rowbtn" onclick="zyRowView('${kind}',${id})" title="View">${zyImg('btn_row_eye')}</button>` +
    `<button class="zy-rowbtn" onclick="zyRowEdit('${kind}',${id})" title="Edit">${zyImg('btn_row_pencil')}</button>` +
    `<button class="zy-rowbtn" onclick="zyRowDelete('${kind}',${id})" title="Delete">${zyImg('btn_row_trash')}</button>`;
}
const zyRowRec = (kind, id) =>
  (kind === 'agent' ? ZY_AGENT_LIST : ZY_CLIENT_LIST).find(x => String(x.id) === String(id)) || {};

function zyRowView(kind, id) {
  const u = zyRowRec(kind, id);
  const line = (k, v) => `<div class="zy-memo-k">${k}</div><div class="zy-memo-v">${zyEsc(String(v ?? ''))}</div>`;
  zyModal(kind === 'agent' ? 'Agent Details' : 'Client Details',
    line('Username', u.username) + line('Name', u.full_name) + line('Email', u.email) +
    line('Contact No.', u.phone) + line('Skype ID', u.skype_id) + line('Company Name', u.company) +
    line('Address', u.address) + line('Country', u.country) +
    (kind === 'agent' ? line('Agent IP', u.agent_ip || u.ip) + line('SMS Delivery URL', u.delivery_url) : '') +
    line('Status', u.status),
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>`);
}
function zyRowEdit(kind, id) {
  const u = zyRowRec(kind, id);
  const inp = (i, l, v, ph) => `<label class="zy-lbl">${l}</label><input class="zy-input" id="${i}" value="${zyEsc(String(v ?? ''))}" placeholder="${ph || ''}">`;
  zyModal(kind === 'agent' ? 'Edit Agent' : 'Edit Client',
    inp('ed-mail', 'Email', u.email, 'abc@xyz.com') +
    inp('ed-skype', 'Skype ID', u.skype_id, 'Skype ID') +
    inp('ed-phone', 'Contact No.', u.phone, '441768499506') +
    inp('ed-name', 'Name', u.full_name, 'Name') +
    inp('ed-company', 'Company Name', u.company, 'Company Name') +
    `<label class="zy-lbl">Address</label><textarea class="zy-input zy-area" id="ed-addr" placeholder="Address">${zyEsc(String(u.address || ''))}</textarea>` +
    `<label class="zy-lbl">Country</label>${zyS2('ed-country', u.country || 'Afghanistan', ZY_COUNTRY_LIST)}` +
    (kind === 'agent' ? inp('ed-ip', 'Agent IP (Allocated Numbers will transfer to this IP)', u.agent_ip || u.ip, 'Enter Server IP') +
                        inp('ed-url', 'SMS Delivery URL', u.delivery_url, 'https://server1.xyz.com/smsreceiver') : ''),
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zyRowSave('${kind}',${id})">Update</button>`);
}
async function zyRowSave(kind, id) {
  const val = i => (document.getElementById(i) || {}).value || '';
  const p = { email: val('ed-mail'), skype_id: val('ed-skype'), phone: val('ed-phone'),
              full_name: val('ed-name'), company: val('ed-company'), address: val('ed-addr'),
              country: zyS2Value('ed-country') };
  if (kind === 'agent') { p.agent_ip = val('ed-ip'); p.delivery_url = val('ed-url'); }
  await apiFetch(`/api/${kind === 'agent' ? 'agents' : 'clients'}/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
  closeModal(); zyFlash(kind === 'agent' ? 'Agent Updated.' : 'Client Updated.');
  loadPage(kind === 'agent' ? 'agents' : 'clients');
}
function zyRowDelete(kind, id) {
  zyModal('Delete', `<p class="zy-confirm">Delete this ${kind}?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyRowDoDelete('${kind}',${id})">Delete</button>`);
}
async function zyRowDoDelete(kind, id) {
  await apiFetch(`/api/${kind === 'agent' ? 'agents' : 'clients'}/${id}`, { method: 'DELETE' });
  closeModal(); zyFlash(kind === 'agent' ? 'Agent Deleted.' : 'Client Deleted.');
  loadPage(kind === 'agent' ? 'agents' : 'clients');
}
async function zyRowUnassign(kind, id) {
  zyModal('Unassign Numbers', `<p class="zy-confirm">Unassign all numbers of this agent?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyRowDoUnassign(${id})">Unassign</button>`);
}
async function zyRowDoUnassign(id) {
  await apiFetch('/api/numbers/bulk-unassign-many', { method: 'POST', body: JSON.stringify({ agent_id: Number(id) }) });
  closeModal(); zyFlash('Numbers Unassigned.'); loadPage('agents');
}
async function zyGenToken(id) {
  const r = await apiFetch('/api/tokens', { method: 'POST', body: JSON.stringify({ agent_id: Number(id), name: 'Agent Token' }) });
  zyModal('API Token', `<div class="zy-memo-k">Token</div>
    <div class="zy-memo-v zy-token">${zyEsc((r && (r.token || r.key)) || 'Could not generate token')}</div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>`);
}

async function zyDeleteChecked(tableId, kind) {
  const ids = zy2Checked(tableId);
  if (!ids.length) { toast('Nothing selected', 'error'); return; }
  zyModal('Delete', `<p class="zy-confirm">Delete ${ids.length} selected ${kind}?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyDoDelete('${kind}',${JSON.stringify(ids).replace(/"/g, '&quot;')})">Delete</button>`);
}
async function zyDoDelete(kind, ids) {
  for (const id of ids) await apiFetch(`/api/${kind}/${id}`, { method: 'DELETE' });
  closeModal(); toast('Deleted', 'success'); loadPage(kind === 'agents' ? 'agents' : 'clients');
}

/* ═══ 7. SMS STATS & REPORTS ════════════════════════════════ */
async function pgSmsReports() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Stats & Reports']);
  const today = new Date().toISOString().slice(0, 10);
  c.innerHTML = `<div class="zy-intro">Here You can view all the call detail records and grouped statistics.</div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="rp-from" value="${today} 00:00:00">
      <input class="zy-fb-input" id="rp-to" value="${today} 23:59:59">
      <select class="zy-fb-input" id="rp-range"><option value="">Filter Range</option></select>
      <select class="zy-fb-input" id="rp-agent"><option value="">Filter Agent</option></select>
      <input class="zy-fb-input" id="rp-num" placeholder="Search Number">
      <input class="zy-fb-input" id="rp-cli" placeholder="Search CLI">
      <div class="zy-groupby"><b>Group By :</b>
        ${['Date', 'Month', 'Range', 'Agent', 'Number', 'CLI'].map(g =>
          `<label><input type="checkbox" class="grp-chk" value="${g.toLowerCase()}" onchange="pgSmsReportsLoad()"> ${g}</label>`).join('')}
      </div>
      <div class="zy-fb-btns">
        <button class="zy-btn-orange" onclick="zy2Export('dt-reports','csv')">Export Report</button>
        <button class="zy-btn-blue" onclick="pgSmsReportsLoad()">Show Report</button>
      </div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">SMS Reports &amp; Stats</div>
      <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;

  const [ranges, agents] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch(typeof MANAGER_ID !== 'undefined' && MANAGER_ID ? `/api/agents?manager_id=${MANAGER_ID}&limit=200` : '/api/agents?limit=200')
  ]);
  ZY_RANGES = zyList(ranges); ZY_AGENTS = zyList(agents);
  const rEl = document.getElementById('rp-range');
  if (rEl) rEl.innerHTML = `<option value="">Filter Range</option>` +
    ZY_RANGES.map(r => `<option value="${r.id}">${zyEsc(r.name || r.country || '')}</option>`).join('');
  const aEl = document.getElementById('rp-agent');
  if (aEl) aEl.innerHTML = `<option value="">Filter Agent</option>` +
    ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username || a.name || '')}</option>`).join('');

  await pgSmsReportsLoad();
}

async function pgSmsReportsLoad() {
  const panelBody = document.querySelector('.zy-panel-body');
  if (!panelBody) return;
  panelBody.innerHTML = `<div class="zy-loading">Loading…</div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const range = val('rp-range'), agent = val('rp-agent');
  const num = val('rp-num'), cli = val('rp-cli');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (typeof MANAGER_ID !== 'undefined' && MANAGER_ID) params.append('manager_id', MANAGER_ID);
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (range) params.append('range', range);
  if (agent) params.append('agent_id', agent);
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
      agent: 'Agent',
      number: 'Number',
      cli: 'CLI'
    };
    const cols = [...checkedBoxes.map(k => keyLabels[k] || k), 'SMS Count', 'Currency', 'Payout'];
    const rows = data.map(g => [
      ...checkedBoxes.map(k => g[k] || '—'),
      g.sms_count || 0,
      g.currency || 'USD',
      `$${Number(g.payout || 0).toFixed(4)}`
    ]);
    const totalSms = data.reduce((sum, g) => sum + (g.sms_count || 0), 0);
    const totalPayout = data.reduce((sum, g) => sum + (parseFloat(g.payout) || 0), 0);

    panelBody.innerHTML = zyDT2('dt-reports', {
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
    zy2Render('dt-reports');
  } else {
    const rows = data.map(s => [
      (s.timestamp || '').replace('T', ' ').slice(0, 19),
      s.range || `${s.country || ''} ${s.provider || ''}`.trim(),
      s.type || 'General',
      s.number || '',
      (s.cli || s.app || '—'),
      s.message || '',
      s.user || s.agent || '',
      s.currency || '$',
      s.payout != null ? s.payout : '',
      s.status === 'delivered' || s.status === 'success' ? 'Success' : (s.cause || s.status || ''),
      s.ip || ''
    ]);
    const totalSms = rows.length;
    panelBody.innerHTML = zyDT2('dt-reports', {
      cols: ['Date', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Agent', 'Currency', 'Payout', 'Cause', 'IP'],
      rows,
      sort: 0,
      dir: -1,
      footRow: `<td><b>Total SMS ${totalSms}</b></td>` + '<td></td>'.repeat(6) +
               `<td><b>Currency</b><br>${ZY_CCY.join('<br>')}</td>` +
               `<td><b>Payout</b><br>${zySumByCcy(data, s => s.payout)}</td>` +
               '<td></td><td></td>'
    });
    zy2Render('dt-reports');
  }
}

/* ── hook the pages into the router ─────────────────────────── */
(function zyHookPages() {
  const map = {
    'sms-overview': pgSmsRanges,
    'my-numbers': pgSmsNumbers,
    'payout-rates-view': pgRateCard,
    'assign-numbers': pgBulkAllocations,
    'agents': pgAgentsList,
    'clients': pgClientsList,
    'reports': pgSmsReports
  };
  const prev = loadPage;
  loadPage = function (page) {
    if (map[page]) {
      document.getElementById('zy-user-menu')?.classList.remove('open');
      if (window.innerWidth < 992) document.getElementById('zy-mega')?.classList.remove('open');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + page)?.classList.add('active');
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('manager_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
  };
})();


/* ═══ 8. SMS TEST PANEL ═════════════════════════════════════ */
async function pgTestPanel() {
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

  const [nums, ranges, logs] = await Promise.all([
    apiFetch('/api/sms/test-numbers?limit=500'),
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch('/api/sms/test-logs?limit=500')
  ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['tp-range'].items = ZY_RANGES.map(r => r.name || r.country || '');

  ZY_TESTNUMS = zyList(nums).map(n => [n.range_label || '—', n.number || '']);
  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-testnums', { cols: ['Range', 'Test Number'], rows: ZY_TESTNUMS });
  zy2Render('dt-testnums');

  const mask = s => String(s || '').replace(/./g, '*').slice(0, 6);
  const rows = zyList(logs).map(s => [
    zyDateOnly(s.timestamp), s.range_label || '—',
    s.number || '', zyMaskCli(s.cli), mask(s.message)
  ]);
  document.getElementById('tp-recent').innerHTML =
    zyDT2('dt-testlog', { cols: ['Date', 'Range', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
  zy2Render('dt-testlog');
}
let ZY_TESTNUMS = [];
function zyTestFilter() {
  const q = zyS2Value('tp-range').toLowerCase();
  const t = ZYT2['dt-testnums'];
  t.rows = q ? ZY_TESTNUMS.filter(r => String(r[0]).toLowerCase().includes(q)) : ZY_TESTNUMS;
  t.page = 1; zy2Render('dt-testnums');
}

/* ═══ 9. AGENT CREDIT NOTES ═════════════════════════════════ */
async function pgCreditNotes() {
  const c = document.getElementById('page-content');
  zyCrumb(['Agent Credit Notes']);
  c.innerHTML = `<div class="zy-intro">These are the credit notes for your agent. You have to pay the amount to agent on due date. Your agent's can request payment after due date.</div>
    ${zyFilterBox('cn', 'pgCreditNotesLoad()')}
    <div class="zy-panel"><div class="zy-panel-head">Agent Credit Notes</div>
      <div class="zy-panel-body" id="cn-body"><div class="zy-loading">Loading…</div></div></div>`;
  await zyFillAgents('cn-agent');
  pgCreditNotesLoad();
}
async function pgCreditNotesLoad() {
  const body = document.getElementById('cn-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const res = await apiFetch('/api/credit-notes?limit=500');
  const mine = new Set(ZY_AGENTS.map(a => String(a.id)));
  const pick = zyAgentFilter('cn');
  const rows = ((res && res.data) || [])
    .filter(n => mine.has(String(n.agent_id)))
    .filter(n => !pick || String(n.agent_id) === pick)
    .filter(n => zyInRange('cn', n.created || n.date))
    .map(n => {
      const due = new Date((n.date || n.created || '').slice(0, 10));
      due.setDate(due.getDate() + 1);
      return [ (n.date || n.created || '').slice(0, 10), zyAgentName(n.agent_id),
               n.term || 'Weekly', n.currency || 'USD',
               n.amount != null ? Number(n.amount).toFixed(3) : '',
               isNaN(due) ? '' : due.toISOString().slice(0, 10),
               { v: '', h: `<button class="zy-rowbtn" onclick="zyCreditPdf(${n.id})" title="Download">${zyImg('btn_dl_pdf')}</button>` } ];
    });
  body.innerHTML = zyDT2('dt-credit', {
    cols: ['Date', 'Agent', 'Term', 'Currency', 'Payout', 'Due Date', 'Download'], rows, sort: 0, dir: -1 });
  zy2Render('dt-credit');
}

function zyCreditPdf(id) { window.open(`/api/credit-notes/${id}/pdf`, '_blank'); }

/* ═══ 10. PAYMENT REQUESTS ══════════════════════════════════ */
async function pgPaymentRequests() {
  const c = document.getElementById('page-content');
  zyCrumb(['Payment Requests']);
  c.innerHTML = `<div class="zy-intro">Here you can see all payment requests done by your agents. You can check their stats and then update admin to process on these payment requests.</div>
    ${zyFilterBox('pr', 'pgPaymentRequestsLoad()')}
    <div class="zy-panel"><div class="zy-panel-head">Payment Requests</div>
      <div class="zy-panel-body" id="pr-body"><div class="zy-loading">Loading…</div></div></div>`;
  await zyFillAgents('pr-agent');
  pgPaymentRequestsLoad();
}
async function pgPaymentRequestsLoad() {
  const body = document.getElementById('pr-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const res = await apiFetch(`/api/payout-requests?manager_id=${MANAGER_ID}`);
  const pick = zyAgentFilter('pr');
  const pickName = pick ? zyAgentName(pick) : '';
  const rows = ((res && res.data) || [])
    .filter(r => !pick || r.user === pickName || String(r.user_id) === pick)
    .filter(r => zyInRange('pr', r.timestamp))
    .map(r => [
      zyDateOnly(r.timestamp), r.user || zyAgentName(r.user_id),
      r.method || r.mode || '', r.currency || 'USD',
      r.amount != null ? Number(r.amount).toFixed(2) : '',
      { v: r.status || '', h: `<span class="zy-badge-active ${r.status === 'paid' ? '' : 'zy-badge-off'}">${(r.status || '').replace(/^./, ch => ch.toUpperCase())}</span>` },
      r.notes || r.details || ''
    ]);
  body.innerHTML = zyDT2('dt-payreq', {
    cols: ['Date', 'Agent', 'Mode', 'Currency', 'Payment', 'Status', 'Details'], rows, sort: 0, dir: -1 });
  zy2Render('dt-payreq');
}

/* ═══ 11-13. USD / EUR / GBP STATEMENTS ═════════════════════ */
async function pgStatements(cur) {
  const c = document.getElementById('page-content');
  zyCrumb([cur + ' Statements']);
  c.innerHTML = `<div class="zy-gap"></div>
    ${zyFilterBox('st', `pgStatementsLoad('${cur}')`)}
    <div class="zy-panel"><div class="zy-panel-head">${cur} Statements</div>
      <div class="zy-panel-body" id="st-body"><div class="zy-loading">Loading…</div></div></div>`;
  await zyFillAgents('st-agent');
  pgStatementsLoad(cur);
}
async function pgStatementsLoad(cur) {
  const body = document.getElementById('st-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const res = await apiFetch('/api/credit-notes?limit=500');
  const mine = new Set(ZY_AGENTS.map(a => String(a.id)));
  const pick = zyAgentFilter('st');
  let balance = 0;
  const rows = ((res && res.data) || [])
    .filter(n => mine.has(String(n.agent_id)))
    .filter(n => (n.currency || 'USD') === cur)
    .filter(n => !pick || String(n.agent_id) === pick)
    .filter(n => zyInRange('st', n.created || n.date))
    .sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')))
    .map(n => {
      const credit = Number(n.amount || 0);
      balance = Math.round((balance + credit) * 1000) / 1000;
      return [ zyDateOnly(n.created || n.date), zyAgentName(n.agent_id),
               credit.toFixed(2), '0', 'Credit Note', balance.toFixed(2), n.reason || '' ];
    }).reverse();
  body.innerHTML = zyDT2('dt-stmt', {
    cols: ['Date', 'Agent', 'Credit', 'Debit', 'Transaction For', 'Balance', 'Remarks'], rows, sort: 0, dir: -1 });
  zy2Render('dt-stmt');
}

/* ── register the new pages ─────────────────────────────────── */
(function zyHookPages2() {
  const map = {
    'sms-test-panel': pgTestPanel,
    'my-earnings': pgCreditNotes,
    'payout-requests': pgPaymentRequests,
    'usd-statements': () => pgStatements('USD'),
    'eur-statements': () => pgStatements('EUR'),
    'gbp-statements': () => pgStatements('GBP')
  };
  const prev = loadPage;
  loadPage = function (page) {
    if (map[page]) {
      document.getElementById('zy-user-menu')?.classList.remove('open');
      if (window.innerWidth < 992) document.getElementById('zy-mega')?.classList.remove('open');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + page)?.classList.add('active');
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('manager_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
  };
})();
