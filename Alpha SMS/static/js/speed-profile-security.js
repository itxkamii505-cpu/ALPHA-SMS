/* ═══════════════════════════════════════════════════════════════════
   ALPHA SMS — Advanced Profile, Email Binding & 2FA Security Engine
   Matches the reference video:
   1. Personal Details (Full name, Email Binding with OTP, Phone, Teams)
   2. Account Login info
   3. Change Password
   4. Authentic Google Authenticator 2FA (QR Code + Secret + Enable/Disable)
   ═══════════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  async function loadUserProfile() {
    try {
      const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
      const res = await fetch('/api/user/profile', {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.user) {
          return data.user;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch profile from server:', e);
    }
    return JSON.parse(sessionStorage.getItem('admin_user') || localStorage.getItem('admin_user') || '{}');
  }

  async function renderProfileView(containerId = 'page-content') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; min-height: 280px;">
        <div class="spinner"></div>
      </div>
    `;

    const user = await loadUserProfile();
    const is2fa = !!user.two_fa;
    const isEmailBound = !!user.email_bound;

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: 20px;">
        <div class="page-title" style="font-size: 20px; font-weight: 700; color: #0f172a;">My Profile</div>
      </div>

      <div style="max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- CARD 1: PERSONAL DETAILS -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">PERSONAL DETAILS</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 3px;">Visible to admins for support / payout reconciliation</div>
          </div>

          <form id="pro-personal-form" onsubmit="window.SpeedProfile.savePersonal(event)">
            <div style="margin-bottom: 16px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Full name</label>
              <input type="text" id="pro-fullname" value="${escapeHtml(user.full_name || '')}" placeholder="Your Full Name"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
            </div>

            <!-- Email Binding Section -->
            <div style="margin-bottom: 16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="font-size:13px; font-weight:600; color:#334155; margin:0;">Email</label>
                <span id="email-bound-badge" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:9999px; ${isEmailBound ? 'background:#ecfdf5; color:#059669;' : 'background:#fff7ed; color:#ea580c;'}">
                  ${isEmailBound ? '<i class="fas fa-check-circle"></i> Bound & Verified' : '<i class="fas fa-exclamation-circle"></i> Unbound'}
                </span>
              </div>
              <div style="display:flex; gap:8px;">
                <input type="email" id="pro-email" value="${escapeHtml(user.email || '')}" placeholder="name@domain.com"
                  style="flex:1; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
                <button type="button" class="btn btn-outline" onclick="window.SpeedProfile.openEmailBindOtp()"
                  style="height:40px; padding:0 16px; font-size:13px; font-weight:600; white-space:nowrap; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">
                  <i class="fas fa-link"></i> ${isEmailBound ? 'Change / Re-bind' : 'Bind Email'}
                </button>
              </div>
              <div style="font-size:11.5px; color:#64748b; margin-top:4px;">
                ${isEmailBound ? 'Managed by the panel. Verified for password recovery and account security.' : 'Bind your email to enable account recovery and 2-step verification backup.'}
              </div>

              <!-- Inline OTP Box for Email Binding -->
              <div id="email-otp-box" style="display:none; margin-top:12px; padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <div style="font-size:12.5px; font-weight:600; color:#0f172a; margin-bottom:6px;">Enter 6-digit code sent to your email:</div>
                <div style="display:flex; gap:8px; max-width:320px;">
                  <input type="text" id="email-otp-input" placeholder="6-digit code" maxlength="6"
                    style="flex:1; height:36px; border:1px solid #94a3b8; border-radius:6px; padding:0 10px; font-size:14px; font-weight:700; letter-spacing:2px; text-align:center;">
                  <button type="button" onclick="window.SpeedProfile.verifyEmailBind()" class="btn btn-primary"
                    style="height:36px; padding:0 14px; font-size:13px; font-weight:600; border-radius:6px; background:#0284c7; color:#fff; border:none; cursor:pointer;">
                    Verify & Bind
                  </button>
                </div>
                <div id="email-otp-msg" style="font-size:11.5px; margin-top:4px;"></div>
              </div>
            </div>

            <!-- Contact Number -->
            <div style="margin-bottom: 16px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Contact (phone / WhatsApp)</label>
              <input type="text" id="pro-phone" value="${escapeHtml(user.phone || '')}" placeholder="+92 300 1234567"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
              <div style="font-size:11.5px; color:#64748b; margin-top:4px;">Managed by the panel. Ask an admin to change it if needed.</div>
            </div>

            <!-- Teams / Telegram -->
            <div style="margin-bottom: 18px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Teams / Telegram</label>
              <input type="text" id="pro-teams" value="${escapeHtml(user.teams || '')}" placeholder="username or handle"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
            </div>

            <button type="submit" class="btn btn-primary"
              style="height:40px; padding:0 22px; font-size:13.5px; font-weight:600; border-radius:8px; background:#0284c7; color:#fff; border:none; cursor:pointer; box-shadow:0 2px 4px rgba(2,132,199,0.25);">
              Save changes
            </button>
          </form>
        </div>

        <!-- CARD 2: ACCOUNT LOGIN -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">ACCOUNT LOGIN</div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Username</label>
              <input type="text" value="${escapeHtml(user.username || '')}" readonly
                style="width:100%; height:40px; border:1px solid #e2e8f0; border-radius:8px; padding:0 12px; font-size:14px; color:#475569; background:#f8fafc; cursor:not-allowed;">
              <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Username can only be changed by an admin</div>
            </div>
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Role</label>
              <input type="text" value="${escapeHtml(user.role || 'User')}" readonly
                style="width:100%; height:40px; border:1px solid #e2e8f0; border-radius:8px; padding:0 12px; font-size:14px; font-weight:700; color:#0284c7; background:#f8fafc; cursor:not-allowed;">
            </div>
          </div>
        </div>

        <!-- CARD 3: CHANGE PASSWORD -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">CHANGE PASSWORD</div>
            <span style="font-size: 11.5px; color: #64748b;">minimum 8 characters</span>
          </div>

          <form id="pro-pwd-form" onsubmit="window.SpeedProfile.changePassword(event)">
            <div style="margin-bottom: 14px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Current password</label>
              <input type="password" id="pro-curr-pwd" required
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a;">
            </div>
            <div style="margin-bottom: 18px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">New password</label>
              <input type="password" id="pro-new-pwd" minlength="8" required
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a;">
            </div>
            <button type="submit" class="btn btn-primary"
              style="height:40px; padding:0 22px; font-size:13.5px; font-weight:600; border-radius:8px; background:#0284c7; color:#fff; border:none; cursor:pointer;">
              Update password
            </button>
          </form>
        </div>

        <!-- CARD 4: TWO-FACTOR AUTHENTICATION (2FA) -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">TWO-FACTOR AUTHENTICATION</div>
            <span id="2fa-status-pill" style="font-size:12px; font-weight:700; padding:3px 12px; border-radius:9999px; ${is2fa ? 'background:#ecfdf5; color:#059669;' : 'background:#f1f5f9; color:#64748b;'}">
              ${is2fa ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <p style="font-size:13px; color:#64748b; margin-top:0; margin-bottom:16px;">
            Use an authenticator app (Google Authenticator, 1Password, Authy...) to generate a 6-digit code on every login.
          </p>

          ${is2fa ? `
            <!-- DISABLE 2FA SECTION -->
            <div id="2fa-disable-wrap" style="max-width:440px;">
              <div style="margin-bottom:12px;">
                <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:4px;">Account Password</label>
                <input type="password" id="2fa-dis-pwd" placeholder="Enter password to confirm"
                  style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; font-size:14px;">
              </div>
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:4px;">Current 2FA code</label>
                <input type="text" id="2fa-dis-code" placeholder="6-digit code" maxlength="6"
                  style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; font-size:14px; font-weight:700; letter-spacing:2px;">
              </div>
              <div style="font-size:11.5px; color:#ef4444; margin-bottom:12px;">Disabling 2FA reduces account security.</div>
              <button type="button" onclick="window.SpeedProfile.disable2FA()" class="btn"
                style="height:38px; padding:0 20px; font-size:13px; font-weight:700; border-radius:6px; background:#ef4444; color:#fff; border:none; cursor:pointer;">
                Disable 2FA
              </button>
            </div>
          ` : `
            <!-- SETUP 2FA SECTION -->
            <div id="2fa-setup-trigger-wrap" style="max-width:440px;">
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:4px;">Confirm your password to start setup</label>
                <input type="password" id="2fa-setup-pwd" placeholder="Enter your password"
                  style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; font-size:14px;">
              </div>
              <button type="button" onclick="window.SpeedProfile.start2FASetup()" class="btn btn-outline"
                style="height:38px; padding:0 18px; font-size:13px; font-weight:600; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer;">
                <i class="fas fa-shield-alt"></i> Set up 2FA
              </button>
            </div>

            <!-- REVEALED 2FA SETUP WIZARD (QR CODE + SECRET) -->
            <div id="2fa-wizard" style="display:none; margin-top:20px; padding:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
              <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
                <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:12px;">Scan the QR code with your authenticator app</div>
                
                <div id="2fa-qr-container" style="background:#ffffff; padding:12px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:14px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
                  <img id="2fa-qr-img" src="" alt="2FA QR Code" style="width:180px; height:180px; display:block;">
                </div>

                <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Or enter the secret key manually:</div>
                <div id="2fa-secret-code" style="font-family:monospace; font-size:15px; font-weight:700; color:#0f172a; background:#e2e8f0; padding:6px 14px; border-radius:6px; letter-spacing:2px; margin-bottom:18px; user-select:all;">
                  --------
                </div>

                <div style="width:100%; max-width:320px; text-align:left;">
                  <label style="display:block; font-size:12.5px; font-weight:600; color:#334155; margin-bottom:6px;">Enter the current 6-digit code</label>
                  <div style="display:flex; gap:8px;">
                    <input type="text" id="2fa-confirm-code" placeholder="000000" maxlength="6"
                      style="flex:1; height:38px; border:1px solid #94a3b8; border-radius:6px; padding:0 10px; font-size:16px; font-weight:700; letter-spacing:3px; text-align:center;">
                    <button type="button" onclick="window.SpeedProfile.confirmEnable2FA()" class="btn btn-primary"
                      style="height:38px; padding:0 16px; font-size:13px; font-weight:700; border-radius:6px; background:#0284c7; color:#fff; border:none; cursor:pointer;">
                      Confirm + enable
                    </button>
                  </div>
                  <div id="2fa-wizard-err" style="font-size:12px; color:#ef4444; font-weight:600; margin-top:6px; display:none;"></div>
                </div>
              </div>
            </div>
          `}
        </div>

      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function showToast(msg, type = 'info') {
    if (typeof window.toast === 'function') {
      window.toast(msg, type);
    } else {
      console.log(`[Toast ${type}]`, msg);
      alert(msg);
    }
  }

  // ── Handlers ──
  async function savePersonal(e) {
    if (e) e.preventDefault();
    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    const full_name = document.getElementById('pro-fullname')?.value || '';
    const phone = document.getElementById('pro-phone')?.value || '';
    const teams = document.getElementById('pro-teams')?.value || '';

    try {
      const res = await fetch('/api/user/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ full_name, phone, teams })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Personal details saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save profile.', 'error');
      }
    } catch (err) {
      showToast('Network error while saving profile.', 'error');
    }
  }

  async function openEmailBindOtp() {
    const email = document.getElementById('pro-email')?.value.trim();
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address first.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/email/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const box = document.getElementById('email-otp-box');
        const msg = document.getElementById('email-otp-msg');
        if (box) box.style.display = 'block';
        if (msg) {
          msg.textContent = `Verification OTP sent to ${email}`;
          msg.style.color = '#059669';
        }
        const inp = document.getElementById('email-otp-input');
        if (inp) {
          if (data.dev_code) inp.value = data.dev_code;
          inp.focus();
        }
        showToast('Verification code sent!', 'success');
      } else {
        showToast(data.error || 'Failed to send verification code.', 'error');
      }
    } catch (err) {
      showToast('Network error while sending verification code.', 'error');
    }
  }

  async function verifyEmailBind() {
    const email = document.getElementById('pro-email')?.value.trim();
    const code = document.getElementById('email-otp-input')?.value.trim();
    if (!code) {
      showToast('Please enter the 6-digit code.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/email/verify-bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Email bound successfully!', 'success');
        renderProfileView();
      } else {
        showToast(data.error || 'Incorrect code.', 'error');
      }
    } catch (err) {
      showToast('Network error while verifying email.', 'error');
    }
  }

  async function changePassword(e) {
    if (e) e.preventDefault();
    const current_password = document.getElementById('pro-curr-pwd')?.value || '';
    const new_password = document.getElementById('pro-new-pwd')?.value || '';

    if (new_password.length < 8) {
      showToast('New password must be at least 8 characters long.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/password/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ current_password, new_password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Password updated successfully!', 'success');
        document.getElementById('pro-pwd-form')?.reset();
      } else {
        showToast(data.error || 'Failed to update password.', 'error');
      }
    } catch (err) {
      showToast('Network error while updating password.', 'error');
    }
  }

  async function start2FASetup() {
    const pwd = document.getElementById('2fa-setup-pwd')?.value.trim();
    if (!pwd) {
      showToast('Please enter your account password to begin 2FA setup.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const trigger = document.getElementById('2fa-setup-trigger-wrap');
        const wizard = document.getElementById('2fa-wizard');
        const qrImg = document.getElementById('2fa-qr-img');
        const secretCode = document.getElementById('2fa-secret-code');

        if (trigger) trigger.style.display = 'none';
        if (wizard) wizard.style.display = 'block';
        if (qrImg) qrImg.src = data.qr;
        if (secretCode) secretCode.textContent = data.secret;

        const codeInp = document.getElementById('2fa-confirm-code');
        if (codeInp) codeInp.focus();
      } else {
        showToast(data.error || 'Password incorrect.', 'error');
      }
    } catch (err) {
      showToast('Network error while setting up 2FA.', 'error');
    }
  }

  async function confirmEnable2FA() {
    const code = document.getElementById('2fa-confirm-code')?.value.trim();
    const errBox = document.getElementById('2fa-wizard-err');
    if (!code || code.length !== 6) {
      if (errBox) {
        errBox.textContent = 'Please enter a valid 6-digit code.';
        errBox.style.display = 'block';
      }
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/2fa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Two-Factor Authentication is now enabled!', 'success');
        renderProfileView();
      } else {
        if (errBox) {
          errBox.textContent = data.error || 'Invalid 6-digit code.';
          errBox.style.display = 'block';
        }
      }
    } catch (err) {
      showToast('Network error while enabling 2FA.', 'error');
    }
  }

  async function disable2FA() {
    const pwd = document.getElementById('2fa-dis-pwd')?.value.trim();
    const code = document.getElementById('2fa-dis-code')?.value.trim();
    if (!pwd || !code) {
      showToast('Please enter both password and current 2FA code.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ password: pwd, code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Two-Factor Authentication has been disabled.', 'info');
        renderProfileView();
      } else {
        showToast(data.error || 'Invalid password or code.', 'error');
      }
    } catch (err) {
      showToast('Network error while disabling 2FA.', 'error');
    }
  }

  window.SpeedProfile = {
    render: renderProfileView,
    savePersonal,
    openEmailBindOtp,
    verifyEmailBind,
    changePassword,
    start2FASetup,
    confirmEnable2FA,
    disable2FA
  };

})(window);
