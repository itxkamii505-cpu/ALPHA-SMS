/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — URL sync
   Keeps the address bar in the reference panel's shape:
     /ints/login
     /ints/manager/SMSDashboard   /ints/manager/SMSNumbers   …
     /ints/agent/SMSDashboard     /ints/agent/MySMSNumbers   …
   Load this LAST (after the page scripts).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const MAPS = {
    manager: {
      'dashboard': 'SMSDashboard', 'sms-overview': 'SMSRanges', 'my-numbers': 'SMSNumbers',
      'payout-rates-view': 'SMSRateCard', 'assign-numbers': 'SMSBulkAllocations',
      'agents': 'Agents', 'add-agent': 'AddAgent', 'clients': 'Clients', 'add-client': 'AddClient',
      'reports': 'SMSReports', 'my-earnings': 'AgentCreditNotes', 'payout-requests': 'PaymentRequests',
      'usd-statements': 'USDStatements', 'eur-statements': 'EURStatements', 'gbp-statements': 'GBPStatements',
      'sms-test-panel': 'SMSTestPanel', 'news': 'NewsForClients', 'profile': 'Profile',
      'agent-performance': 'AgentPerformance', 'client-balances': 'ClientBalances',
      'client-limits': 'Limits', 'traffic': 'LiveTraffic', 'api-tokens': 'ApiTokens'
    },
    client: {
      'dashboard': 'SMSDashboard', 'my-numbers': 'MySMSNumbers', 'my-sms': 'SMSCDRStats',
      'sms-test-panel': 'SMSTestPanel', 'my-profile': 'Profile', 'news': 'Notifications',
      'my-balance': 'MyBalance', 'my-earnings': 'MyEarnings'
    },
    agent: {
      'dashboard': 'SMSDashboard', 'sms-ranges': 'SMSRanges', 'my-sms-numbers': 'MySMSNumbers',
      'sms-ratecard': 'SMSRateCard', 'access-search': 'AccessSearch', 'news-clients': 'NewsMaster',
      'my-clients': 'Clients', 'detailed-sms': 'DetailedSMSReports', 'summary-sms': 'SummarySMSReports',
      'client-sms-stats': 'ClientSMSStats', 'sms-range-stats': 'SMSRangeStats',
      'sms-number-stats': 'SMSNumberStats', 'credit-notes': 'MyCreditNotes',
      'payment-requests': 'PaymentRequests', 'bank-accounts': 'BankAccounts',
      'usd-statements': 'USDStatements', 'eur-statements': 'EURStatements', 'gbp-statements': 'GBPStatements',
      'voice-test-panel': 'VoiceTestPanel', 'sms-test-panel': 'SMSTestPanel', 'profile': 'Profile'
    },
    test: {
      'dashboard': 'Dashboard', 'test-numbers': 'SMSTestNumbers', 'test-reports': 'TestSMSCDRStats'
    }
  };

  const parts = location.pathname.split('/').filter(Boolean);      // ["ints","manager","SMSNumbers"]
  let role = parts[0] === 'ints' ? parts[1] : null;
  if (!role) role = /client/.test(location.pathname) ? 'client'
                  : /agent/.test(location.pathname) ? 'agent' : 'manager';
  const map = MAPS[role];
  if (!map) return;

  const reverse = {};
  Object.keys(map).forEach(k => { reverse[map[k].toLowerCase()] = k; });

  function urlFor(page) { return `/ints/${role}/${map[page] || 'SMSDashboard'}`; }

  /* keep the address bar in step with the page being shown */
  const prev = window.loadPage;
  /* Which page does the address bar ask for? */
  function pageFromUrl() {
    const seg = (location.pathname.split('/').filter(Boolean)[2] || '').toLowerCase();
    return reverse[seg];
  }
  let first = true;
  if (typeof prev === 'function') {
    window.loadPage = function (page) {
      /* The panel boots with loadPage('dashboard'). If the URL names another
         page (deep link / refresh / back button), open that one instead —
         otherwise the boot call would wipe out the requested page. */
      if (first) {
        first = false;
        const want = pageFromUrl();
        if (want && want !== page) page = want;
      }
      prev(page);
      if (map[page]) {
        try { history.pushState({ page }, '', urlFor(page)); } catch (e) {}
      }
    };
  }

  /* back / forward buttons */
  window.addEventListener('popstate', e => {
    const seg = (location.pathname.split('/').filter(Boolean)[2] || 'SMSDashboard').toLowerCase();
    const page = (e.state && e.state.page) || reverse[seg];
    if (page && typeof prev === 'function') prev(page);
  });

  /* open the page named in the address bar on first load */
  window.addEventListener('load', () => {
    setTimeout(() => {
      const page = pageFromUrl();
      if (first && page && typeof window.loadPage === 'function') window.loadPage(page);
      else if (!page && typeof history.replaceState === 'function') {
        history.replaceState({ page: 'dashboard' }, '', urlFor('dashboard'));
      }
    }, 600);
  });
})();
