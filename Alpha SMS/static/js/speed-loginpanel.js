/* ═══════════════════════════════════════════════════════════════
   OWNER — "Login Panel" connections
   Add as many external panels as you like. For each one we store the
   username / password / panel link / SMS-OTP link, then Start it and
   ALPHA SMS keeps logging in and pulling the SMS.

   From the remote panel we only take  NUMBER · CLI · SMS.
   Range, payout/rate, agent/client and IP always come from OUR panel.
   ═══════════════════════════════════════════════════════════════ */

/* the admin panel has no escaping helper of its own */
const lpEsc = v => String(v ?? '').replace(/[<>&"]/g, ch =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

let _lpSyncTimer = null;

async function renderLoginPanels() {
  const c = document.getElementById('page-content');
  c.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>`;

  if (_lpSyncTimer) {
    clearInterval(_lpSyncTimer);
    _lpSyncTimer = null;
  }

  const res = await apiFetch('/api/login-panels');
  const data = Array.isArray(res) ? res : ((res && res.data) || []);

  function buildLoginPanelsHtml(panelsList) {
    return `
    <div class="page-header">
      <div>
        <div class="page-title">Login Panel</div>
        <div class="page-subtitle">Log into another provider's panel and pull its SMS/OTP with Date &amp; Time (Auto-refresh every 10s)</div>
      </div>
      <div class="page-actions" style="display:flex;align-items:center;gap:8px;">
        <span class="badge badge-blue" style="font-size:11px;padding:5px 9px;">
          <i class="fas fa-rotate fa-spin" style="margin-right:4px;"></i> Live 3s Sync
        </span>
        <button class="btn btn-primary btn-sm" onclick="openAddLoginPanelModal()">
          <i class="fas fa-plus"></i> Add Login Panel
        </button>
        <button class="btn btn-outline btn-sm" onclick="renderLoginPanels()">
          <i class="fas fa-sync"></i> Refresh
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;background:rgba(76,110,245,0.08);border-color:rgba(76,110,245,0.2);">
      <div style="display:flex;align-items:flex-start;gap:10px;font-size:12px;color:var(--text-secondary);">
        <i class="fas fa-circle-info" style="color:var(--accent);margin-top:2px;"></i>
        <div>
          Add the panel, press <strong>Start</strong>, and ALPHA SMS logs in (solving captcha automatically)
          and auto-pulls the SMS CDR every <strong>10 seconds</strong>.
          The <strong>Date &amp; Time</strong>, <strong>Number</strong>, <strong>CLI</strong>, <strong>SMS</strong> and <strong>OTP</strong> are extracted live and ingested without missing codes.
        </div>
      </div>
    </div>

    <div class="stats-grid" id="lp-stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;">
      ${statCard('Total Panels', 'fas fa-layer-group', panelsList.length, 'blue', 'Configured')}
      ${statCard('Running', 'fas fa-play', panelsList.filter(p => p.status === 'running').length, 'green', 'Auto Pulling 10s')}
      ${statCard('SMS Pulled', 'fas fa-inbox', panelsList.reduce((n, p) => n + (p.total_sms || 0), 0), 'purple', 'All time')}
    </div>

    <div class="card" id="lp-table-card">
      ${buildTable(
        ['#', 'Panel', 'Username', 'Panel Link', 'SMS / OTP Link', 'Every', 'SMS Pulled', 'Last Run', 'Status', 'Actions'],
        panelsList.length ? panelsList.map(p => [
          p.id,
          `<strong>${lpEsc(p.name || '—')}</strong>${p.last_error
            ? `<div class="text-danger fs-11" title="${lpEsc(p.last_error)}">${lpEsc(p.last_error).slice(0, 42)}</div>` : ''}`,
          `<span class="monospace">${lpEsc(p.username || '—')}</span>`,
          `<span class="monospace fs-11">${lpEsc(p.panel_url || '—')}</span>`,
          `<span class="monospace fs-11">${lpEsc(p.data_url || '—')}</span>`,
          `${p.interval || 10}s`,
          `<strong class="text-success">${p.total_sms || 0}</strong>`,
          p.last_run ? `<span class="fs-11">${String(p.last_run).replace('T', ' ').slice(0, 19)}</span>` : '—',
          `<span class="status-indicator ${p.status === 'running' ? 'online' : 'offline'}"></span> ${
            p.status === 'running' ? '<span class="badge badge-green">Running</span>'
                                   : '<span class="badge badge-red">Stopped</span>'}`,
          `<button class="btn btn-${p.status === 'running' ? 'warning' : 'success'} btn-sm"
                   onclick="toggleLoginPanel(${p.id}, '${p.status}')">
             <i class="fas fa-${p.status === 'running' ? 'stop' : 'play'}"></i> ${p.status === 'running' ? 'Stop' : 'Start'}
           </button>
           <button class="btn btn-outline btn-sm" onclick="pullLoginPanelNow(${p.id})" title="Scrape &amp; Pull latest SMS now">
             <i class="fas fa-rotate"></i> Pull
           </button>
           <button class="btn btn-outline btn-sm" onclick="testLoginPanel(${p.id})" title="Test login &amp; preview rows">
             <i class="fas fa-plug"></i> Test
           </button>
           <button class="btn btn-outline btn-sm" onclick="openEditLoginPanelModal(${p.id})" title="Edit">
             <i class="fas fa-pen"></i>
           </button>
           <button class="btn btn-danger btn-sm" onclick="deleteLoginPanel(${p.id})" title="Delete">
             <i class="fas fa-trash"></i>
           </button>`
        ]) : []
      )}
      ${panelsList.length ? '' : `<div class="empty-state">
        <i class="fas fa-right-to-bracket" style="font-size:34px;color:var(--text-muted);"></i>
        <p>No login panels yet. Press <strong>Add Login Panel</strong> to connect one.</p></div>`}
    </div>`;
  }

  c.innerHTML = buildLoginPanelsHtml(data);

  // Auto-sync login panels every 3 seconds
  _lpSyncTimer = setInterval(async () => {
    if (!document.getElementById('lp-table-card')) {
      clearInterval(_lpSyncTimer);
      _lpSyncTimer = null;
      return;
    }
    try {
      const liveRes = await apiFetch('/api/login-panels');
      const liveData = Array.isArray(liveRes) ? liveRes : ((liveRes && liveRes.data) || []);
      const card = document.getElementById('lp-table-card');
      const statGrid = document.getElementById('lp-stats-grid');
      if (card && statGrid) {
        statGrid.innerHTML = `
          ${statCard('Total Panels', 'fas fa-layer-group', liveData.length, 'blue', 'Configured')}
          ${statCard('Running', 'fas fa-play', liveData.filter(p => p.status === 'running').length, 'green', 'Auto Pulling 10s')}
          ${statCard('SMS Pulled', 'fas fa-inbox', liveData.reduce((n, p) => n + (p.total_sms || 0), 0), 'purple', 'All time')}
        `;
        card.innerHTML = buildTable(
          ['#', 'Panel', 'Username', 'Panel Link', 'SMS / OTP Link', 'Every', 'SMS Pulled', 'Last Run', 'Status', 'Actions'],
          liveData.length ? liveData.map(p => [
            p.id,
            `<strong>${lpEsc(p.name || '—')}</strong>${p.last_error
              ? `<div class="text-danger fs-11" title="${lpEsc(p.last_error)}">${lpEsc(p.last_error).slice(0, 42)}</div>` : ''}`,
            `<span class="monospace">${lpEsc(p.username || '—')}</span>`,
            `<span class="monospace fs-11">${lpEsc(p.panel_url || '—')}</span>`,
            `<span class="monospace fs-11">${lpEsc(p.data_url || '—')}</span>`,
            `${p.interval || 10}s`,
            `<strong class="text-success">${p.total_sms || 0}</strong>`,
            p.last_run ? `<span class="fs-11">${String(p.last_run).replace('T', ' ').slice(0, 19)}</span>` : '—',
            `<span class="status-indicator ${p.status === 'running' ? 'online' : 'offline'}"></span> ${
              p.status === 'running' ? '<span class="badge badge-green">Running</span>'
                                     : '<span class="badge badge-red">Stopped</span>'}`,
            `<button class="btn btn-${p.status === 'running' ? 'warning' : 'success'} btn-sm"
                     onclick="toggleLoginPanel(${p.id}, '${p.status}')">
               <i class="fas fa-${p.status === 'running' ? 'stop' : 'play'}"></i> ${p.status === 'running' ? 'Stop' : 'Start'}
             </button>
             <button class="btn btn-outline btn-sm" onclick="pullLoginPanelNow(${p.id})" title="Scrape &amp; Pull latest SMS now">
               <i class="fas fa-rotate"></i> Pull
             </button>
             <button class="btn btn-outline btn-sm" onclick="testLoginPanel(${p.id})" title="Test login &amp; preview rows">
               <i class="fas fa-plug"></i> Test
             </button>
             <button class="btn btn-outline btn-sm" onclick="openEditLoginPanelModal(${p.id})" title="Edit">
               <i class="fas fa-pen"></i>
             </button>
             <button class="btn btn-danger btn-sm" onclick="deleteLoginPanel(${p.id})" title="Delete">
               <i class="fas fa-trash"></i>
             </button>`
          ]) : []
        ) + (liveData.length ? '' : `<div class="empty-state">
          <i class="fas fa-right-to-bracket" style="font-size:34px;color:var(--text-muted);"></i>
          <p>No login panels yet. Press <strong>Add Login Panel</strong> to connect one.</p></div>`);
      }
    } catch (e) {}
  }, 3000);
}

function loginPanelForm(p) {
  p = p || {};
  return `
    <div class="form-group">
      <label class="form-label">Username *</label>
      <input id="lp-user" value="${lpEsc(p.username || '')}" placeholder="panel username" required>
    </div>
    <div class="form-group">
      <label class="form-label">Password *</label>
      <input id="lp-pass" type="password" placeholder="${p.id ? 'leave blank to keep the saved password' : 'panel password'}">
    </div>
    <div class="form-group">
      <label class="form-label">Panel Link (login page) *</label>
      <input id="lp-url" value="${lpEsc(p.panel_url || '')}" placeholder="http://your-provider.com/ints/ag/login" required>
    </div>
    <div class="form-group">
      <label class="form-label">SMS / OTP Link (CDR page) *</label>
      <input id="lp-data" value="${lpEsc(p.data_url || '')}" placeholder="http://your-provider.com/ints/ag/client/SMSCDRStats" required>
    </div>
    <div class="form-group">
      <label class="form-label">Panel Name</label>
      <input id="lp-name" value="${lpEsc(p.name || '')}" placeholder="optional — taken from the link if left blank">
    </div>
    <div class="form-group">
      <label class="form-label">Check Every (seconds) — auto-pull interval (default 10s)</label>
      <input id="lp-interval" type="number" min="5" value="${p.interval || 10}">
    </div>`;
}

function openAddLoginPanelModal() {
  openModal('Add Login Panel', `
    <form onsubmit="submitLoginPanel(event)">
      ${loginPanelForm()}
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-floppy-disk"></i> Save</button>
      </div>
    </form>`);
}

async function openEditLoginPanelModal(id) {
  const res = await apiFetch('/api/login-panels');
  const p = ((res && res.data) || []).find(x => x.id === id);
  if (!p) return;
  openModal('Edit Login Panel', `
    <form onsubmit="submitLoginPanel(event, ${id})">
      ${loginPanelForm(p)}
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-floppy-disk"></i> Save</button>
      </div>
    </form>`);
}

async function submitLoginPanel(event, id) {
  event.preventDefault();
  const val = i => (document.getElementById(i) || {}).value || '';
  const payload = {
    name: val('lp-name').trim(),
    username: val('lp-user').trim(),
    password: val('lp-pass'),
    panel_url: val('lp-url').trim(),
    data_url: val('lp-data').trim(),
    interval: parseInt(val('lp-interval')) || 20
  };
  if (!payload.username || !payload.panel_url || !payload.data_url || (!id && !payload.password)) {
    toast('Username, password, panel link and SMS/OTP link are required', 'error');
    return;
  }
  const res = id
    ? await apiFetch(`/api/login-panels/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    : await apiFetch('/api/login-panels', { method: 'POST', body: JSON.stringify(payload) });
  if (!res) return;
  closeModal();
  zyFlash(id ? 'Login Panel Updated.' : 'Login Panel Added.');
  await renderLoginPanels();
  zyShowFlash();
}

async function toggleLoginPanel(id, status) {
  const action = status === 'running' ? 'stop' : 'start';
  const res = await apiFetch(`/api/login-panels/${id}/${action}`, { method: 'POST' });
  if (!res) return;
  zyFlash(action === 'start' ? 'Login Panel Started.' : 'Login Panel Stopped.');
  await renderLoginPanels();
  zyShowFlash();
}

async function pullLoginPanelNow(id) {
  toast('Logging in and scraping latest SMS...', 'info');
  try {
    const res = await apiFetch(`/api/login-panels/${id}/pull`, { method: 'POST' });
    if (res && res.success) {
      toast(`✅ Pulled ${res.pulled || 0} new SMS. Total: ${res.total || 0}`, 'success');
    } else {
      toast(`⚠️ Scrape notice: ${res?.error || 'No new SMS or login issue'}`, 'error');
    }
    await renderLoginPanels();
  } catch (e) {
    toast('Pull error: ' + e.message, 'error');
  }
}

async function testLoginPanel(id) {
  openModal('Testing connection…', `<div class="empty-state">
    <i class="fas fa-spinner fa-spin" style="font-size:26px;"></i>
    <p>Logging in and reading the SMS page…</p></div>`);
  const res = await apiFetch(`/api/login-panels/${id}/test`, { method: 'POST' });
  if (!res) return;
  if (!res.success) {
    openModal('Connection Failed', `
      <div class="card" style="background:rgba(218,54,51,0.08);border-color:rgba(218,54,51,0.25);">
        <i class="fas fa-triangle-exclamation" style="color:var(--red-light);"></i>
        ${lpEsc(res.error || 'Unknown error')}
      </div>
      <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
    return;
  }
  openModal('Connection OK', `
    <div class="card" style="background:rgba(46,160,67,0.08);border-color:rgba(46,160,67,0.25);margin-bottom:12px;">
      <i class="fas fa-circle-check" style="color:var(--green-light);"></i>
      Logged in and read <strong>${res.rows}</strong> row(s). This is what will be taken:
    </div>
    ${buildTable(['Date & Time', 'Number', 'CLI', 'SMS', 'OTP'],
      (res.preview || []).map(p => [
        `<span class="fs-11 text-muted" style="white-space:nowrap;"><i class="fas fa-clock" style="margin-right:4px;"></i>${lpEsc(p.date || p.timestamp || '—')}</span>`,
        `<span class="monospace">${lpEsc(p.number || '—')}</span>`,
        lpEsc(p.cli || '—'),
        `<span class="fs-11">${lpEsc((p.message || '—').slice(0, 70))}</span>`,
        `<strong class="text-success">${lpEsc(p.otp || '—')}</strong>`
      ]))}
    <div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}

async function deleteLoginPanel(id) {
  openModal('Delete Login Panel', `
    <p>Delete this login panel? The SMS already pulled from it stay in your logs.</p>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doDeleteLoginPanel(${id})">Delete</button>
    </div>`);
}

async function doDeleteLoginPanel(id) {
  const res = await apiFetch(`/api/login-panels/${id}`, { method: 'DELETE' });
  if (!res) return;
  closeModal();
  zyFlash('Login Panel Deleted.');
  await renderLoginPanels();
  zyShowFlash();
}
