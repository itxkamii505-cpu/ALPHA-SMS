/* ═══════════════════════════════════════════════════════════════════
   ALPHA SMS / Universal Brand, Logo & Theme Engine
   Applies dynamic site name, logo, typography (fonts), theme colors,
   and signature multi-color animated topbar header gradients
   across all panels (Owner, Manager, Agent, Client, Test, Login).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  const HEADER_GRADIENTS = {
    green_wave: {
      name: 'Default 3-Color Wave',
      desc: 'Lime Green, Deep Blue, Dark Forest Green',
      gradient: 'linear-gradient(180deg, #78B800 0%, #005c90 60%, #2B4300 100%)',
      color1: '#78B800', stop1: 0,
      color2: '#005c90', stop2: 60,
      color3: '#2B4300', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    emerald_lime: {
      name: 'Emerald Lime Glow',
      desc: 'Neon Lime, Emerald Green, Deep Forest',
      gradient: 'linear-gradient(180deg, #8FE51F 0%, #059669 50%, #064e3b 100%)',
      color1: '#8FE51F', stop1: 0,
      color2: '#059669', stop2: 50,
      color3: '#064e3b', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    sunset_amber: {
      name: 'Sunset Amber & Rust',
      desc: 'Gold, Amber Orange, Deep Crimson Rust',
      gradient: 'linear-gradient(180deg, #f59e0b 0%, #d97706 45%, #991b1b 100%)',
      color1: '#f59e0b', stop1: 0,
      color2: '#d97706', stop2: 45,
      color3: '#991b1b', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    ocean_cobalt: {
      name: 'Royal Ocean Cobalt',
      desc: 'Sky Blue, Electric Cobalt, Deep Navy',
      gradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 45%, #0f172a 100%)',
      color1: '#38bdf8', stop1: 0,
      color2: '#0284c7', stop2: 45,
      color3: '#0f172a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    cyber_neon: {
      name: 'Cyber Violet Neon',
      desc: 'Vibrant Purple, Indigo Blue, Midnight',
      gradient: 'linear-gradient(180deg, #a855f7 0%, #6366f1 50%, #1e1b4b 100%)',
      color1: '#a855f7', stop1: 0,
      color2: '#6366f1', stop2: 50,
      color3: '#1e1b4b', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    ruby_crimson: {
      name: 'Ruby Velvet Crimson',
      desc: 'Coral Red, Vivid Crimson, Black Cherry',
      gradient: 'linear-gradient(180deg, #f87171 0%, #dc2626 50%, #450a0a 100%)',
      color1: '#f87171', stop1: 0,
      color2: '#dc2626', stop2: 50,
      color3: '#450a0a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    midnight_slate: {
      name: 'Midnight Slate Elite',
      desc: 'Silver Slate, Gunmetal, Onyx Charcoal',
      gradient: 'linear-gradient(180deg, #64748b 0%, #334155 50%, #0f172a 100%)',
      color1: '#64748b', stop1: 0,
      color2: '#334155', stop2: 50,
      color3: '#0f172a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    forest_teal: {
      name: 'Forest Teal & Jade',
      desc: 'Aquamarine, Deep Teal, Dark Jade',
      gradient: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 50%, #134e4a 100%)',
      color1: '#14b8a6', stop1: 0,
      color2: '#0d9488', stop2: 50,
      color3: '#134e4a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    }
  };

  const THEME_PALETTES = {
    green: {
      accent: '#8FE51F',
      primary: '#5E9800',
      primaryHover: '#4d7c00',
      glow: 'rgba(143,229,31,0.25)',
      gradient: 'linear-gradient(135deg, #8FE51F 0%, #5FAF00 100%)'
    },
    gold: {
      accent: '#f59e0b',
      primary: '#d97706',
      primaryHover: '#b45309',
      glow: 'rgba(245,158,11,0.25)',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
    },
    blue: {
      accent: '#38bdf8',
      primary: '#0284c7',
      primaryHover: '#0369a1',
      glow: 'rgba(56,189,248,0.25)',
      gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)'
    },
    cyan: {
      accent: '#06b6d4',
      primary: '#0891b2',
      primaryHover: '#0e7490',
      glow: 'rgba(6,182,212,0.25)',
      gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)'
    },
    purple: {
      accent: '#a855f7',
      primary: '#7e22ce',
      primaryHover: '#6b21a8',
      glow: 'rgba(168,85,247,0.25)',
      gradient: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)'
    },
    crimson: {
      accent: '#f87171',
      primary: '#dc2626',
      primaryHover: '#b91c1c',
      glow: 'rgba(248,113,113,0.25)',
      gradient: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)'
    },
    dark: {
      accent: '#94a3b8',
      primary: '#334155',
      primaryHover: '#1e293b',
      glow: 'rgba(148,163,184,0.25)',
      gradient: 'linear-gradient(135deg, #64748b 0%, #1e293b 100%)'
    }
  };

  const FONT_DEFS = {
    inter: {
      family: "'Inter', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
    },
    poppins: {
      family: "'Poppins', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
    },
    roboto: {
      family: "'Roboto', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'
    },
    outfit: {
      family: "'Outfit', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
    },
    montserrat: {
      family: "'Montserrat', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap'
    },
    opensans: {
      family: "'Open Sans', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap'
    },
    jakarta: {
      family: "'Plus Jakarta Sans', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
    },
    system: {
      family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      url: null
    },
    monospace: {
      family: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      url: null
    }
  };

  let _currentSettings = {};
  try {
    if (window.__BRAND_SETTINGS__ && typeof window.__BRAND_SETTINGS__ === 'object') {
      _currentSettings = { ...window.__BRAND_SETTINGS__ };
    } else {
      const cached = localStorage.getItem('app_brand_settings');
      if (cached) _currentSettings = JSON.parse(cached);
    }
  } catch (e) {}

  function loadGoogleFont(fontKey) {
    const def = FONT_DEFS[fontKey] || FONT_DEFS.inter;
    if (def.url) {
      const linkId = 'dynamic-google-font-' + fontKey;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = def.url;
        document.head.appendChild(link);
      }
    }
    return def.family;
  }

  function applyBrandTheme(settings) {
    if (!settings) return;
    _currentSettings = { ..._currentSettings, ...settings };
    try {
      localStorage.setItem('app_brand_settings', JSON.stringify(_currentSettings));
    } catch (e) {}

    const siteName = _currentSettings.site_name || 'ALPHA SMS';
    const logoUrl = _currentSettings.logo_url || '/static/img/alphasms-logo.svg';
    const themeColor = _currentSettings.theme_color || 'dark';
    const fontKey = _currentSettings.font_family || 'system';
    const palette = THEME_PALETTES[themeColor] || THEME_PALETTES.dark || THEME_PALETTES.blue;

    // Header multi-color wave gradient & typography styles
    const headerPreset = _currentSettings.header_gradient_preset || 'midnight_slate';
    const headerGrad = _currentSettings.header_gradient || (HEADER_GRADIENTS[headerPreset] ? HEADER_GRADIENTS[headerPreset].gradient : HEADER_GRADIENTS.midnight_slate.gradient);
    const headerTextColor = _currentSettings.header_text_color || '#ffffff';
    const headerFontWeight = _currentSettings.header_font_weight || '700';

    // 1. Update Document Title
    const curTitle = document.title || '';
    if (curTitle.includes('—') || curTitle.includes('|')) {
      const sep = curTitle.includes('—') ? ' — ' : ' | ';
      const parts = curTitle.split(sep);
      document.title = parts[0].trim() + sep + siteName;
    } else if (curTitle.includes('𝑴𝑨𝑰𝑻 𝑺𝑴𝑺') || curTitle.includes('MAIT SMS') || curTitle.includes('RTX SMS') || curTitle.includes('ALPHA SMS')) {
      document.title = curTitle.replace(/𝑴𝑨𝑰𝑻 𝑺𝑴𝑺|MAIT SMS|RTX SMS|ALPHA SMS|Astra SMS|ASTRA SMS/g, siteName);
    } else if (!curTitle) {
      document.title = siteName;
    }

    // 2. Update Favicon
    let icon = document.querySelector("link[rel*='icon']");
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = logoUrl;

    // 3. Update Font Family & Styles
    const fontFamily = loadGoogleFont(fontKey);

    // Apply CSS variables directly to documentElement synchronously
    try {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--brand-accent', palette.accent);
      rootStyle.setProperty('--brand-primary', palette.primary);
      rootStyle.setProperty('--brand-hover', palette.primaryHover);
      rootStyle.setProperty('--brand-glow', palette.glow);
      rootStyle.setProperty('--brand-gradient', palette.gradient);
      rootStyle.setProperty('--header-gradient', headerGrad);
      rootStyle.setProperty('--header-text-color', headerTextColor);
      rootStyle.setProperty('--header-font-weight', headerFontWeight);
      rootStyle.setProperty('--app-font', fontFamily);
    } catch (e) {}

    let styleTag = document.getElementById('dynamic-brand-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'dynamic-brand-styles';
      (document.head || document.documentElement).appendChild(styleTag);
    }

    styleTag.innerHTML = `
      :root {
        --brand-accent: ${palette.accent};
        --brand-primary: ${palette.primary};
        --brand-hover: ${palette.primaryHover};
        --brand-glow: ${palette.glow};
        --brand-gradient: ${palette.gradient};
        --header-gradient: ${headerGrad};
        --header-text-color: ${headerTextColor};
        --header-font-weight: ${headerFontWeight};
        --app-font: ${fontFamily};
      }
      body, button, input, select, textarea, .card, .dt, .zy-sidenav, .page-title, h1, h2, h3, h4 {
        font-family: var(--app-font) !important;
      }
      .zy-header, .adminui .zy-header {
        background: var(--header-gradient) !important;
        color: var(--header-text-color, #ffffff) !important;
        position: relative;
        transition: background 0.3s ease;
      }
      .zy-header-row {
        position: relative;
      }
      .zy-header a:not(.zy-user-menu a),
      .zy-header span:not(.zy-user-menu span),
      .zy-header i:not(.zy-user-menu i),
      .adminui .zy-header a:not(.zy-user-menu a),
      .adminui .zy-header span:not(.zy-user-menu span),
      .adminui .zy-header i:not(.zy-user-menu i) {
        color: var(--header-text-color, #ffffff) !important;
      }
      .zy-hamb span {
        background: var(--header-text-color, #ffffff) !important;
      }

      /* ── Top-right Profile Button & Tab (Same App Theme) ── */
      .zy-user, .adminui .zy-user {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 4px 12px 4px 7px !important;
        background: rgba(0, 0, 0, 0.22) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        border-radius: 24px !important;
        color: var(--header-text-color, #ffffff) !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        user-select: none !important;
        backdrop-filter: blur(8px) !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) !important;
      }
      .zy-user:hover, .adminui .zy-user:hover {
        background: rgba(255, 255, 255, 0.22) !important;
        border-color: rgba(255, 255, 255, 0.45) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
        transform: translateY(-1px) !important;
      }
      .zy-user span, .adminui .zy-user span {
        color: var(--header-text-color, #ffffff) !important;
      }
      .zy-user #mgr-username, .zy-user #agent-username, .zy-user #client-username, .zy-user .zy-name {
        font-weight: 600 !important;
        font-size: 13.5px !important;
        letter-spacing: .2px !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4) !important;
      }
      .zy-user .zy-ava, .adminui .zy-user .zy-ava {
        width: 26px !important;
        height: 26px !important;
        border-radius: 50% !important;
        background: rgba(0, 0, 0, 0.35) !important;
        border: 1.5px solid rgba(255, 255, 255, 0.4) !important;
        color: #facc15 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 12px !important;
        box-shadow: 0 2px 5px rgba(0,0,0,0.25) !important;
        flex-shrink: 0 !important;
      }
      .zy-user .zy-ava i {
        color: #facc15 !important;
      }
      .zy-user .zy-dot, .adminui .zy-user .zy-dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #ffffff !important;
        box-shadow: 0 0 4px rgba(255,255,255,0.7) !important;
        flex-shrink: 0 !important;
      }
      .zy-user .fa-caret-down, .adminui .zy-user .fa-caret-down {
        font-size: 11px !important;
        color: var(--header-text-color, #ffffff) !important;
        opacity: 0.85 !important;
        transition: transform 0.2s ease !important;
      }

      /* ── Top-right Profile Dropdown Menu (Clean, Compact, White Card) ── */
      .zy-user-menu, .adminui .zy-user-menu {
        display: none;
        position: absolute !important;
        right: 0 !important;
        top: calc(100% + 8px) !important;
        width: 185px !important;
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
        z-index: 9999 !important;
        padding: 4px 0 !important;
        animation: zyUserDropIn 0.18s ease-out !important;
      }
      @keyframes zyUserDropIn {
        from { opacity: 0; transform: translateY(-6px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .zy-user-menu.open, .adminui .zy-user-menu.open {
        display: block !important;
      }
      .zy-user-menu .zy-um-head, .adminui .zy-user-menu .zy-um-head {
        display: none !important;
      }
      .zy-user-menu a, .adminui .zy-user-menu a {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 9px 14px !important;
        font-size: 13.5px !important;
        font-weight: 500 !important;
        color: #334155 !important;
        background: transparent !important;
        border: none !important;
        transition: all 0.15s ease !important;
        cursor: pointer !important;
        text-decoration: none !important;
      }
      .zy-user-menu a i, .adminui .zy-user-menu a i {
        color: #64748b !important;
        font-size: 13px !important;
        width: 16px !important;
        text-align: center !important;
      }
      .zy-user-menu a:hover, .adminui .zy-user-menu a:hover {
        background: #f8fafc !important;
        color: #0f172a !important;
        padding-left: 16px !important;
      }
      .zy-user-menu a:hover i, .adminui .zy-user-menu a:hover i {
        color: #0284c7 !important;
      }
      .zy-user-menu .zy-um-divider, .adminui .zy-user-menu .zy-um-divider {
        height: 1px !important;
        background: #f1f5f9 !important;
        margin: 4px 0 !important;
      }
      .zy-user-menu a.zy-um-logout, .adminui .zy-user-menu a.zy-um-logout,
      .zy-user-menu a:last-child, .adminui .zy-user-menu a:last-child {
        border-top: 1px solid #f1f5f9 !important;
        color: #ef4444 !important;
        font-weight: 600 !important;
      }
      .zy-user-menu a.zy-um-logout i, .adminui .zy-user-menu a.zy-um-logout i,
      .zy-user-menu a:last-child i, .adminui .zy-user-menu a:last-child i {
        color: #ef4444 !important;
      }
      .zy-user-menu a.zy-um-logout:hover, .adminui .zy-user-menu a.zy-um-logout:hover,
      .zy-user-menu a:last-child:hover, .adminui .zy-user-menu a:last-child:hover {
        background: #fef2f2 !important;
        color: #dc2626 !important;
        border-left: none !important;
      }
      .zy-user-menu .um-badge {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: #ef4444 !important;
        color: #ffffff !important;
        font-size: 10.5px !important;
        font-weight: 700 !important;
        min-width: 17px !important;
        height: 17px !important;
        padding: 0 4px !important;
        border-radius: 4px !important;
        margin-left: auto !important;
      }
      /* Completely hide top mega menu: navigation is strictly on the sidebar */
      .zy-mega, .adminui .zy-mega {
        display: none !important;
      }
      /* Sidebar Theme: Matching Top Theme */
      .zy-side, .adminui .zy-side {
        background: #1c2430 !important;
        border-right: 1px solid rgba(0, 0, 0, 0.3) !important;
      }
      .zy-side-head, .adminui .zy-side-head {
        background: #ffffff !important;
        border-bottom: 2px solid rgba(0, 0, 0, 0.1) !important;
        position: relative !important;
      }
      .zy-side-head::after, .adminui .zy-side-head::after {
        content: "" !important;
        position: absolute !important;
        bottom: -2px !important;
        left: 0 !important;
        right: 0 !important;
        height: 3px !important;
        background: var(--header-gradient) !important;
        z-index: 2 !important;
      }
      .zy-sidenav .zy-snav, .adminui .zy-sidenav .zy-snav {
        background: var(--header-gradient) !important;
        color: var(--header-text-color, #ffffff) !important;
        border-bottom: 1px solid rgba(0, 0, 0, 0.3) !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15) !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
        font-weight: var(--header-font-weight, 700) !important;
        font-size: 12px !important;
        letter-spacing: .35px !important;
        transition: all 0.2s ease !important;
      }
      .zy-sidenav .zy-snav:hover, .adminui .zy-sidenav .zy-snav:hover {
        background: var(--header-gradient) !important;
        filter: brightness(1.15) !important;
        padding-left: 14px !important;
        color: var(--header-text-color, #ffffff) !important;
      }
      .zy-sidenav .zy-snav.open, .adminui .zy-sidenav .zy-snav.open {
        background: var(--header-gradient) !important;
        filter: brightness(1.22) !important;
        border-left: 4px solid var(--header-text-color, #ffffff) !important;
        box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.25) !important;
        color: var(--header-text-color, #ffffff) !important;
      }
      .zy-sidenav .zy-snav.active, .adminui .zy-sidenav .zy-snav.active {
        background: #ffffff !important;
        color: #111827 !important;
        border-left: 4px solid var(--brand-primary, #0284c7) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25) !important;
        text-shadow: none !important;
      }
      .zy-sidenav .zy-snav.active span, .adminui .zy-sidenav .zy-snav.active span,
      .zy-sidenav .zy-snav.active .zy-ic i, .adminui .zy-sidenav .zy-snav.active .zy-ic i,
      .zy-sidenav .zy-snav.active .zy-caret, .adminui .zy-sidenav .zy-snav.active .zy-caret {
        color: #111827 !important;
      }
      .zy-sidenav .zy-snav .zy-ic i, .zy-sidenav .zy-snav .zy-ic img,
      .adminui .zy-sidenav .zy-snav .zy-ic i, .adminui .zy-sidenav .zy-snav .zy-ic img {
        filter: none !important;
        color: var(--header-text-color, #ffffff) !important;
      }
      .zy-sidenav .zy-snav .zy-caret, .adminui .zy-sidenav .zy-snav .zy-caret {
        margin-left: auto !important;
        font-size: 11px !important;
        opacity: 0.9 !important;
        color: var(--header-text-color, #ffffff) !important;
        transition: transform 0.25s ease !important;
      }
      .zy-sidenav .zy-snav.open .zy-caret, .adminui .zy-sidenav .zy-snav.open .zy-caret {
        transform: rotate(180deg) !important;
      }
      /* Opened Group Sub-menu: exact same theme as top bar */
      .zy-sidenav .zy-ssub.open, .adminui .zy-sidenav .zy-ssub.open {
        display: block !important;
        background: var(--header-gradient) !important;
        position: relative !important;
        border-top: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-bottom: 2px solid rgba(0, 0, 0, 0.35) !important;
        box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.25) !important;
        animation: zySubFadeSlide 0.2s ease-out !important;
      }
      @keyframes zySubFadeSlide {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .zy-sidenav .zy-ssub div, .adminui .zy-sidenav .zy-ssub div {
        padding: 9px 12px 9px 34px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        color: var(--header-text-color, #ffffff) !important;
        cursor: pointer !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45) !important;
        transition: all 0.18s ease !important;
        position: relative !important;
      }
      .zy-sidenav .zy-ssub div:hover, .adminui .zy-sidenav .zy-ssub div:hover {
        background: rgba(255, 255, 255, 0.22) !important;
        color: var(--header-text-color, #ffffff) !important;
        padding-left: 38px !important;
        border-left: 4px solid var(--header-text-color, #ffffff) !important;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6) !important;
      }
      .zy-side-foot, .adminui .zy-side-foot {
        background: var(--header-gradient) !important;
        opacity: 0.9 !important;
        border-top: 1px solid rgba(0, 0, 0, 0.25) !important;
      }
      .btn-primary, .btn-submit, .submit-btn, .zy-btn-blue, button.primary {
        background: var(--brand-primary) !important;
        border-color: var(--brand-primary) !important;
      }
      .btn-primary:hover, .zy-btn-blue:hover, .submit-btn:hover {
        background: var(--brand-hover) !important;
        box-shadow: 0 4px 14px var(--brand-glow) !important;
      }
      body.rmsui .stat-value, .stat-value, .zy-strip-txt i, .zy-circle-txt b {
        color: var(--brand-primary) !important;
      }
      .zy-strip-up {
        color: var(--brand-accent, var(--brand-primary)) !important;
      }
      .tpui .zy-tile-on span {
        color: var(--brand-primary) !important;
      }
      .stat-card-ims.green, .stat-card-ims.blue {
        background: var(--header-gradient, linear-gradient(135deg, var(--brand-primary), var(--brand-hover))) !important;
      }
      .btn-success {
        background: var(--brand-primary) !important;
        border-color: var(--brand-primary) !important;
      }
      .btn-success:hover {
        background: var(--brand-hover) !important;
        border-color: var(--brand-hover) !important;
      }
      .zy-gentoken {
        background: var(--header-gradient, var(--brand-primary)) !important;
        border-color: var(--brand-primary) !important;
      }
      .logo-circle {
        border-color: var(--brand-accent) !important;
        box-shadow: 0 8px 30px var(--brand-glow) !important;
      }
      .captcha-box input:focus, .input-group input:focus {
        border-color: var(--brand-accent) !important;
      }
      .zy-hamb {
        transition: all 0.2s ease;
      }
      .zy-hamb:active {
        transform: scale(0.92);
      }
    `;

    // 4. Update Images / Logos across page
    const logoImgs = document.querySelectorAll('#zy-side-logo, .zy-avatar-lg img, .logo-circle img, img[src*="mait-sms-logo"]');
    logoImgs.forEach(img => {
      if (img && img.src !== logoUrl) {
        img.src = logoUrl;
        img.alt = siteName;
      }
    });

    // 5. Update Header SVG Logo or Custom Brand Logo
    const headerLogoContainer = document.getElementById('zy-logo');
    if (headerLogoContainer) {
      if (logoUrl && !logoUrl.includes('mait-sms-logo.png')) {
        headerLogoContainer.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="location.reload()">
            <img src="${logoUrl}" alt="${siteName}" style="max-height:42px;max-width:140px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,0.15);padding:2px;">
            <span style="font-weight:900;font-size:18px;letter-spacing:1px;color:#ffffff;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,0.4);">${siteName}</span>
          </div>
        `;
      } else {
        headerLogoContainer.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="location.reload()">
            <img src="${logoUrl}" alt="${siteName}" style="height:36px;width:36px;object-fit:contain;border-radius:50%;background:#ffffff;padding:2px;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
            <div style="display:flex;flex-direction:column;line-height:1.1;">
              <span style="font-family:var(--app-font);font-weight:900;font-size:17px;letter-spacing:1.5px;color:#ffffff;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,0.4);">${siteName}</span>
              <span style="font-size:10px;letter-spacing:2px;color:#c7f378;font-weight:700;">TERMINATION GATEWAY</span>
            </div>
          </div>
        `;
      }
    }

    // 6. Update Login Page Text
    const loginHeaderP = document.querySelector('.login-header p');
    if (loginHeaderP) {
      loginHeaderP.textContent = `Sign in to your ${siteName} account`;
    }

    // 7. Update Footer Text if any
    const footers = document.querySelectorAll('.zy-footer, .footer, .login-footer');
    footers.forEach(f => {
      f.textContent = _currentSettings.footer_text || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;
    });

    // 8. Initialize Mobile Drawer & Sidebar Controls
    initSidebarDrawer();

    // 9. Propagate to parent and child iframes
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'BRAND_THEME_UPDATE', settings: _currentSettings }, '*');
      }
      const frames = document.querySelectorAll('iframe');
      frames.forEach(f => {
        try { f.contentWindow.postMessage({ type: 'BRAND_THEME_UPDATE', settings: _currentSettings }, '*'); } catch (_) {}
      });
    } catch (_) {}
  }

  // Universal Mobile Drawer & Desktop Sidebar Controller
  function initSidebarDrawer() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // 1. Ensure backdrop exists
    let backdrop = document.getElementById('zy-side-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'zy-side-backdrop';
      backdrop.className = 'zy-side-backdrop';
      backdrop.setAttribute('aria-label', 'Close sidebar backdrop');
      backdrop.addEventListener('click', zyCloseSidebar);
      document.body.appendChild(backdrop);
    }

    // 2. Ensure close button exists in sidebar head on mobile
    const sideHead = sidebar.querySelector('.zy-side-head');
    if (sideHead && !sidebar.querySelector('.zy-side-close')) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'zy-side-close';
      closeBtn.type = 'button';
      closeBtn.innerHTML = '<i class="fas fa-times"></i>';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.setAttribute('title', 'Close');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zyCloseSidebar();
      });
      sideHead.appendChild(closeBtn);
    }

    // 3. Close drawer automatically when any navigation item is clicked on mobile
    sidebar.addEventListener('click', (e) => {
      const item = e.target.closest('.zy-snav, .zy-ssub div, a');
      if (item && window.innerWidth < 992) {
        const isExpander = item.hasAttribute('onclick') && item.getAttribute('onclick').includes('zySideSub');
        if (!isExpander) {
          setTimeout(zyCloseSidebar, 120);
        }
      }
    });
  }

  function zyToggleSidebar() {
    if (window.innerWidth < 992) {
      const isOpen = document.body.classList.contains('sidebar-open');
      if (isOpen) {
        zyCloseSidebar();
      } else {
        zyOpenSidebar();
      }
    } else {
      // PC version: Sidebar stays fixed, solid and visible; dashboard never slides
      document.body.classList.remove('sidebar-collapsed');
      return;
    }
  }

  function zyOpenSidebar() {
    document.body.classList.add('sidebar-open');
    const side = document.getElementById('sidebar');
    if (side) side.classList.add('mobile-open');
    const bd = document.getElementById('zy-side-backdrop');
    if (bd) bd.classList.add('active');
  }

  function zyCloseSidebar() {
    document.body.classList.remove('sidebar-open');
    const side = document.getElementById('sidebar');
    if (side) side.classList.remove('mobile-open');
    const bd = document.getElementById('zy-side-backdrop');
    if (bd) bd.classList.remove('active');
  }

  // Globally expose sidebar functions so all hamburger buttons work seamlessly
  window.zyToggleSidebar = zyToggleSidebar;
  window.zyCloseSidebar = zyCloseSidebar;
  window.zyOpenSidebar = zyOpenSidebar;
  window.zyToggleMenu = zyToggleSidebar;
  window.toggleSidebar = zyToggleSidebar;

  // ESC key to close sidebar on mobile
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      zyCloseSidebar();
    }
  });

  // Mobile swipe to close drawer (swipe left)
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches.length === 1) {
      const diffX = e.changedTouches[0].clientX - touchStartX;
      const diffY = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (document.body.classList.contains('sidebar-open') && diffX < -60 && diffY < 60) {
        zyCloseSidebar();
      }
    }
  }, { passive: true });

  // 1. Initial immediate synchronous execution (zero lag)
  if (Object.keys(_currentSettings).length) {
    applyBrandTheme(_currentSettings);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (Object.keys(_currentSettings).length) applyBrandTheme(_currentSettings);
      fetchLiveSettings();
    });
  } else {
    fetchLiveSettings();
  }

  // 2. Cross-tab & Cross-frame live theme synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === 'app_brand_settings' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        applyBrandTheme(parsed);
      } catch (err) {}
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'BRAND_THEME_UPDATE' && e.data.settings) {
      applyBrandTheme(e.data.settings);
    }
  });

  // Fetch live settings from server
  async function fetchLiveSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          applyBrandTheme(data);
        }
      }
    } catch (e) {
      console.warn('BrandTheme live fetch failed:', e);
    }
  }

  function zySideSub(id, trigger) {
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains('open');
    el.classList.toggle('open');
    const nav = trigger || el.previousElementSibling;
    if (nav && nav.classList.contains('zy-snav')) {
      nav.classList.toggle('open', !wasOpen);
    }
  }
  window.zySideSub = zySideSub;

  function buildGradient(opts) {
    if (!opts) return '';
    const angle = opts.angle || '180deg';
    const c1 = opts.color1 || '#78B800';
    const s1 = opts.stop1 !== undefined ? opts.stop1 : 0;
    const c2 = opts.color2 || '#005c90';
    const s2 = opts.stop2 !== undefined ? opts.stop2 : 60;
    const c3 = opts.color3 || '#2B4300';
    const s3 = opts.stop3 !== undefined ? opts.stop3 : 100;
    return `linear-gradient(${angle}, ${c1} ${s1}%, ${c2} ${s2}%, ${c3} ${s3}%)`;
  }

  function parseGradient(gradStr) {
    if (!gradStr || typeof gradStr !== 'string') return null;
    const m = gradStr.match(/linear-gradient\(\s*([\w\d]+deg)?\s*,\s*(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)%?\s*,\s*(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)%?\s*,\s*(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)%?\s*\)/i);
    if (m) {
      return {
        angle: m[1] || '180deg',
        color1: m[2], stop1: parseInt(m[3]) || 0,
        color2: m[4], stop2: parseInt(m[5]) || 50,
        color3: m[6], stop3: parseInt(m[7]) || 100
      };
    }
    return null;
  }

  // Expose globally
  window.BrandTheme = {
    apply: applyBrandTheme,
    getSettings: () => ({ ..._currentSettings }),
    palettes: THEME_PALETTES,
    headerGradients: HEADER_GRADIENTS,
    fonts: FONT_DEFS,
    buildGradient: buildGradient,
    parseGradient: parseGradient,
    reload: fetchLiveSettings
  };
})();
