/* ═══════════════════════════════════════════════
   Agent Panel — Extra Features (Production Ready v2.0)
   Assign Numbers to Client, Payout Rates, Download
   ═══════════════════════════════════════════════ */

// ── Page override ─────────────────────────────────────────────────
const _agOrigLoad = loadPage;
const _agExtraPages = {
  'assign-to-client': pgAgentAssignToClient,
  'transfer-history': pgAgentTransferHistory,
};

loadPage = function(page) {
  if (_agExtraPages[page]) {
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    const navEl = document.getElementById(`nav-${page}`);
    if (navEl) navEl.classList.add('active');
    document.getElementById('breadcrumb').textContent = navEl ? navEl.querySelector('span').textContent : page;
    document.getElementById('page-content').innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    _agExtraPages[page]();
  } else {
    _agOrigLoad(page);
  }
};

// ── Assign Numbers to Client (Agent → Client) ─────────────────────
let agAssignPoolPerPage = 25;
let agAssignedPerPage = 25;
async function pgAgentAssignToClient(poolPage = 1, assignedPage = 1) {
  try {
    const [clients, poolData, assignedData] = await Promise.all([
      apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`),
      apiFetch(`/api/numbers?unassigned=true&agent_id=${AGENT_ID}&page=${poolPage}&limit=${agAssignPoolPerPage}`),
      apiFetch(`/api/numbers?assigned_to_agent=${AGENT_ID}&page=${assignedPage}&limit=${agAssignedPerPage}`)
    ]);

    const clientList = clients?.data || [];
    const pool = poolData?.data || [];
    const poolTotal = poolData?.total || 0;
    const assigned = assignedData?.data || [];
    const assignedTotal = assignedData?.total || 0;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Assign Numbers to Client</div>
          <div class="page-subtitle">Select numbers to assign to a client, or return assigned numbers back to your pool</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="downloadAgentNumbers()">
            <i class="fas fa-download"></i> Download CSV
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header" style="justify-content:space-between;">
          <div class="card-title">Available Numbers (unassigned) — select to assign</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="agAssignPoolPerPage=this.value==='all'?'all':parseInt(this.value);pgAgentAssignToClient(1,1)" style="width:80px;">
              <option value="25" ${agAssignPoolPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${agAssignPoolPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${agAssignPoolPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${agAssignPoolPerPage === 500 ? 'selected' : ''}>500</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          ${zySelectSearch('ag-cl-client-bulk', 'Search clients…')}
          <select id="ag-cl-client-bulk" style="min-width:200px;">
            <option value="">— Select Client to assign selected numbers —</option>
            ${clientList.filter(c => c.status === 'active').map(c => `<option value="${c.id}">${c.username} (${c.service || '—'})</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="assignSelectedPoolNumbers()"><i class="fas fa-user-plus"></i> Assign Selected</button>
          <span id="ag-pool-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
        </div>
        ${buildTable(
          [`<input type="checkbox" onchange="document.querySelectorAll('.ag-pool-check').forEach(cb=>cb.checked=this.checked);updateAgPoolSelectedCount()">`, 'Number', 'Country', 'Provider', 'Service'],
          pool.map(n => [
            `<input type="checkbox" class="ag-pool-check" value="${n.id}" onchange="updateAgPoolSelectedCount()">`,
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            n.country || '—',
            n.provider || '—',
            `<span style="color:${serviceColor(n.app)};font-weight:600">${n.app || '—'}</span>`
          ])
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-muted);">${poolTotal} available</span>
          ${agAssignPoolPerPage === 'all' ? '' : `
            <div class="pagination">
              <span class="pg-info">Page ${poolPage} of ${Math.ceil(poolTotal / agAssignPoolPerPage) || 1}</span>
              <button onclick="pgAgentAssignToClient(${poolPage - 1}, ${assignedPage})" ${poolPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
              <button onclick="pgAgentAssignToClient(${poolPage + 1}, ${assignedPage})" ${poolPage >= Math.ceil(poolTotal / agAssignPoolPerPage) ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="justify-content:space-between;">
          <div class="card-title">Assigned Numbers — select to return</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="agAssignedPerPage=this.value==='all'?'all':parseInt(this.value);pgAgentAssignToClient(1,1)" style="width:80px;">
              <option value="25" ${agAssignedPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${agAssignedPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${agAssignedPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${agAssignedPerPage === 500 ? 'selected' : ''}>500</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <button class="btn btn-warning btn-sm" onclick="returnSelectedAssignedNumbers()"><i class="fas fa-user-minus"></i> Return Selected</button>
          <span id="ag-assigned-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
        </div>
        ${buildTable(
          [`<input type="checkbox" onchange="document.querySelectorAll('.ag-assigned-check').forEach(cb=>cb.checked=this.checked);updateAgAssignedSelectedCount()">`, 'Number', 'Client', 'Service', 'Status'],
          assigned.map(n => [
            `<input type="checkbox" class="ag-assigned-check" value="${n.id}" onchange="updateAgAssignedSelectedCount()">`,
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            n.client_name || n.client_username || '—',
            `<span style="color:${serviceColor(n.app)};font-weight:600">${n.app || '—'}</span>`,
            statusBadge(n.status)
          ])
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-muted);">${assignedTotal} assigned</span>
          ${agAssignedPerPage === 'all' ? '' : `
            <div class="pagination">
              <span class="pg-info">Page ${assignedPage} of ${Math.ceil(assignedTotal / agAssignedPerPage) || 1}</span>
              <button onclick="pgAgentAssignToClient(${poolPage}, ${assignedPage - 1})" ${assignedPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
              <button onclick="pgAgentAssignToClient(${poolPage}, ${assignedPage + 1})" ${assignedPage >= Math.ceil(assignedTotal / agAssignedPerPage) ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            </div>
          `}
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="downloadAgentNumbers()">
            <i class="fas fa-download"></i> Download My Numbers CSV
          </button>
          <button class="btn btn-outline btn-sm" onclick="loadPage('transfer-history')">
            <i class="fas fa-list-check"></i> Transfer History
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Assign to Client error:', err);
    toast('Failed to load data', 'error');
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load data. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgAgentAssignToClient()">Retry</button>
      </div>
    `;
  }
}

function updateAgPoolSelectedCount() {
  const n = document.querySelectorAll('.ag-pool-check:checked').length;
  const el = document.getElementById('ag-pool-selected-count');
  if (el) el.textContent = `${n} selected`;
}
function updateAgAssignedSelectedCount() {
  const n = document.querySelectorAll('.ag-assigned-check:checked').length;
  const el = document.getElementById('ag-assigned-selected-count');
  if (el) el.textContent = `${n} selected`;
}
async function assignSelectedPoolNumbers() {
  const ids = Array.from(document.querySelectorAll('.ag-pool-check:checked')).map(cb => parseInt(cb.value));
  const clientId = parseInt(document.getElementById('ag-cl-client-bulk')?.value);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!clientId) { toast('Please select a client', 'error'); return; }
  await openAssignTermsModal(ids, clientId);
}

async function openAssignTermsModal(numberIds, clientId) {
  // Look up the range (payment term + rate) for the first selected number —
  // selections are normally from the same batch/range.
  const [ranges, clientsData] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=200`)
  ]);
  const allPool = await apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=2000`);
  const firstNum = (allPool?.data || []).find(n => numberIds.includes(n.id));
  const range = (ranges || []).find(r => r.country === firstNum?.country && r.provider === firstNum?.provider);
  const client = (clientsData?.data || []).find(c => c.id === clientId);

  const term = range?.payout_schedule === 'monthly' ? 'Monthly' : 'Weekly';
  const rate = range?.payout || 0;

  openModal(`Assign ${numberIds.length} Number(s) — ${client?.username || ''}`, `
    <form id="assign-terms-form" onsubmit="submitAssignWithTerms(event, ${JSON.stringify(numberIds)}, ${clientId}, '${range?.payout_schedule || 'weekly'}')">
      <div style="background:var(--bg-hover);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;font-size:13px;">
        <span class="text-muted">Payment Term</span><strong>${term}</strong>
      </div>
      <div class="form-group">
        <label class="form-label">Payout ($) *</label>
        <input type="number" id="assign-payout" step="0.0001" value="${rate}" required>
        <small class="text-muted">Auto-filled from the range's rate — you can adjust it for this client.</small>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Allocate</button>
      </div>
    </form>
  `);
}

function updateAssignPayoutField(weeklyRate, monthlyRate) {
  const term = document.getElementById('assign-payterm')?.value;
  const payoutField = document.getElementById('assign-payout');
  if (!payoutField) return;
  payoutField.value = term === 'weekly' ? weeklyRate : term === 'monthly' ? monthlyRate : 0;
}

async function submitAssignWithTerms(event, numberIds, clientId, payTerm) {
  event.preventDefault();
  const payout = parseFloat(document.getElementById('assign-payout')?.value);
  if (isNaN(payout) || payout < 0) { toast('Enter a valid payout amount', 'error'); return; }

  try {
    await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({
        number_ids: numberIds, target_type: 'client', target_id: clientId,
        payment_term: payTerm, client_payout: payout,
        notes: 'Assigned via Assign to Client page'
      })
    });
    closeModal();
    toast(`✅ Assigned ${numberIds.length} number(s) to client! (${payTerm}, $${payout})`, 'success');
    const currentPage = sessionStorage.getItem('agent_current_page');
    if (currentPage === 'my-sms-numbers' && typeof pgMySmsNumbers === 'function') {
      pgMySmsNumbers(typeof smsNumbersPage !== 'undefined' ? smsNumbersPage : 1);
    } else {
      pgAgentAssignToClient();
    }
  } catch (err) {
    console.error('Assign error:', err);
    toast('Some numbers failed to assign', 'error');
  }
}
async function returnSelectedAssignedNumbers() {
  const ids = Array.from(document.querySelectorAll('.ag-assigned-check:checked')).map(cb => parseInt(cb.value));
  if (!ids.length) { toast('Select at least one number to return', 'warning'); return; }
  if (!confirm(`Return ${ids.length} number(s) to your pool?`)) return;
  try {
    await Promise.all(ids.map(id => apiFetch(`/api/numbers/${id}/unassign`, { method: 'POST' })));
    toast(`✅ Returned ${ids.length} number(s) to pool`, 'warning');
    pgAgentAssignToClient();
  } catch (err) {
    console.error('Return error:', err);
    toast('Some numbers failed to return', 'error');
  }
}


function downloadAgentNumbers() {
  try {
    window.open(`/api/numbers/download?agent_id=${AGENT_ID}`, '_blank');
    toast('Downloading numbers CSV...', 'info');
  } catch (err) {
    console.error('Download error:', err);
    toast('Failed to download', 'error');
  }
}

// ── TRANSFER HISTORY ──────────────────────────────────────────────
async function pgAgentTransferHistory(page = 1) {
  try {
    const data = await apiFetch(`/api/number-transfers?page=${page}&limit=20&user_id=${AGENT_ID}`);
    const transfers = data?.data || [];
    const total = data?.total || 0;
    const perPage = 20;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Transfer History</div>
          <div class="page-subtitle">All number transfers involving your account</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="downloadAgentNumbers()">
            <i class="fas fa-download"></i> Download CSV
          </button>
          <button class="btn btn-outline btn-sm" onclick="loadPage('assign-to-client')">
            <i class="fas fa-right-left"></i> Assign New
          </button>
        </div>
      </div>

      <div class="card">
        ${buildTable(
          ['#', 'Direction', 'From', 'To', 'Count', 'Service', 'Notes', 'Time', 'Status'],
          transfers.map(t => [
            t.id || '—',
            t.from_user_id === AGENT_ID
              ? `<span class="badge badge-red">Sent</span>`
              : `<span class="badge badge-green">Received</span>`,
            `<strong>${t.from_username || '—'}</strong> <span class="badge badge-${t.from_role === 'Admin' ? 'red' : 'purple'}">${t.from_role || '—'}</span>`,
            `<strong>${t.to_username || '—'}</strong> <span class="badge badge-${t.to_role === 'Agent' ? 'cyan' : 'green'}">${t.to_role || '—'}</span>`,
            `<span class="badge badge-blue">${t.count || 0}</span>`,
            t.service || '—',
            t.notes || '—',
            fmtShort(t.timestamp),
            statusBadge(t.status)
          ])
        )}
        ${pagination(page, total, perPage, pgAgentTransferHistory)}
      </div>
    `;
  } catch (err) {
    console.error('Transfer history error:', err);
    toast('Failed to load transfer history', 'error');
  }
}

// ── EXPORT FUNCTIONS ──────────────────────────────────────────────
function exportTransferHistory() {
  try {
    toast('Exporting transfer history...', 'info');
    window.open(`/api/number-transfers/export?agent_id=${AGENT_ID}`, '_blank');
  } catch (err) {
    console.error('Export error:', err);
    toast('Failed to export', 'error');
  }
}

// ── LEGACY FUNCTIONS (for backward compatibility) ──────────────
function pgn(cur, total, pages, fn) {
  return pagination(cur, total, 20, fn);
}