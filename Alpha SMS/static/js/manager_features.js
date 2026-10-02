/* ═══════════════════════════════════════════
   Manager Panel — Extra Features (Production Ready v2.0)
   Number Transfer, Payout Rates, Download, History
   ═══════════════════════════════════════════ */

// ── Extra page registrations ──────────────────────────────────────
const _origLoad = loadPage;
const _mgrExtraPages = {
  'transfer-history': pgTransferHistory,
  'payout-rates-view': pgPayoutRatesView,
};

loadPage = function(page) {
  if (_mgrExtraPages[page]) {
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    const navEl = document.getElementById(`nav-${page}`);
    if (navEl) navEl.classList.add('active');
    document.getElementById('breadcrumb').textContent = navEl ? navEl.querySelector('span').textContent : page;
    document.getElementById('page-content').innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    _mgrExtraPages[page]();
  } else {
    _origLoad(page);
  }
};

function downloadMgrNumbers(status = '') {
  try {
    const url = `/api/numbers/download?manager_id=${MANAGER_ID}${status ? '&status=' + status : ''}`;
    window.open(url, '_blank');
    toast('Downloading numbers CSV...', 'info');
  } catch (err) {
    console.error('Download error:', err);
    toast('Failed to download', 'error');
  }
}

// ── TRANSFER HISTORY (Manager view) ───────────────────────────────
let transferHistoryPage = 1;
let transferHistoryPerPage = 20;

async function pgTransferHistory(page = 1) {
  try {
    transferHistoryPage = page;

    // ── Get filter values ──
    const directionFilter = document.getElementById('th-direction')?.value || '';
    const searchFilter = document.getElementById('th-search')?.value || '';
    const dateFrom = document.getElementById('th-date-from')?.value || '';
    const dateTo = document.getElementById('th-date-to')?.value || '';

    // ── Fetch transfers ──
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', transferHistoryPerPage);
    params.append('user_id', MANAGER_ID);
    if (directionFilter === 'sent') params.append('direction', 'sent');
    else if (directionFilter === 'received') params.append('direction', 'received');
    if (searchFilter) params.append('search', searchFilter);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);

    const data = await apiFetch(`/api/number-transfers?${params.toString()}`);

    const transfers = data?.data || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / transferHistoryPerPage) || 1;

    // ── Stats ──
    const sentCount = transfers.filter(t => t.from_user_id === MANAGER_ID).length;
    const receivedCount = transfers.filter(t => t.to_user_id === MANAGER_ID).length;
    const totalCount = transfers.reduce((s, t) => s + (t.count || 0), 0);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Transfer History</div>
          <div class="page-subtitle">All number transfers involving your account</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="exportTransferHistory()">
            <i class="fas fa-download"></i> Export CSV
          </button>
          <button class="btn btn-outline btn-sm" onclick="downloadMgrNumbers()">
            <i class="fas fa-file-csv"></i> Download Numbers
          </button>
          <button class="btn btn-outline btn-sm" onclick="pgTransferHistory(1)">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
        ${statCard('Total Transfers', 'fas fa-arrow-right-arrow-left', transfers.length, 'blue', 'This page')}
        ${statCard('Sent', 'fas fa-arrow-up', sentCount, 'red', 'You sent')}
        ${statCard('Received', 'fas fa-arrow-down', receivedCount, 'green', 'You received')}
        ${statCard('Total Numbers', 'fas fa-mobile-screen', totalCount, 'purple', 'Transferred')}
      </div>

      <!-- Filters -->
      <div class="card" style="margin-bottom:20px;">
        <div class="filters-bar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <select id="th-direction" onchange="pgTransferHistory(1)" style="min-width:120px;">
            <option value="">All Directions</option>
            <option value="sent" ${directionFilter === 'sent' ? 'selected' : ''}>Sent</option>
            <option value="received" ${directionFilter === 'received' ? 'selected' : ''}>Received</option>
          </select>
          <input id="th-search" placeholder="Search user, service..." value="${searchFilter}" style="min-width:180px;">
          <input type="date" id="th-date-from" value="${dateFrom}" style="min-width:140px;">
          <input type="date" id="th-date-to" value="${dateTo}" style="min-width:140px;">
          <button class="btn btn-primary btn-sm" onclick="pgTransferHistory(1)"><i class="fas fa-filter"></i> Filter</button>
          <button class="btn btn-outline btn-sm" onclick="resetTransferFilters()"><i class="fas fa-undo"></i> Reset</button>
        </div>
      </div>

      <div class="card">
        ${buildTable(
          ['#', 'Direction', 'From', 'To', 'Count', 'Service', 'Notes', 'Time', 'Status', 'Actions'],
          transfers.map(t => [
            t.id || '—',
            t.from_user_id === MANAGER_ID
              ? `<span class="badge badge-red">Sent</span>`
              : `<span class="badge badge-green">Received</span>`,
            `<strong>${t.from_username || '—'}</strong> <span class="badge badge-${t.from_role === 'Admin' ? 'red' : 'purple'}">${t.from_role || '—'}</span>`,
            `<strong>${t.to_username || '—'}</strong> <span class="badge badge-${t.to_role === 'Agent' ? 'cyan' : 'green'}">${t.to_role || '—'}</span>`,
            `<span class="badge badge-blue">${t.count || 0}</span>`,
            t.service || '—',
            t.notes || '—',
            fmtShort(t.timestamp),
            statusBadge(t.status),
            `<button class="btn btn-outline btn-sm" onclick="viewTransferDetail(${t.id})" title="View Details">
              <i class="fas fa-eye"></i>
            </button>`
          ])
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <span style="font-size:13px;color:var(--text-muted);">
            Showing ${Math.min((page - 1) * transferHistoryPerPage + 1, total)} to ${Math.min(page * transferHistoryPerPage, total)} of ${total} entries
          </span>
          ${paginationWithNumbers(page, totalPages, pgTransferHistory)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Transfer history error:', err);
    toast('Failed to load transfer history', 'error');
    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load transfer history. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgTransferHistory(1)">Retry</button>
      </div>
    `;
  }
}

function resetTransferFilters() {
  const direction = document.getElementById('th-direction');
  const search = document.getElementById('th-search');
  const dateFrom = document.getElementById('th-date-from');
  const dateTo = document.getElementById('th-date-to');

  if (direction) direction.value = '';
  if (search) search.value = '';
  if (dateFrom) dateFrom.value = '';
  if (dateTo) dateTo.value = '';

  pgTransferHistory(1);
  toast('Filters reset', 'info');
}

async function exportTransferHistory() {
  try {
    toast('Exporting transfer history...', 'info');
    window.open(`/api/number-transfers/export?user_id=${MANAGER_ID}`, '_blank');
  } catch (err) {
    console.error('Export error:', err);
    toast('Failed to export', 'error');
  }
}

// ── VIEW TRANSFER DETAIL ──────────────────────────────────────────
async function viewTransferDetail(transferId) {
  try {
    const data = await apiFetch(`/api/number-transfers/${transferId}`);
    if (!data) {
      toast('Transfer not found', 'error');
      return;
    }

    const t = data;
    openModal(`Transfer Details #${t.id}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
        ${[
          ['ID', t.id || '—'],
          ['Direction', t.from_user_id === MANAGER_ID ? '<span class="badge badge-red">Sent</span>' : '<span class="badge badge-green">Received</span>'],
          ['From', `${t.from_username || '—'} (${t.from_role || '—'})`],
          ['To', `${t.to_username || '—'} (${t.to_role || '—'})`],
          ['Count', t.count || 0],
          ['Service', t.service || '—'],
          ['Notes', t.notes || '—'],
          ['Status', statusBadge(t.status)],
          ['Timestamp', fmtDate(t.timestamp)]
        ].map(([k, v]) => `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div class="text-muted fs-12">${k}</div>
            <div class="fw-600">${v}</div>
          </div>
        `).join('')}
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        ${t.status === 'pending' && t.from_user_id === MANAGER_ID ? `
          <button class="btn btn-danger btn-sm" onclick="cancelTransfer(${t.id})">
            <i class="fas fa-times"></i> Cancel Transfer
          </button>
        ` : ''}
      </div>
    `);
  } catch (err) {
    console.error('View transfer detail error:', err);
    toast('Failed to load transfer details', 'error');
  }
}

async function cancelTransfer(transferId) {
  if (!confirm('Are you sure you want to cancel this transfer?')) return;

  try {
    const result = await apiFetch(`/api/number-transfers/${transferId}/cancel`, {
      method: 'POST'
    });

    if (result && result.success) {
      toast('Transfer cancelled successfully', 'warning');
      closeModal();
      pgTransferHistory(transferHistoryPage);
    } else {
      toast(result?.error || 'Failed to cancel transfer', 'error');
    }
  } catch (err) {
    console.error('Cancel transfer error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

// ── PAYOUT RATES VIEW (Manager) ────────────────────────────────────
async function pgPayoutRatesView() {
  try {
    const [rates, services] = await Promise.all([
      apiFetch('/api/payout-rates'),
      apiFetch('/api/services')
    ]);

    const svcRates = rates?.service_rates || {};
    const adminRate = rates?.admin_to_manager?.default_rate || 0.05;
    const agentRate = rates?.manager_to_agent?.default_rate || 0.03;
    const margin = (adminRate - agentRate).toFixed(3);

    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">My Payout Rates</div>
          <div class="page-subtitle">OTP payout rates you receive from Admin</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="pgPayoutRatesView()">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat-card">
          <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
          <div>
            <div class="stat-label">Default Rate (Admin→Me)</div>
            <div class="stat-value">$${adminRate}</div>
            <div class="stat-change up">Per OTP delivered</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple"><i class="fas fa-percent"></i></div>
          <div>
            <div class="stat-label">I Pay Agents</div>
            <div class="stat-value">$${agentRate}</div>
            <div class="stat-change up">Default per OTP</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow"><i class="fas fa-coins"></i></div>
          <div>
            <div class="stat-label">My Margin</div>
            <div class="stat-value">$${margin}</div>
            <div class="stat-change up">Per OTP profit</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Per-Service Rates</div></div>
        ${buildTable(
          ['Service', 'Admin→Me ($/OTP)', 'I→Agent ($/OTP)', 'My Margin'],
          (services || []).map(s => {
            const sr = svcRates[s.name] || {};
            const adm = sr.admin_to_manager ?? s.payout_rate;
            const agt = sr.manager_to_agent ?? (s.payout_rate * 0.6);
            const marg = (adm - agt).toFixed(3);
            return [
              `<div style="display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:6px;background:${s.color || '#334155'}22;color:${s.color || '#334155'};display:flex;align-items:center;justify-content:center;">
                  <i class="${s.icon || 'fas fa-mobile-screen'}" style="font-size:12px;"></i>
                </div>
                <strong>${s.name}</strong>
              </div>`,
              `<span class="text-success fw-600">$${adm.toFixed(4)}</span>`,
              `<span class="text-warning">$${agt.toFixed(4)}</span>`,
              `<span class="badge badge-green">$${marg}</span>`
            ];
          })
        )}
      </div>
    `;
  } catch (err) {
    console.error('Payout rates error:', err);
    toast('Failed to load payout rates', 'error');
    const c = document.getElementById('page-content');
    c.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load payout rates. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgPayoutRatesView()">Retry</button>
      </div>
    `;
  }
}

// ─── LEGACY FUNCTIONS (for backward compatibility) ──────────────
function pgn(cur, total, pages, fn) {
  return paginationWithNumbers(cur, pages, fn);
}