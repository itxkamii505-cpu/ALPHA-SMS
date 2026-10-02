/* ═══════════════════════════════════════════════════════════════
   ALPHA SMS — Single Browser Session & Strict Role Guard (Part 2)
   Enforces STRICT single-role policy across the entire browser.
   Only ONE role can be active at any time.
   Synchronized in real-time across all browser tabs via localStorage.
   ═══════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  const ROLE_ROUTES = {
    owner: '/owner',
    admin: '/owner',
    manager: '/ints/manager/SMSDashboard',
    agent: '/ints/agent/SMSDashboard',
    client: '/ints/client/SMSDashboard',
    reseller: '/ints/client/SMSDashboard',
    testpanel: '/testpanel'
  };

  function normalizeRole(r) {
    if (!r) return '';
    const clean = String(r).trim().toLowerCase();
    if (clean === 'admin' || clean === 'owner') return 'owner';
    if (clean === 'manager') return 'manager';
    if (clean === 'agent') return 'agent';
    if (clean === 'client' || clean === 'reseller') return 'client';
    if (clean === 'testpanel') return 'testpanel';
    return clean;
  }

  function getActiveRole() {
    try {
      const explicit = localStorage.getItem('active_session_role');
      if (explicit) return explicit.trim();
      const uStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
      if (uStr) {
        const u = JSON.parse(uStr);
        if (u && u.role) return u.role.trim();
      }
    } catch (e) {}
    return null;
  }

  function getActiveUser() {
    try {
      const uStr = localStorage.getItem('admin_user') || localStorage.getItem('active_session_user') || sessionStorage.getItem('admin_user');
      if (uStr) return JSON.parse(uStr);
    } catch (e) {}
    return null;
  }

  function isLoggedIn() {
    try {
      const flag = localStorage.getItem('admin_logged_in') || sessionStorage.getItem('admin_logged_in');
      const active = localStorage.getItem('active_session_active');
      const hasRole = !!getActiveRole();
      return (flag === '1' || active === '1') && hasRole;
    } catch (e) {
      return false;
    }
  }

  function getRoleRedirect(role) {
    const nr = normalizeRole(role);
    return ROLE_ROUTES[nr] || '/owner';
  }

  // Ensure current tab's sessionStorage matches localStorage
  function syncSession() {
    try {
      if (isLoggedIn()) {
        const user = getActiveUser();
        const role = getActiveRole();
        sessionStorage.setItem('admin_logged_in', '1');
        if (user) {
          sessionStorage.setItem('admin_user', JSON.stringify(user));
        }
        if (normalizeRole(role) === 'testpanel') {
          sessionStorage.setItem('tp_logged_in', '1');
          if (user) sessionStorage.setItem('tp_user', JSON.stringify(user));
        }
      }
    } catch (e) {}
  }

  // Called on login to set this browser's single active session
  function setSession(userObj, token) {
    try {
      const role = (userObj && userObj.role) ? userObj.role : 'Owner';
      const userJson = JSON.stringify(userObj || {});

      localStorage.setItem('admin_logged_in', '1');
      localStorage.setItem('active_session_active', '1');
      localStorage.setItem('active_session_role', role);
      localStorage.setItem('active_session_user', userJson);
      localStorage.setItem('admin_user', userJson);
      localStorage.setItem('active_session_id', Date.now().toString());
      if (token) localStorage.setItem('session_token', token);

      sessionStorage.setItem('admin_logged_in', '1');
      sessionStorage.setItem('admin_user', userJson);
      if (token) sessionStorage.setItem('session_token', token);

      if (normalizeRole(role) === 'testpanel') {
        localStorage.setItem('tp_logged_in', '1');
        localStorage.setItem('tp_user', userJson);
        sessionStorage.setItem('tp_logged_in', '1');
        sessionStorage.setItem('tp_user', userJson);
      }
    } catch (e) {
      console.error('Error saving session:', e);
    }
  }

  // Clear session globally across this browser
  function clearSession() {
    const keys = [
      'admin_logged_in', 'admin_user', 'active_session_active', 'active_session_role',
      'active_session_user', 'active_session_id', 'session_token', 'tp_logged_in', 'tp_user',
      'admin_current_page', 'manager_current_page', 'agent_current_page', 'client_current_page', 'tp_current_page'
    ];
    keys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
      try { sessionStorage.removeItem(k); } catch (e) {}
    });
    try { localStorage.setItem('auth_logout_timestamp', Date.now().toString()); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try { fetch('/api/auth/logout', { method: 'POST' }).catch(function () {}); } catch (e) {}
    window.location.replace('/login');
  }

  // Strict page guard: ensures current page is allowed for the active role in this browser
  function enforce(allowedRoles) {
    syncSession();

    if (!isLoggedIn()) {
      window.location.replace('/login');
      return false;
    }

    const currentRole = normalizeRole(getActiveRole());
    const allowed = (allowedRoles || []).map(normalizeRole);

    if (!allowed.includes(currentRole)) {
      // Role mismatch! Another role is active in this browser.
      // Immediately redirect to the authorized active role's panel!
      const targetUrl = getRoleRedirect(currentRole);
      window.location.replace(targetUrl);
      return false;
    }

    return true;
  }

  // Real-time cross-tab listener: if another tab changes the active role or logs out
  function initCrossTabWatcher(allowedRoles) {
    window.addEventListener('storage', function (e) {
      if (e.key === 'auth_logout_timestamp' || e.key === 'admin_logged_in' || e.key === 'active_session_active') {
        if (!isLoggedIn()) {
          window.location.replace('/login');
          return;
        }
      }
      if (e.key === 'active_session_role' || e.key === 'admin_user' || e.key === 'active_session_id') {
        enforce(allowedRoles);
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        enforce(allowedRoles);
      }
    });

    window.addEventListener('focus', function () {
      enforce(allowedRoles);
    });
  }

  window.SpeedAuth = {
    normalizeRole: normalizeRole,
    getActiveRole: getActiveRole,
    getActiveUser: getActiveUser,
    isLoggedIn: isLoggedIn,
    getRoleRedirect: getRoleRedirect,
    syncSession: syncSession,
    setSession: setSession,
    clearSession: clearSession,
    enforce: enforce,
    initCrossTabWatcher: initCrossTabWatcher
  };

})(window);
