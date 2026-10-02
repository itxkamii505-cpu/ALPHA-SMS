/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — success flash banner
   Reproduces the reference panel's green bar that appears at the
   top of the page after a record is added:

       Well Done!  Agent Added.                              X

   Usage (from any panel):
       zyFlash('Agent Added.');   // then refresh the list
       loadPage('agents');        //   … or renderAdminAgents();

   The banner is inserted as the first child of #page-content, i.e.
   directly under the breadcrumb, exactly like the source panel.
   Because the list pages render asynchronously (they paint a
   "Loading…" box first and replace it when the API answers), the
   banner keeps re-inserting itself for a few seconds so it is never
   wiped out by the page it belongs to.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const KEY = 'speed_flash_msg';
  let pending = null;

  function makeBox(msg) {
    const d = document.createElement('div');
    d.className = 'zy-flash';
    d.innerHTML = '<b>Well Done!</b> <span></span>' +
                  '<a class="zy-flash-x" href="javascript:;">X</a>';
    d.querySelector('span').textContent = msg;
    d.querySelector('.zy-flash-x').onclick = function () { pending = null; d.remove(); };
    return d;
  }

  function insert() {
    const host = document.getElementById('page-content');
    if (!host || !pending) return;
    const first = host.firstElementChild;
    if (first && first.classList && first.classList.contains('zy-flash')) return;
    host.insertBefore(makeBox(pending), host.firstChild);
  }

  function arm() {
    if (!pending) { try { pending = sessionStorage.getItem(KEY); } catch (e) {} }
    if (!pending) return;
    try { sessionStorage.removeItem(KEY); } catch (e) {}

    const host = document.getElementById('page-content');
    if (!host) { setTimeout(arm, 150); return; }

    let t = null;
    const obs = new MutationObserver(function () {
      clearTimeout(t); t = setTimeout(insert, 60);
    });
    obs.observe(host, { childList: true });
    insert();
    try { window.scrollTo({ top: 0 }); } catch (e) { window.scrollTo(0, 0); }

    setTimeout(function () { obs.disconnect(); insert(); pending = null; }, 4000);
  }

  /* Queue a message and start watching for the page that will show it. */
  window.zyFlash = function (msg) {
    pending = msg;
    try { sessionStorage.setItem(KEY, msg); } catch (e) {}
    arm();
  };

  /* Show a message that was queued before a full page reload. */
  window.zyShowFlash = arm;

  document.addEventListener('DOMContentLoaded', function () {
    let saved = null;
    try { saved = sessionStorage.getItem(KEY); } catch (e) {}
    if (saved) setTimeout(arm, 300);
  });
})();

/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — searchable <select> helper
   Drops a live-filter search box directly above any long <select>
   list (agents / managers / clients) so a specific one can be typed
   and found instead of scrolled through.

   Usage — put this one line immediately above the <select ...> tag
   in the template string, keeping the same id:

       ${zySelectSearch('assign-client', 'Search clients…')}
       <select id="assign-client">...</select>

   Nothing else is needed — the box wires itself to the select via
   its oninput handler, hiding/showing <option> elements as the user
   types. Options with an empty value (the "— Select … —" placeholder)
   always stay visible.
   ═══════════════════════════════════════════════════════════════ */
window.zySelectSearch = function (selectId, placeholder) {
  placeholder = placeholder || 'Search…';
  return '<input type="text" class="zy-select-search" placeholder="🔎 ' + placeholder + '" ' +
         'oninput="zyFilterSelectOptions(\'' + selectId + '\', this.value)" ' +
         'autocomplete="off" ' +
         'style="width:100%;box-sizing:border-box;margin-bottom:6px;padding:7px 10px;' +
         'border:1px solid var(--border, #ddd);border-radius:6px;font-size:13px;">';
};

window.zyFilterSelectOptions = function (selectId, query) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const q = (query || '').toLowerCase().trim();
  Array.from(sel.options).forEach(function (opt) {
    if (!opt.value) return; // keep the "— Select … —" placeholder option visible always
    const match = !q || opt.textContent.toLowerCase().indexOf(q) !== -1;
    opt.hidden = !match;
  });
  // If the currently selected option just got filtered out, clear the
  // selection so a hidden/invisible choice can't silently stay picked.
  if (sel.selectedOptions[0] && sel.selectedOptions[0].hidden) sel.value = '';
};
