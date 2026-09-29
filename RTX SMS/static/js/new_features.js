// ═══════════════════════════════════════════════════════════════
//  NEW FEATURES — Services, CLI, Payout Rates, Number Transfer (Production Ready)
// ═══════════════════════════════════════════════════════════════

// ─── SERVICES MANAGER ────────────────────────────────────────────

async function searchServices() {
  const q = document.getElementById('svc-search')?.value || '';
  const status = document.getElementById('svc-status-filter')?.value || '';

  try {
    const data = await apiFetch(`/api/services?search=${encodeURIComponent(q)}&status=${status}`);
    const container = document.querySelector('.card > div:last-child');
    if (container) {
      container.innerHTML = (data || []).map(s => `
        <div class="stat-card" style="border-left:4px solid ${s.color || '#334155'};position:relative;">
          <div class="stat-icon" style="background:${s.color || '#334155'}22;color:${s.color || '#334155'}">
            <i class="${s.icon || 'fas fa-mobile-screen'}"></i>
          </div>
          <div style="flex:1;">
            <div class="stat-label">${s.name || '—'}</div>
            <div class="stat-value" style="font-size:16px;">$${s.payout_rate || 0} <span style="font-size:11px;color:var(--text-muted)">per OTP</span></div>
            <div class="stat-change up">${s.description || ''}</div>
          </div>
          <div style="position:absolute;top:12px;right:12px;display:flex;gap:6px;">
            <span class="badge badge-${s.active ? 'green' : 'red'}">${s.active ? 'Active' : 'Inactive'}</span>
            <button class="btn-icon" onclick="openEditServiceModal(${s.id})"><i class="fas fa-pen"></i></button>
            <button class="btn-icon text-danger" onclick="deleteService(${s.id})"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('') || `<div class="empty-state" style="grid-column:1/-1;padding:40px;">
        <i class="fas fa-search" style="font-size:40px;color:var(--text-muted);"></i>
        <p style="margin-top:12px;">No services found matching "${q}"</p>
      </div>`;
      toast(`Found ${data?.length || 0} results`, 'info');
    }
  } catch (err) {
    console.error('Search services error:', err);
    toast('Search failed', 'error');
  }
}

function filterServices() {
  searchServices();
}

function resetServiceFilters() {
  const searchInput = document.getElementById('svc-search');
  const statusSelect = document.getElementById('svc-status-filter');
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = '';
  renderServicesManager();
  toast('Filters reset', 'info');
}

function exportServices() {
  toast('Exporting services...', 'info');
  window.open('/api/services/export', '_blank');
}



async function openEditServiceModal(id) {
  try {
    const data = await apiFetch('/api/services');
    const s = (data || []).find(x => x.id === id);
    if (!s) {
      toast('Service not found', 'error');
      return;
    }

    openModal(`Edit Service — ${s.name}`, `
      <form id="edit-service-form" onsubmit="saveService(event, ${id})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Service Name <span class="text-danger">*</span></label>
            <input id="esvc-name" value="${s.name}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Icon Class</label>
            <input id="esvc-icon" value="${s.icon || 'fas fa-mobile-screen'}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Color</label>
            <input id="esvc-color" type="color" value="${s.color || '#334155'}">
          </div>
          <div class="form-group">
            <label class="form-label">Payout Rate ($/OTP) <span class="text-danger">*</span></label>
            <input type="number" id="esvc-rate" value="${s.payout_rate || 0}" step="0.001" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input id="esvc-desc" value="${s.description || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="esvc-active">
            <option value="true" ${s.active ? 'selected' : ''}>Active</option>
            <option value="false" ${!s.active ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="esvc-submit-btn">
            <i class="fas fa-save"></i> Save
          </button>
        </div>
      </form>
    `);
  } catch (err) {
    console.error('Edit service error:', err);
    toast('Failed to load service details', 'error');
  }
}

async function saveService(event, id) {
  event.preventDefault();

  try {
    const name = document.getElementById('esvc-name').value.trim();
    const rate = parseFloat(document.getElementById('esvc-rate').value);

    if (!name) {
      toast('Service name is required', 'error');
      return;
    }
    if (!rate || rate <= 0) {
      toast('Please enter a valid payout rate', 'error');
      return;
    }

    const btn = document.getElementById('esvc-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Saving...';
    }

    const payload = {
      name,
      icon: document.getElementById('esvc-icon').value || 'fas fa-mobile-screen',
      color: document.getElementById('esvc-color').value || '#334155',
      payout_rate: rate,
      description: document.getElementById('esvc-desc').value || '',
      active: document.getElementById('esvc-active').value === 'true'
    };

    const result = await apiFetch(`/api/services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (result && result.id) {
      closeModal();
      toast(`Service "${name}" updated successfully`, 'success');
      renderServicesManager();
    } else {
      toast(result?.error || 'Failed to update service', 'error');
    }
  } catch (err) {
    console.error('Save service error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('esvc-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
  }
}

async function deleteService(id) {
  if (!confirm('Delete this service? This will also affect all associated CLI routes.')) return;

  try {
    const result = await apiFetch(`/api/services/${id}`, {
      method: 'DELETE'
    });

    if (result && result.success) {
      toast('Service deleted', 'warning');
      renderServicesManager();
    } else {
      toast('Failed to delete service', 'error');
    }
  } catch (err) {
    console.error('Delete service error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

// ─── CLI MANAGER ──────────────────────────────────────────────────

async function searchCli() {
  const q = document.getElementById('cli-search')?.value || '';
  const status = document.getElementById('cli-status-filter')?.value || '';
  const service = document.getElementById('cli-service-filter')?.value || '';

  try {
    const params = new URLSearchParams();
    if (q) params.append('search', q);
    if (status) params.append('status', status);
    if (service) params.append('service', service);

    const data = await apiFetch(`/api/cli-routes?${params.toString()}`) || [];
    const wrap = document.querySelector('.table-wrap');
    if (wrap) {
      wrap.outerHTML = buildTable(
        ['#', 'CLI Number', 'Service', 'Provider', 'Country', 'Description', 'Status', 'Actions'],
        data.map(cl => [
          cl.id || '—',
          `<span class="monospace fw-600">${cl.cli || '—'}</span>`,
          `<span style="font-weight:600">${cl.service || '—'}</span>`,
          cl.provider || '—',
          cl.country || '—',
          cl.description || '—',
          statusBadge(cl.status),
          `<button class="btn btn-outline btn-sm" onclick="openEditCliModal(${cl.id})"><i class="fas fa-pen"></i></button>
           <button class="btn btn-${cl.status === 'active' ? 'warning' : 'success'} btn-sm" onclick="toggleCli(${cl.id},'${cl.status}')">
             <i class="fas fa-${cl.status === 'active' ? 'pause' : 'play'}"></i>
           </button>
           <button class="btn btn-danger btn-sm" onclick="deleteCli(${cl.id})"><i class="fas fa-trash"></i></button>`
        ])
      );
      toast(`Found ${data.length} results`, 'info');
    }
  } catch (err) {
    console.error('Search CLI error:', err);
    toast('Search failed', 'error');
  }
}

function filterCli() {
  searchCli();
}

function resetCliFilters() {
  const searchInput = document.getElementById('cli-search');
  const statusSelect = document.getElementById('cli-status-filter');
  const serviceSelect = document.getElementById('cli-service-filter');
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = '';
  if (serviceSelect) serviceSelect.value = '';
  renderCliManager();
  toast('Filters reset', 'info');
}

function exportCli() {
  toast('Exporting CLI routes...', 'info');
  window.open('/api/cli-routes/export', '_blank');
}




async function saveCli(event, id) {
  event.preventDefault();

  try {
    const cli = document.getElementById('ecli-num').value.trim();
    const service = document.getElementById('ecli-svc').value;

    if (!cli) {
      toast('CLI number is required', 'error');
      return;
    }
    if (!service) {
      toast('Please select a service', 'error');
      return;
    }

    const btn = document.getElementById('ecli-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Saving...';
    }

    const payload = {
      cli,
      service,
      provider: document.getElementById('ecli-prov').value || 'Manual',
      country: document.getElementById('ecli-country').value || 'US',
      description: document.getElementById('ecli-desc').value || ''
    };

    const result = await apiFetch(`/api/cli-routes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (result && result.id) {
      closeModal();
      toast('CLI updated successfully', 'success');
      renderCliManager();
    } else {
      toast(result?.error || 'Failed to update CLI', 'error');
    }
  } catch (err) {
    console.error('Save CLI error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('ecli-submit-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
  }
}

async function toggleCli(id, status) {
  try {
    const newS = status === 'active' ? 'inactive' : 'active';
    const result = await apiFetch(`/api/cli-routes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newS })
    });

    if (result && result.id) {
      toast(`CLI ${newS}`, 'info');
      renderCliManager();
    } else {
      toast('Failed to toggle CLI', 'error');
    }
  } catch (err) {
    console.error('Toggle CLI error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

async function deleteCli(id) {
  if (!confirm('Delete this CLI route?')) return;

  try {
    const result = await apiFetch(`/api/cli-routes/${id}`, {
      method: 'DELETE'
    });

    if (result && result.success) {
      toast('CLI deleted', 'warning');
      renderCliManager();
    } else {
      toast('Failed to delete CLI', 'error');
    }
  } catch (err) {
    console.error('Delete CLI error:', err);
    toast('Error: ' + err.message, 'error');
  }
}

// ─── OTP PAYOUT RATES ─────────────────────────────────────────────


// ─── TRANSFER NUMBERS (Admin Panel) ──────────────────────────────

function toggleTransferMethod() {
  const method = document.getElementById('tr-method').value;
  document.getElementById('tr-count-section').style.display = method === 'count' ? '' : 'none';
  document.getElementById('tr-range-section').style.display = method === 'range' ? '' : 'none';
}

async function loadAgentsForManager() {
  const mgrid = document.getElementById('tr2-manager').value;
  if (!mgrid) return;

  try {
    const data = await apiFetch(`/api/agents?manager_id=${mgrid}&limit=100`);
    const sel = document.getElementById('tr2-agent');
    sel.innerHTML = `<option value="">— Select Agent —</option>` +
      (data?.data || []).map(a => `<option value="${a.id}">${a.username}</option>`).join('');
  } catch (err) {
    console.error('Load agents error:', err);
    toast('Failed to load agents', 'error');
  }
}



// ─── NUMBER TRANSFER HISTORY ──────────────────────────────────────

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
      </div>
    `);
  } catch (err) {
    console.error('View transfer detail error:', err);
    toast('Failed to load transfer details', 'error');
  }
}

function exportTransferLog() {
  try {
    toast('Exporting transfer history...', 'info');
    window.open('/api/number-transfers/export', '_blank');
  } catch (err) {
    console.error('Export error:', err);
    toast('Failed to export', 'error');
  }
}

function downloadTransferLog() {
  exportTransferLog();
}

// ─── NUMBERS: Download helper ─────────────────────────────────────
function downloadNumbersCSV(params = '') {
  try {
    const url = `/api/numbers/download${params ? '?' + params : ''}`;
    window.open(url, '_blank');
    toast('Downloading numbers CSV...', 'info');
  } catch (err) {
    console.error('Download error:', err);
    toast('Failed to download', 'error');
  }
}

// ─── LEGACY FUNCTIONS ────────────────────────────────────────────
function pgn(cur, total, pages, fn) {
  return pagination(cur, total, 20, fn);
}