/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Manager panel inner pages
   Same layout as the reference panel: breadcrumb > intro line >
   panel > DataTable toolbar (Search / Show Records / exports) >
   table > "Showing x to y of z entries" + pager.
   Loaded AFTER speed-panel.js
   ═══════════════════════════════════════════════════════════════ */

/* ── breadcrumb with sub levels ─────────────────────────────── */
function zyCrumb(parts) {
  const host = document.querySelector('.zy-crumb');
  if (!host) return;
  host.innerHTML = `<a onclick="loadPage('dashboard')">Home</a>` +
    parts.map((p, i) => `<span class="zy-sep">&raquo;</span>` +
      (i < parts.length - 1
        ? `<a>${p}</a>`
        : `<span id="breadcrumb">${p}</span>`)).join('');
}

/* ── DataTable with full toolbar ────────────────────────────── */
const ZYT2 = {};
function zyDT2(id, cfg) {
  let existingHidden = {};
  if (ZYT2[id] && ZYT2[id].cols && cfg.cols && ZYT2[id].cols.join(',') === cfg.cols.join(',')) {
    existingHidden = ZYT2[id].hiddenCols || {};
  }
  ZYT2[id] = Object.assign({
    cols: [], rows: [], page: 1, perPage: 25, sort: 0, dir: 1,
    search: '', check: false, ids: [], total: null
  }, cfg);
  ZYT2[id].hiddenCols = Object.assign({}, existingHidden, cfg.hiddenCols || {});
  return `<div class="zy-dt2" id="${id}"></div>`;
}
function zyCell2(c) { return (c && typeof c === 'object') ? c : { v: c, h: c }; }
function zy2Data(t) {
  let rows = t.rows;
  if (t.search) {
    const q = t.search.toLowerCase();
    rows = rows.filter(r => r.some(c => String(zyCell2(c).v ?? '').toLowerCase().includes(q)));
  }
  return rows.slice().sort((a, b) => {
    const x = zyCell2(a[t.sort]).v, y = zyCell2(b[t.sort]).v;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * t.dir;
    return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * t.dir;
  });
}
function zySortIc(on, dir) {
  const n = on ? 'ui_sort_asc' : 'ui_sort';
  const flip = on && dir === -1 ? ' style="transform:scaleY(-1)"' : '';
  return `<img class="zy-sort-ic" src="${(window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n]) || ZY_ICON_BASE + n + '.png'}"${flip}>`;
}
function zyImg(n, cls) {
  return `<img class="${cls || ''}" src="${(window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n]) || ZY_ICON_BASE + n + '.png'}">`;
}
function zy2Render(id) {
  const t = ZYT2[id], host = document.getElementById(id);
  if (!t || !host) return;
  t.hiddenCols = t.hiddenCols || {};
  const isColVisible = (i) => !t.hiddenCols[i];
  const visibleColsCount = t.cols.filter((_, i) => isColVisible(i)).length;

  const rows = zy2Data(t);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / t.perPage));
  const page = t.page = Math.min(t.page, pages);
  const from = total ? (page - 1) * t.perPage + 1 : 0;
  const to = Math.min(total, page * t.perPage);
  const slice = rows.slice((page - 1) * t.perPage, page * t.perPage);

  const nums = [];
  const startN = Math.max(1, Math.min(page - 2, pages - 4));
  for (let i = startN; i <= Math.min(pages, startN + 4); i++) nums.push(i);

  const head =
    (t.check ? `<th class="zy-cbcol"><input type="checkbox" onclick="zy2All('${id}',this)">${zyImg('ui_sort_asc','zy-cbsort')}</th>` : '') +
    t.cols.map((c, i) => isColVisible(i) ? `<th class="${i === t.sort ? 'sorted' : ''}" onclick="zy2Sort('${id}',${i})">${c}<span class="zy-sort">${i === t.sort ? (t.dir === 1 ? '▲' : '▼') : '⇅'}</span></th>` : '').join('');

  const body = slice.length ? slice.map((r, ri) => `<tr>` +
      (t.check ? `<td class="zy-cbcol"><input type="checkbox" class="zy-cb-${id}" value="${r.__id ?? ri}"></td>` : '') +
      r.map((c, i) => isColVisible(i) ? `<td class="${i === t.sort ? 'sorted' : ''}">${zyCell2(c).h ?? ''}</td>` : '').join('') +
      `</tr>`).join('')
    : `<tr><td class="zy-empty" colspan="${visibleColsCount + (t.check ? 1 : 0)}">No data available in table</td></tr>`;

  let footHtml = '';
  if (t.footRow) {
    const tdMatches = t.footRow.match(/<td[\s\S]*?<\/td>/gi);
    if (tdMatches && tdMatches.length === t.cols.length) {
      const visibleTds = (t.check ? ['<td></td>'] : []).concat(tdMatches.filter((_, i) => isColVisible(i)));
      footHtml = `<tfoot><tr>${visibleTds.join('')}</tr></tfoot>`;
    } else {
      footHtml = `<tfoot><tr>${t.footRow}</tr></tfoot>`;
    }
  }

  host.innerHTML = `
    <div class="zy-dt2-top">
      <div class="zy-search"><label>Search:</label>
        ${zyImg('ui_search', 'zy-mag')}
        <input value="${t.search.replace(/"/g, '&quot;')}" oninput="zy2Search('${id}',this.value)"></div>
      <div class="zy-show">
        <select onchange="zy2Size('${id}',this.value)">
          ${[10, 25, 50, 100].map(n => `<option ${n === t.perPage ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <div class="zy-show-lbl">Show Records:</div>
      </div>
    </div>
    <div class="zy-exp">
      <button onclick="zy2Export('${id}','copy')">Copy</button>
      <button onclick="zy2Export('${id}','csv')">CSV</button>
      <button onclick="zy2Export('${id}','excel')">Excel</button>
      <button onclick="zy2Export('${id}','pdf')">PDF</button>
      <button onclick="zy2Export('${id}','print')">Print</button>
      <button class="zy-cols" onclick="zy2Cols('${id}')">Show / hide columns</button>
    </div>
    <div class="zy-dt-wrap"><table class="zy-dt zy-dt2-table">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
      ${footHtml}
    </table></div>
    <div class="zy-dt2-foot">
      <div class="zy-info">Showing ${from} to ${to} of ${total} entries</div>
      <div class="zy-pager">
        <button ${page === 1 ? 'disabled' : ''} onclick="zy2Page('${id}',1)">First</button>
        <button ${page === 1 ? 'disabled' : ''} onclick="zy2Page('${id}',${page - 1})">Previous</button>
        ${nums.map(n => `<button class="${n === page ? 'on' : ''}" onclick="zy2Page('${id}',${n})">${n}</button>`).join('')}
        <button ${page === pages ? 'disabled' : ''} onclick="zy2Page('${id}',${page + 1})">Next</button>
        <button ${page === pages ? 'disabled' : ''} onclick="zy2Page('${id}',${pages})">Last</button>
      </div>
    </div>`;
}
function zy2Sort(id, i) { const t = ZYT2[id]; if (t.sort === i) t.dir = -t.dir; else { t.sort = i; t.dir = 1; } t.page = 1; zy2Render(id); }
function zy2Page(id, p) { const t = ZYT2[id]; t.page = Math.max(1, p); zy2Render(id); }
function zy2Size(id, v) { const t = ZYT2[id]; t.perPage = parseInt(v); t.page = 1; zy2Render(id); }
function zy2Search(id, v) { const t = ZYT2[id]; t.search = v; t.page = 1; zy2Render(id); const el = document.querySelector(`#${id} .zy-search input`); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }
function zy2All(id, el) { document.querySelectorAll(`.zy-cb-${id}`).forEach(c => c.checked = el.checked); }
function zy2Checked(id) { return Array.from(document.querySelectorAll(`.zy-cb-${id}`)).filter(c => c.checked).map(c => c.value); }

function zy2Cols(id) {
  const t = ZYT2[id];
  if (!t) return;
  t.hiddenCols = t.hiddenCols || {};

  const items = t.cols.map((c, i) => {
    const isChecked = !t.hiddenCols[i];
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;user-select:none;font-size:14px;color:#1e293b;">
        <input type="checkbox" id="zy2-chk-${id}-${i}" ${isChecked ? 'checked' : ''} onchange="zy2ToggleCol('${id}', ${i}, this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:#0f172a;">
        <span style="font-weight:600;">${c}</span>
      </label>
    `;
  }).join('');

  const body = `
    <div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span style="font-size:13px;color:#64748b;">Select columns to display in table:</span>
      <div style="display:flex;gap:6px;">
        <button type="button" onclick="zy2SetAllCols('${id}', true)" style="padding:4px 10px;font-size:12px;font-weight:600;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;color:#334155;">Show All</button>
        <button type="button" onclick="zy2ResetCols('${id}')" style="padding:4px 10px;font-size:12px;font-weight:600;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;color:#334155;">Reset</button>
      </div>
    </div>
    <div class="zy-colslist" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(170px, 1fr));gap:8px;max-height:360px;overflow-y:auto;padding:2px;">
      ${items}
    </div>
  `;

  zyModal('Show / hide columns', body,
    `<button class="zy-btn-grey" onclick="closeModal()" style="padding:8px 20px;border-radius:4px;font-weight:600;cursor:pointer;background:#0f172a;color:#ffffff;border:none;">Done</button>`);
}

function zy2ToggleCol(id, i, isVisible) {
  const t = ZYT2[id];
  if (!t) return;
  t.hiddenCols = t.hiddenCols || {};
  if (isVisible) {
    delete t.hiddenCols[i];
  } else {
    const visibleCount = t.cols.filter((_, idx) => !t.hiddenCols[idx]).length;
    if (visibleCount <= 1) {
      if (typeof toast === 'function') toast('At least one column must remain visible', 'warning');
      const cb = document.getElementById(`zy2-chk-${id}-${i}`);
      if (cb) cb.checked = true;
      return;
    }
    t.hiddenCols[i] = true;
  }
  zy2Render(id);
}

function zy2SetAllCols(id, visible) {
  const t = ZYT2[id];
  if (!t) return;
  t.hiddenCols = {};
  t.cols.forEach((_, i) => {
    const cb = document.getElementById(`zy2-chk-${id}-${i}`);
    if (cb) cb.checked = true;
  });
  zy2Render(id);
}

function zy2ResetCols(id) {
  zy2SetAllCols(id, true);
}

function zy2Export(id, kind) {
  const t = ZYT2[id], rows = zy2Data(t);
  t.hiddenCols = t.hiddenCols || {};
  const isColVisible = (i) => !t.hiddenCols[i];
  const visibleCols = t.cols.filter((_, i) => isColVisible(i));
  const visibleRows = rows.map(r => r.filter((_, i) => isColVisible(i)));

  const text = [visibleCols.join('\t')].concat(visibleRows.map(r => r.map(c => String(zyCell2(c).v ?? '')).join('\t'))).join('\n');
  if (kind === 'copy') {
    navigator.clipboard && navigator.clipboard.writeText(text);
    if (typeof toast === 'function') toast('Copied ' + visibleRows.length + ' rows', 'success');
    return;
  }
  if (kind === 'csv' || kind === 'excel') {
    const csv = [visibleCols.join(',')].concat(visibleRows.map(r => r.map(c => `"${String(zyCell2(c).v ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = id + (kind === 'excel' ? '.xls' : '.csv'); a.click();
    return;
  }
  const w = window.open('', '_blank');
  w.document.write(`<table border=1 cellspacing=0 cellpadding=6><tr>${visibleCols.map(c => `<th>${c}</th>`).join('')}</tr>` +
    visibleRows.map(r => `<tr>${r.map(c => `<td>${zyCell2(c).v ?? ''}</td>`).join('')}</tr>`).join('') + `</table>`);
  w.document.close(); w.print();
}


/* ── select2-style picker (same behaviour as the source panel) ── */
const ZY_S2 = {};
function zyS2(id, placeholder, items, onPick) {
  ZY_S2[id] = { items: items || [], value: '', onPick: onPick || null, ph: placeholder };
  return `<div class="zy-s2" id="${id}">
    <div class="zy-s2-box" onclick="zyS2Toggle('${id}')"><span>${placeholder}</span>${zyImg('ui_caret')}</div>
    <div class="zy-s2-drop">
      <div class="zy-s2-search"><input placeholder="" oninput="zyS2Filter('${id}',this.value)"></div>
      <div class="zy-s2-list"></div>
    </div></div>`;
}
function zyS2Fill(id, list) {
  const host = document.querySelector(`#${id} .zy-s2-list`); if (!host) return;
  const t = ZY_S2[id];
  host.innerHTML = list.length
    ? list.map(v => `<div class="${v === t.value ? 'on' : ''}" data-v="${zyEsc(v)}" onclick="zyS2Pick('${id}',this.dataset.v)">- ${zyEsc(v)}</div>`).join('')
    : `<div class="zy-s2-none">No results found</div>`;
}
function zyS2Toggle(id) {
  const el = document.getElementById(id); if (!el) return;
  document.querySelectorAll('.zy-s2.open').forEach(o => { if (o !== el) o.classList.remove('open'); });
  el.classList.toggle('open');
  if (el.classList.contains('open')) {
    zyS2Fill(id, ZY_S2[id].items);
    const inp = el.querySelector('.zy-s2-search input'); if (inp) { inp.value = ''; inp.focus(); }
  }
}
function zyS2Filter(id, q) {
  const s = (q || '').toLowerCase();
  zyS2Fill(id, ZY_S2[id].items.filter(v => v.toLowerCase().includes(s)));
}
function zyS2Pick(id, v) {
  const t = ZY_S2[id]; t.value = v;
  const box = document.querySelector(`#${id} .zy-s2-box`);
  box.classList.add('picked'); box.querySelector('span').textContent = v;
  document.getElementById(id).classList.remove('open');
  if (t.onPick) t.onPick(v);
}
function zyS2Value(id) { return (ZY_S2[id] || {}).value || ''; }
document.addEventListener('click', e => {
  if (!e.target.closest('.zy-s2')) document.querySelectorAll('.zy-s2.open').forEach(o => o.classList.remove('open'));
});

/* ── modal in the reference panel's style ───────────────────── */
function zyModal(title, body, footer) {
  const m = document.getElementById('modal');
  m.classList.add('zy-modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML =
    `<div class="zy-modal-body">${body}</div>` + (footer ? `<div class="zy-modal-foot">${footer}</div>` : '');
  const ov = document.getElementById('modal-overlay');
  ov.classList.add('active', 'show');   // 'show' is what style.css actually displays
  ov.style.display = 'flex';
}

/* The panels' own closeModal() only drops the 'show' class, so a modal opened
   by zyModal (which also sets an inline display:flex) stayed on screen after
   Add/Delete — the page looked stuck on the form. Close it properly. */
(function () {
  const prev = window.closeModal;
  window.closeModal = function () {
    if (typeof prev === 'function') { try { prev(); } catch (e) {} }
    const ov = document.getElementById('modal-overlay');
    if (ov) { ov.classList.remove('active', 'show'); ov.style.display = ''; }
    const m = document.getElementById('modal');
    if (m) m.classList.remove('zy-modal');
  };
})();

const zyList = v => Array.isArray(v) ? v : ((v && v.data) || []);
const zyEsc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const zyTick = on => on ? zyImg('ui_tick', 'zy-tick') : '';

/* CLI privacy — every panel EXCEPT admin shows only the first character of
   the CLI and masks the rest ("1Engage" -> "1XXXXX"). The admin panel does
   not load this kit, so it keeps the full CLI. */
const zyMaskCli = v => { const s = String(v ?? ''); return s ? zyEsc(s.slice(0, 1)) + 'XXXXX' : ''; };

/* CDR totals — the footer block sums the payouts per currency (USD/EUR/GBP)
   exactly like the reference panel, instead of the old fixed 0 / 0 / 0. */
const ZY_CCY = ['USD', 'EUR', 'GBP'];
function zyCcy(v) {
  const c = String(v || 'USD').toUpperCase();
  if (c === '$' || c === 'USD') return 'USD';
  if (c === '€' || c === 'EUR') return 'EUR';
  if (c === '£' || c === 'GBP') return 'GBP';
  return 'USD';
}
/* rows: [{currency, value}] -> "0<br>0<br>0" in USD/EUR/GBP order */
function zySumByCcy(items, pick) {
  const t = { USD: 0, EUR: 0, GBP: 0 };
  (items || []).forEach(it => {
    const v = parseFloat(pick(it));
    if (!isNaN(v)) t[zyCcy(it.currency)] += v;
  });
  return ZY_CCY.map(c => zyRound(t[c])).join('<br>');
}
const zyRound = n => (Math.round((n + Number.EPSILON) * 10000) / 10000) || 0;


/* Country list for the Add/Edit modals (same order as the reference panel) */
const ZY_COUNTRY_LIST = ['Afghanistan','Aland Islands','Albania','Algeria','American Samoa','Andorra','Angola',
 'Anguilla','Antarctica','Antigua and Barbuda','Argentina','Armenia','Aruba','Australia','Austria','Azerbaijan',
 'Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bermuda','Bhutan','Bolivia',
 'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
 'Canada','Cape Verde','Cayman Islands','Central African Republic','Chad','Chile','China','Colombia','Comoros',
 'Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic',
 'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Ethiopia','Fiji','Finland','France',
 'Gabon','Gambia','Georgia','Germany','Ghana','Gibraltar','Greece','Greenland','Grenada','Guatemala','Guinea',
 'Guyana','Haiti','Honduras','Hong Kong','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel',
 'Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia',
 'Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Macao','Madagascar','Malawi',
 'Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro',
 'Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
 'North Macedonia','Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru',
 'Philippines','Poland','Portugal','Puerto Rico','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal',
 'Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea',
 'South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan',
 'Tanzania','Thailand','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine',
 'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen',
 'Zambia','Zimbabwe'];

/* ═══ shared filter box (dates + agent + Show Report) ═══════ */
function getLocalDateStr(dateObj = new Date()) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function zyMonthStart() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function zyToday() { return getLocalDateStr(); }

function onCdrDateInputChange(fromId, toId) {
  const f = document.getElementById(fromId);
  const t = document.getElementById(toId);
  if (!f || !t) return;
  if (f.value && t.value && f.value > t.value) {
    t.value = f.value;
  }
}
window.onCdrDateInputChange = onCdrDateInputChange;

function zyFilterBox(id, onShow, extraBtn) {
  const today = getLocalDateStr();
  return `<div class="zy-filterbox">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">From:</label>
      <input type="date" class="zy-fb-input" id="${id}-from" value="${today}" style="cursor:pointer;padding:6px 10px;font-weight:600;">
      <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">To:</label>
      <input type="date" class="zy-fb-input" id="${id}-to" value="${today}" style="cursor:pointer;padding:6px 10px;font-weight:600;">
      <select class="zy-fb-input" id="${id}-agent"><option value="">Filter Agent</option></select>
    </div>
    <div class="zy-fb-btns">${extraBtn || ''}
      <button class="zy-btn-blue" onclick="${onShow}">Show Report</button></div>
  </div>`;
}

// Auto Date Rollover Watcher (handles automatic midnight & day date change without manual intervention)
(function initAutoDateRolloverWatcher() {
  if (window._autoDateWatcherStarted) return;
  window._autoDateWatcherStarted = true;
  let lastDay = getLocalDateStr();

  // Watch every 10 seconds for date changes (midnight rollover or day change)
  setInterval(() => {
    const currentDay = getLocalDateStr();
    if (currentDay !== lastDay) {
      console.log(`[AutoDateWatcher] Date rollover detected: ${lastDay} -> ${currentDay}`);
      const oldDay = lastDay;
      lastDay = currentDay;

      // Update date labels across the top bar / dashboard headers
      const formattedDate = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      document.querySelectorAll('.fa-calendar-day').forEach(icon => {
        if (icon && icon.parentElement) {
          // If this is a date badge/indicator, update the date text
          const p = icon.parentElement;
          if (p.textContent && (p.textContent.includes(oldDay) || p.classList.contains('header-date') || p.id === 'header-date' || p.closest('.page-header') || p.closest('.zy-dash-head'))) {
            p.innerHTML = `<i class="fas fa-calendar-day"></i> ${formattedDate}`;
          }
        }
      });

      // Check all active date from/to inputs on the page
      const pairs = [
        ['rp-from', 'rp-to'],
        ['cdr-from', 'cdr-to'],
        ['c-from', 'c-to'],
        ['tc-from', 'tc-to'],
        ['mcdr-from', 'mcdr-to'],
        ['csms-from', 'csms-to'],
        ['cs-from', 'cs-to'],
        ['my-from', 'my-to'],
        ['ad-rs-from', 'ad-rs-to'],
        ['th-date-from', 'th-date-to']
      ];
      let didUpdate = false;
      for (const [fId, tId] of pairs) {
        const fEl = document.getElementById(fId);
        const tEl = document.getElementById(tId);
        if (fEl && tEl) {
          // If the filter was previously set to today / the old day, roll it forward automatically!
          if (fEl.value.includes(oldDay) && tEl.value.includes(oldDay)) {
            fEl.value = fEl.type === 'date' ? currentDay : `${currentDay} 00:00:00`;
            tEl.value = tEl.type === 'date' ? currentDay : `${currentDay} 23:59:59`;
            didUpdate = true;
          }
        }
      }

      // Also scan any other standalone date inputs on the screen
      document.querySelectorAll('input[type="date"]').forEach(inp => {
        if (inp.value === oldDay) {
          inp.value = currentDay;
          didUpdate = true;
        }
      });

      if (didUpdate) {
        // Updated input date values silently without disturbing report filtering
      }
    }
  }, 10000);
})();
async function zyFillAgents(selectId) {
  const res = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`);
  ZY_AGENTS = (res && res.data) || [];
  const el = document.getElementById(selectId);
  if (el) el.innerHTML = `<option value="">Filter Agent</option>` +
    ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('');
  return ZY_AGENTS;
}
const zyAgentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
const zyDateOnly = s => String(s || '').replace('T', ' ').slice(0, 19);
function zyInRange(id, ts) {
  const f = (document.getElementById(id + '-from') || {}).value || '';
  const t = (document.getElementById(id + '-to') || {}).value || '';
  const v = zyDateOnly(ts);
  if (f && v && v < f) return false;
  if (t && v && v > t) return false;
  return true;
}
function zyAgentFilter(id) { return (document.getElementById(id + '-agent') || {}).value || ''; }

