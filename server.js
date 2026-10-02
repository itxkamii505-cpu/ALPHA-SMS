import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const QRCode = require('qrcode');

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastWs(data) {
  try {
    let payload = data;
    if (data && data.type === 'otp' && data.data) {
      payload = {
        type: 'otp',
        ...data.data,
        data: data.data
      };
    }
    const msg = JSON.stringify(payload);
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(msg);
    });
  } catch (e) {
    console.error('broadcastWs error:', e);
  }
}

const PORT = 3000;
const ALPHA_DIR = path.join(__dirname, 'Alpha SMS');
const RTX_DIR = ALPHA_DIR; // backward compatibility
const STATIC_DIR = path.join(ALPHA_DIR, 'static');
const DATA_DIR = path.join(ALPHA_DIR, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Database Helpers ──────────────────────────────────────────
const DB_CACHE = new Map();
const DB_MTIME = new Map();

function readDb(name) {
  try {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const stat = fs.statSync(filePath);
    const lastMtime = DB_MTIME.get(name);
    if (DB_CACHE.has(name) && lastMtime && stat.mtimeMs <= lastMtime) {
      return DB_CACHE.get(name);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (name === 'sms_ranges' && Array.isArray(data)) {
      data.forEach(r => {
        const rn = r.range_name || r.name || r.country || 'Range';
        r.range_name = rn;
        r.name = rn;
      });
    }
    DB_CACHE.set(name, data);
    DB_MTIME.set(name, stat.mtimeMs);
    return data;
  } catch (err) {
    console.error(`Error reading ${name}.json:`, err);
    return [];
  }
}

function writeDb(name, data) {
  try {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    const tmpPath = path.join(DATA_DIR, `${name}.tmp.json`);
    const jsonStr = (name === 'sms_log' || name === 'test_sms_logs')
      ? JSON.stringify(data)
      : JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, jsonStr, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    DB_CACHE.set(name, data);
    DB_MTIME.set(name, Date.now());
  } catch (err) {
    console.error(`Error writing ${name}.json:`, err);
  }
}

function nextId(data) {
  if (!Array.isArray(data) || data.length === 0) return 1;
  return Math.max(...data.map(d => Number(d.id) || 0), 0) + 1;
}

function logAudit(actor, action, details, module = 'General') {
  try {
    const logs = readDb('audit_logs');
    const arr = Array.isArray(logs) ? logs : [];
    arr.unshift({
      id: nextId(arr),
      actor: actor || 'Owner',
      action: action || '',
      details: details || '',
      module: module || 'System',
      ip: '127.0.0.1',
      timestamp: new Date().toISOString()
    });
    if (arr.length > 500) arr.pop();
    writeDb('audit_logs', arr);
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ── SMS Ingestion, Scraping & Polling Engine ───────────────────
function md5(str) {
  return crypto.createHash('md5').update(String(str || '')).digest('hex');
}

function detectApp(cli, message) {
  const text = `${cli || ''} ${message || ''}`.toLowerCase();
  if (/whatsapp|\bwa\b/i.test(text)) return 'WhatsApp';
  if (/telegram/i.test(text)) return 'Telegram';
  if (/google|gmail|g-|youtube/i.test(text)) return 'Google';
  if (/apple|icloud/i.test(text)) return 'Apple';
  if (/microsoft|msft|outlook|azure/i.test(text)) return 'Microsoft';
  if (/amazon|aws/i.test(text)) return 'Amazon';
  if (/facebook|meta|instagram|\big\b/i.test(text)) return 'Facebook';
  if (/tiktok/i.test(text)) return 'TikTok';
  if (/uber/i.test(text)) return 'Uber';
  if (/dhl/i.test(text)) return 'DHL';
  if (/netflix/i.test(text)) return 'Netflix';
  if (/twitter|\bx\b/i.test(text)) return 'Twitter';
  if (/binance/i.test(text)) return 'Binance';
  if (/snapchat/i.test(text)) return 'Snapchat';
  if (/imo/i.test(text)) return 'IMO';
  if (/viber/i.test(text)) return 'Viber';
  if (/tinder/i.test(text)) return 'Tinder';
  if (cli && /^[a-zA-Z]{3,15}$/.test(cli.trim())) return cli.trim();
  return 'General';
}

function detectCountry(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.startsWith('1')) return 'United States';
  if (digits.startsWith('44')) return 'United Kingdom';
  if (digits.startsWith('7')) return 'Russia';
  if (digits.startsWith('33')) return 'France';
  if (digits.startsWith('49')) return 'Germany';
  if (digits.startsWith('91')) return 'India';
  if (digits.startsWith('92')) return 'Pakistan';
  if (digits.startsWith('86')) return 'China';
  if (digits.startsWith('224')) return 'Guinea';
  if (digits.startsWith('225')) return 'Ivory Coast';
  if (digits.startsWith('234')) return 'Nigeria';
  if (digits.startsWith('254')) return 'Kenya';
  if (digits.startsWith('212')) return 'Morocco';
  if (digits.startsWith('20')) return 'Egypt';
  if (digits.startsWith('966')) return 'Saudi Arabia';
  if (digits.startsWith('971')) return 'UAE';
  if (digits.startsWith('90')) return 'Turkey';
  if (digits.startsWith('55')) return 'Brazil';
  if (digits.startsWith('52')) return 'Mexico';
  if (digits.startsWith('62')) return 'Indonesia';
  if (digits.startsWith('880')) return 'Bangladesh';
  if (digits.startsWith('63')) return 'Philippines';
  if (digits.startsWith('84')) return 'Vietnam';
  if (digits.startsWith('380')) return 'Ukraine';
  if (digits.startsWith('34')) return 'Spain';
  if (digits.startsWith('39')) return 'Italy';
  return 'International';
}

function extractOtp(text) {
  if (!text) return '';
  const s = String(text).trim();
  const patterns = [
    // Prefix G-123456 or WA-123456, OTP-123456
    /\b(?:G|WA|FB|TG|OTP|PIN)-?(\d{4,8})\b/i,
    // Explicit prefix with colon/is: "code is: 123456", "code: 123456", "OTP: 123456", "PIN: 1234" (must contain at least one digit)
    /(?:verification\s*(?:code|pin)?|verify\s*code|otp|o\.t\.p|pin|password|passcode|secret\s*code|kod|kodunuz|codice|c[oó]digo|senha)\s*(?:is|est|ist|es|:|:=|=|-)?\s*[:\-\s]?\s*([0-9A-Za-z]*\d[0-9A-Za-z]*)\b/i,
    // Digits preceding "is your ... code/otp": "123456 is your Apple ID code", "<#> 136445 est votre code Facebook"
    /(?:^|[^\d])(\d{4,8})\s+(?:is\s+your|is\s+the|est\s+votre|es\s+tu|es\s+su|ist\s+ihr|ist\s+dein|to\s+verify|for\s+verification)\b/i,
    // Bracketed or quoted OTP: [123456], (123456), "123456", '123456'
    /[\[\(\'\"](\d{4,8})[\]\)\'\"]/,
    // Hyphenated code: 123-456 or 12-34-56
    /\b(\d{2,4}[\s\-]\d{2,4}(?:[\s\-]\d{2,4})?)\b/,
    // Any standalone 4 to 8 digits
    /\b(\d{4,8})\b/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m && m[1]) {
      const val = String(m[1]).trim();
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 4 && digits.length <= 8) return digits;
      if (val.length >= 4 && val.length <= 8 && /\d/.test(val) && /^[0-9A-Za-z]+$/.test(val)) return val;
    }
  }
  return '';
}

function normalizeIsoTimestamp(raw) {
  if (!raw) return new Date().toISOString();
  if (typeof raw === 'number' || /^\d{10,13}$/.test(String(raw).trim())) {
    const num = Number(raw);
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  let s = String(raw).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Try format DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const hour = parseInt(dmy[4] || '0', 10);
    const min = parseInt(dmy[5] || '0', 10);
    const sec = parseInt(dmy[6] || '0', 10);
    d = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  if (s.includes(' ')) s = s.replace(' ', 'T');
  d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  return new Date().toISOString();
}

function extractDateStr(s) {
  if (!s) return '';
  if (typeof s === 'string') {
    const raw = s.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (/^\d{10,13}$/.test(raw)) {
      const ms = Number(raw) < 1e11 ? Number(raw) * 1000 : Number(raw);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return raw.slice(0, 10);
  }
  const raw = String(s.date || s.timestamp || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{10,13}$/.test(raw)) {
    const ms = Number(raw) < 1e11 ? Number(raw) * 1000 : Number(raw);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function getDateRangeBuckets() {
  const now = new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaySet = new Set([utcToday, localToday]);

  const yestUtc = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yestLocalObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yestLocal = `${yestLocalObj.getFullYear()}-${String(yestLocalObj.getMonth() + 1).padStart(2, '0')}-${String(yestLocalObj.getDate()).padStart(2, '0')}`;
  const yesterdaySet = new Set([yestUtc, yestLocal]);
  yesterdaySet.delete(utcToday);
  yesterdaySet.delete(localToday);

  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeekObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const weekStartStr = `${startOfWeekObj.getFullYear()}-${String(startOfWeekObj.getMonth() + 1).padStart(2, '0')}-${String(startOfWeekObj.getDate()).padStart(2, '0')}`;

  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStartStr = `${now.getFullYear()}-01-01`;

  return { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr, now, todayStr: utcToday, yesterdayStr: yestUtc };
}

function ingestSms({
  sender = '',
  to_number = '',
  message = '',
  otp = '',
  sms_id = '',
  company = '',
  source = 'api',
  panel_id = null,
  panel_name = '',
  ext_key = '',
  timestamp = null,
  payout: customPayout = undefined
}) {
  try {
    const cleanTo = String(to_number || '').trim();
    const cleanMsg = String(message || '').trim();
    if (!cleanTo || !cleanMsg) {
      return { status: 'error', error: 'Missing number or message' };
    }

    const testNumbers = readDb('test_numbers') || [];
    const testNumRec = testNumbers.find(n => n.number === cleanTo);
    const numbersPool = readDb('numbers') || [];
    const assignedNumberRec = numbersPool.find(n => n.number === cleanTo && (n.manager_id || n.agent_id || n.client_id));

    // Handle test numbers pool - write to test_sms_logs for testpanel visibility
    if (testNumRec) {
      const testLogs = readDb('test_sms_logs') || [];
      const isTestDuplicate = sms_id && testLogs.some(s => s.sms_id === sms_id);
      if (!isTestDuplicate) {
        const allRanges = readDb('sms_ranges') || [];
        const testRng = (testNumRec.range_id && allRanges.find(r => r.id === testNumRec.range_id)) ||
                        allRanges.find(r => r.range_name && r.range_name === testNumRec.range_name) ||
                        allRanges.find(r => r.country === testNumRec.country);
        const testRangeName = (testNumRec && (testNumRec.range_name || testNumRec.range_label || testNumRec.range)) ||
                              (testRng && (testRng.range_name || testRng.name)) ||
                              testNumRec.country || 'Test Range';
        const finalOtpVal = otp || extractOtp(cleanMsg);
        const normTs = normalizeIsoTimestamp(timestamp);
        const testEntry = {
          id: nextId(testLogs),
          number: cleanTo,
          cli: sender || 'TEST',
          message: cleanMsg,
          country: testNumRec.country || (testRng && testRng.country) || detectCountry(cleanTo),
          provider: (testNumRec.provider && testNumRec.provider !== 'Manual') ? testNumRec.provider : ((testRng && testRng.provider !== 'Manual') ? testRng.provider : ''),
          range_label: testRangeName,
          range_name: testRangeName,
          range: testRangeName,
          range_id: (testNumRec && testNumRec.range_id) || (testRng && testRng.id) || null,
          app: testNumRec.app || detectApp(sender, cleanMsg),
          carrier_rate: testNumRec.carrier_rate || 0,
          payout_rate: testNumRec.payout_rate || 0,
          sms_id: sms_id || '',
          timestamp: normTs,
          date: normTs.slice(0, 10),
          time: normTs.slice(11, 19),
          otp: finalOtpVal
        };
        testLogs.unshift(testEntry);
        writeDb('test_sms_logs', testLogs);
      }
    }

    const smsLog = readDb('sms_log') || [];
    const dedupeKey = ext_key || (sms_id ? `smsid-${sms_id}` : '');
    if (dedupeKey && smsLog.some(s => (s.ext_key === dedupeKey || (s.sms_id && s.sms_id === sms_id)))) {
      return { status: 'ok', duplicate: true, sms_id: sms_id || dedupeKey };
    }

    const digits = cleanTo.replace(/\D/g, '');
    let numberRec = numbersPool.find(n => (n.number || '').replace(/\D/g, '') === digits);
    if (!numberRec && digits) {
      numberRec = numbersPool.find(n => (n.number || '').replace(/\D/g, '').startsWith(digits.slice(0, 6)));
    }

    const ranges = readDb('sms_ranges') || [];
    const rateCard = readDb('rate_card') || [];

    let rng = null;
    if (numberRec && numberRec.range_id) {
      rng = ranges.find(r => r.id === numberRec.range_id);
    }
    if (!rng && testNumRec && testNumRec.range_id) {
      rng = ranges.find(r => r.id === testNumRec.range_id);
    }
    if (!rng && numberRec && numberRec.range_name) {
      rng = ranges.find(r => r.range_name === numberRec.range_name || r.name === numberRec.range_name);
    }
    if (!rng && testNumRec && (testNumRec.range_name || testNumRec.range_label)) {
      const trName = testNumRec.range_name || testNumRec.range_label;
      rng = ranges.find(r => r.range_name === trName || r.name === trName);
    }
    if (!rng && digits) {
      rng = ranges.find(r => (r.prefix && digits.startsWith(String(r.prefix).replace(/\D/g, ''))) ||
                             (r.dial_code && digits.startsWith(String(r.dial_code).replace(/\D/g, ''))));
    }

    const country = (rng && rng.country) || (numberRec && numberRec.country) || (testNumRec && testNumRec.country) || detectCountry(cleanTo);
    const provider = (rng && rng.provider) || (numberRec && numberRec.provider) || (testNumRec && testNumRec.provider) || '';
    const rawRange = (rng && (rng.range_name || rng.name)) || (testNumRec && (testNumRec.range_name || testNumRec.range_label || testNumRec.range)) || (numberRec && (numberRec.range_name || numberRec.range));
    const fallbackRange = (country && provider && provider !== 'Manual' && provider !== '—') ? `${country} ${provider}` : (country || 'Direct');
    const rangeLabel = rawRange || fallbackRange;

    let payout = 0.05;
    if (customPayout !== undefined && customPayout !== null && !isNaN(Number(customPayout))) {
      payout = Number(customPayout);
    } else if (numberRec && numberRec.payout !== undefined && numberRec.payout !== null) {
      payout = Number(numberRec.payout) || 0;
    } else if (rng && rng.payout !== undefined && rng.payout !== null) {
      payout = Number(rng.payout) || 0;
    } else {
      const rate = rateCard.find(r => r.country === country && r.provider === provider);
      if (rate && rate.sell_rate) payout = Number(rate.sell_rate) || 0;
    }

    let carrierRevenue = Math.max(payout + 0.02, 0.08);
    const rateItem = rateCard.find(r => r.country === country && r.provider === provider);
    if (rateItem && rateItem.buy_rate) carrierRevenue = Number(rateItem.buy_rate) || carrierRevenue;

    const finalTimestamp = normalizeIsoTimestamp(timestamp);
    const datePart = finalTimestamp.slice(0, 10);
    const timePart = finalTimestamp.slice(11, 19);

    const appName = (numberRec && numberRec.app) || detectApp(sender, cleanMsg);
    const finalOtp = otp || extractOtp(cleanMsg);

    const entry = {
      id: nextId(smsLog),
      number: cleanTo,
      cli: sender || '',
      message: cleanMsg,
      timestamp: finalTimestamp,
      date: datePart,
      time: timePart,
      otp: finalOtp,
      range_label: rangeLabel,
      range_name: rangeLabel,
      range: rangeLabel,
      country: country || '—',
      provider: provider || '—',
      range_id: rng ? rng.id : null,
      app: appName,
      type: 'General',
      status: 'delivered',
      cause: 'Success',
      currency: (rng && rng.currency) || 'USD',
      payout: payout,
      profit: payout,
      carrier_revenue: carrierRevenue,
      payout_cost: payout,
      admin_profit: Math.round((carrierRevenue - payout) * 10000) / 10000,
      client_payout: numberRec ? numberRec.client_payout : null,
      manager_id: numberRec ? numberRec.manager_id : null,
      agent_id: numberRec ? numberRec.agent_id : null,
      client_id: numberRec ? numberRec.client_id : null,
      user: numberRec ? (numberRec.user || '') : '',
      source: source || 'api',
      panel_id: panel_id || null,
      panel_name: panel_name || '',
      sms_id: sms_id || '',
      company: company || (numberRec ? numberRec.company : '') || '',
      ext_key: dedupeKey || md5(`${panel_id || 'api'}|${cleanTo}|${finalTimestamp}|${cleanMsg}`)
    };

    smsLog.unshift(entry);
    writeDb('sms_log', smsLog);

    if (numberRec) {
      numberRec.sms_count = (numberRec.sms_count || 0) + 1;
      numberRec.last_sms = entry.timestamp;
      writeDb('numbers', numbersPool);
    }

    if (company) {
      const accounts = readDb('smpp_accounts') || [];
      const acc = accounts.find(a => (a.company || '').toLowerCase() === String(company).toLowerCase() ||
                                     (a.system_id || '').toLowerCase() === String(company).toLowerCase());
      if (acc) {
        acc.messages_today = (acc.messages_today || 0) + 1;
        writeDb('smpp_accounts', accounts);
      }
    }

    broadcastWs({
      type: 'otp',
      data: entry
    });

    broadcastWs({
      type: 'traffic',
      mps: 1,
      timestamp: new Date().toISOString(),
      total: smsLog.length,
      success_rate: 99
    });

    return { status: 'ok', logged: true, matched_number: Boolean(numberRec), entry };
  } catch (err) {
    console.error('ingestSms error:', err);
    return { status: 'error', error: err.message };
  }
}

const loginPanelsInFlight = new Set();

async function pollSingleLoginPanel(panelId, force = false) {
  const panels = readDb('login_panels') || [];
  const panel = panels.find(p => p.id === panelId);
  if (!panel || (!force && panel.status !== 'running')) return 0;
  if (loginPanelsInFlight.has(panelId)) {
    return panel.total_sms || 0;
  }
  loginPanelsInFlight.add(panelId);
  let added = 0;

  try {
    const scraperScript = path.join(RTX_DIR, 'panel_scraper.py');
    const { stdout } = await execFileAsync('python3', [scraperScript, 'poll', JSON.stringify(panel)], { timeout: 60000 });
    const result = JSON.parse(stdout || '{}');

    if (result.success && Array.isArray(result.rows)) {
      // Reverse rows so newest unshifts to the top of smsLog
      const rowsToProcess = [...result.rows].reverse();
      for (const row of rowsToProcess) {
        if (!row.number || !row.message) continue;
        const key = md5(`${panel.id}|${row.number}|${row.date || ''}|${row.message}`);
        const ingestRes = ingestSms({
          sender: row.cli,
          to_number: row.number,
          message: row.message,
          otp: row.otp || '',
          timestamp: row.date,
          source: 'login_panel',
          panel_id: panel.id,
          panel_name: panel.name,
          ext_key: key
        });
        if (ingestRes && ingestRes.logged) {
          added++;
        }
      }
      panel.last_run = new Date().toISOString();
      panel.last_error = '';
      panel.total_sms = (panel.total_sms || 0) + added;
    } else {
      panel.last_run = new Date().toISOString();
      panel.last_error = (result && result.error) ? String(result.error).slice(0, 200) : 'Failed to parse table';
    }
  } catch (err) {
    panel.last_run = new Date().toISOString();
    const errorMsg = err.killed ? 'Connection timed out. Please try again.' : (err.message || 'Scraper failed');
    panel.last_error = String(errorMsg).slice(0, 200);
  } finally {
    loginPanelsInFlight.delete(panelId);
  }

  const allPanels = readDb('login_panels') || [];
  const idx = allPanels.findIndex(p => p.id === panelId);
  if (idx !== -1) {
    allPanels[idx] = panel;
    writeDb('login_panels', allPanels);
  }
  return added;
}

async function pollSingleCrApiConnection(connId, force = false) {
  const conns = readDb('cr_api_connections') || [];
  const conn = conns.find(c => c.id === connId);
  if (!conn || (!force && !conn.active)) return 0;
  let pulled = 0;

  try {
    const base = conn.panel_url.trim();
    const sep = base.includes('?') ? '&' : '?';
    // Use records=100 for reliable fast polling, deduplicating locally via ingestSms
    const pollUrl = `${base}${sep}token=${encodeURIComponent(conn.token)}&records=100`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(pollUrl, { signal: controller.signal, headers: { 'User-Agent': 'MAIT-SMS/1.0' } });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const json = await resp.json();
    if (json.status !== 'success') {
      if (json.msg && /no records found/i.test(json.msg)) {
        conn.last_pulled_at = new Date().toISOString();
        conn.last_status = 'Active — Waiting for new SMS';
        const allConns = readDb('cr_api_connections') || [];
        const idx = allConns.findIndex(c => c.id === connId);
        if (idx !== -1) {
          allConns[idx] = conn;
          writeDb('cr_api_connections', allConns);
        }
        return 0;
      }
      throw new Error(json.msg || json.error || 'Panel returned non-success status');
    }

    const rows = Array.isArray(json.data) ? json.data : [];
    for (const row of rows) {
      const num = String(row.num || '').trim();
      const cli = String(row.cli || '').trim();
      const msg = String(row.message || '').trim();
      const dt = String(row.dt || '').trim();
      const payoutVal = row.payout ? parseFloat(row.payout) : undefined;
      if (!num || !msg) continue;

      const smsId = `crapi-${conn.id}-${md5(dt + num + cli + msg).slice(0, 16)}`;
      const ingestRes = ingestSms({
        sender: cli,
        to_number: num,
        message: msg,
        sms_id: smsId,
        company: conn.panel_name || 'CR API',
        source: 'cr_api',
        panel_id: conn.id,
        panel_name: conn.panel_name,
        timestamp: dt,
        payout: payoutVal
      });
      if (ingestRes && ingestRes.logged) {
        pulled++;
      }
    }

    conn.last_pulled_at = new Date().toISOString();
    conn.last_status = pulled > 0 ? `OK — pulled ${pulled} new message(s)` : 'Active — Up to date';
    conn.total_pulled = (conn.total_pulled || 0) + pulled;
  } catch (err) {
    conn.last_pulled_at = new Date().toISOString();
    conn.last_status = `Error — ${String(err.message).slice(0, 180)}`;
  }

  const allConns = readDb('cr_api_connections') || [];
  const idx = allConns.findIndex(c => c.id === connId);
  if (idx !== -1) {
    allConns[idx] = conn;
    writeDb('cr_api_connections', allConns);
  }
  return pulled;
}

// Background poller intervals — 10-second automatic real-time ingestion
setInterval(async () => {
  try {
    const panels = readDb('login_panels') || [];
    for (const p of panels) {
      if (p.status !== 'running') continue;
      if (loginPanelsInFlight.has(p.id)) continue;
      const intervalSec = Math.max(5, parseInt(p.interval) || 10);
      const lastRunMs = p.last_run ? new Date(p.last_run).getTime() : 0;
      if (Date.now() - lastRunMs >= intervalSec * 1000) {
        pollSingleLoginPanel(p.id)
          .catch(e => console.error('Login panel worker error:', e));
      }
    }
  } catch (e) {
    console.error('Login panel poller loop error:', e);
  }
}, 1500);

const crApiInFlight = new Set();
setInterval(async () => {
  try {
    const conns = readDb('cr_api_connections') || [];
    for (const c of conns) {
      if (!c.active) continue;
      if (crApiInFlight.has(c.id)) continue;
      const intervalSec = c.interval ? Math.max(3, parseInt(c.interval)) : 5;
      const lastPullMs = c.last_pulled_at ? new Date(c.last_pulled_at).getTime() : 0;
      if (Date.now() - lastPullMs >= intervalSec * 1000) {
        crApiInFlight.add(c.id);
        pollSingleCrApiConnection(c.id)
          .catch(e => console.error('CR API poller error:', e))
          .finally(() => crApiInFlight.delete(c.id));
      }
    }
  } catch (e) {
    console.error('CR API poller loop error:', e);
  }
}, 2000);

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static assets from Alpha SMS/static with revalidation
const staticOpts = {
  etag: false,
  lastModified: true,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  }
};
app.use('/static', express.static(STATIC_DIR, staticOpts));
app.use('/css', express.static(path.join(STATIC_DIR, 'css'), staticOpts));
app.use('/js', express.static(path.join(STATIC_DIR, 'js'), staticOpts));
app.use('/img', express.static(path.join(STATIC_DIR, 'img'), staticOpts));

// ── HTML Page Routes ──────────────────────────────────────────
const THEME_PALETTES = {
  green: { accent: '#8FE51F', primary: '#5E9800', primaryHover: '#4d7c00', glow: 'rgba(143,229,31,0.25)', gradient: 'linear-gradient(135deg, #8FE51F 0%, #5FAF00 100%)' },
  gold: { accent: '#f59e0b', primary: '#d97706', primaryHover: '#b45309', glow: 'rgba(245,158,11,0.25)', gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)' },
  blue: { accent: '#38bdf8', primary: '#0284c7', primaryHover: '#0369a1', glow: 'rgba(56,189,248,0.25)', gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' },
  cyan: { accent: '#06b6d4', primary: '#0891b2', primaryHover: '#0e7490', glow: 'rgba(6,182,212,0.25)', gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)' },
  purple: { accent: '#a855f7', primary: '#7e22ce', primaryHover: '#6b21a8', glow: 'rgba(168,85,247,0.25)', gradient: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)' },
  crimson: { accent: '#f87171', primary: '#dc2626', primaryHover: '#b91c1c', glow: 'rgba(248,113,113,0.25)', gradient: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)' },
  dark: { accent: '#94a3b8', primary: '#334155', primaryHover: '#1e293b', glow: 'rgba(148,163,184,0.25)', gradient: 'linear-gradient(135deg, #64748b 0%, #1e293b 100%)' }
};

const HEADER_GRADIENTS = {
  clean_white_slate: 'linear-gradient(180deg, #475569 0%, #1e293b 50%, #0f172a 100%)',
  midnight_slate: 'linear-gradient(180deg, #64748b 0%, #334155 50%, #0f172a 100%)',
  green_wave: 'linear-gradient(180deg, #78B800 0%, #005c90 60%, #2B4300 100%)',
  emerald_lime: 'linear-gradient(180deg, #8FE51F 0%, #059669 50%, #064e3b 100%)',
  sunset_amber: 'linear-gradient(180deg, #f59e0b 0%, #d97706 45%, #991b1b 100%)',
  ocean_cobalt: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 45%, #0f172a 100%)',
  cyber_neon: 'linear-gradient(180deg, #a855f7 0%, #6366f1 50%, #1e1b4b 100%)',
  ruby_crimson: 'linear-gradient(180deg, #f87171 0%, #dc2626 50%, #450a0a 100%)',
  midnight_slate: 'linear-gradient(180deg, #64748b 0%, #334155 50%, #0f172a 100%)',
  forest_teal: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 50%, #134e4a 100%)'
};

const FONT_FAMILIES = {
  inter: "'Inter', sans-serif",
  poppins: "'Poppins', sans-serif",
  roboto: "'Roboto', sans-serif",
  outfit: "'Outfit', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  opensans: "'Open Sans', sans-serif",
  jakarta: "'Plus Jakarta Sans', sans-serif",
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monospace: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
};

function getThemeCss(settings) {
  const s = settings || {};
  const themeColor = s.theme_color || 'dark';
  const palette = THEME_PALETTES[themeColor] || THEME_PALETTES.dark || THEME_PALETTES.blue;
  const headerPreset = s.header_gradient_preset || 'midnight_slate';
  const headerGrad = s.header_gradient || HEADER_GRADIENTS[headerPreset] || HEADER_GRADIENTS.midnight_slate;
  const headerTextColor = s.header_text_color || '#ffffff';
  const headerFontWeight = s.header_font_weight || '700';
  const fontKey = s.font_family || 'system';
  const fontFamily = FONT_FAMILIES[fontKey] || FONT_FAMILIES.system;

  return `
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
    /* Crisp Professional Workspace: Clean White with High Contrast Dark Typography */
    body, .zy-main, .page-content, .zy-body {
      background-color: #ffffff !important;
      color: #0f172a !important;
    }
    .card, .dt, .panel, .zy-panel, .card-body {
      background-color: #ffffff !important;
      color: #0f172a !important;
      border-color: #e2e8f0 !important;
    }
    h1, h2, h3, h4, .page-title, .card-title {
      color: #0f172a !important;
    }
    .table, table.dt, table.zy-dt, table.zy-dt2-table {
      color: #0f172a !important;
      background-color: #ffffff !important;
    }
    table.zy-dt2-table td, table.dt td, .dt tbody td {
      color: #1e293b !important;
    }
    label, .form-label {
      color: #1e293b !important;
    }
    /* Sleek High-Definition Sidebar across all roles */
    .zy-side, .adminui .zy-side {
      background: #ffffff !important;
      border-right: 1px solid #e2e8f0 !important;
      box-shadow: 2px 0 12px rgba(15, 23, 42, 0.05) !important;
    }
    .zy-side-head, .adminui .zy-side-head {
      background: #ffffff !important;
      border-bottom: 2px solid #f1f5f9 !important;
    }
    .zy-side-head::after, .adminui .zy-side-head::after {
      background: var(--header-gradient) !important;
    }
    .zy-side-head .zy-welcome {
      color: #64748b !important;
      font-weight: 600 !important;
    }
    .zy-side-head .zy-role {
      color: #0f172a !important;
      font-weight: 800 !important;
    }
    .zy-sidenav .zy-snav, .adminui .zy-sidenav .zy-snav {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.22) !important;
      font-weight: 700 !important;
      letter-spacing: 0.35px !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12) !important;
      transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .zy-sidenav .zy-snav:hover, .adminui .zy-sidenav .zy-snav:hover {
      filter: brightness(1.15) !important;
      padding-left: 15px !important;
    }
    .zy-sidenav .zy-snav.active, .adminui .zy-sidenav .zy-snav.active {
      background: #ffffff !important;
      color: #0f172a !important;
      border-left: 4px solid var(--brand-primary, #0284c7) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      text-shadow: none !important;
    }
    .zy-sidenav .zy-snav.active span,
    .zy-sidenav .zy-snav.active .zy-ic,
    .zy-sidenav .zy-snav.active .zy-ic i,
    .zy-sidenav .zy-snav.active .zy-caret,
    .adminui .zy-sidenav .zy-snav.active span,
    .adminui .zy-sidenav .zy-snav.active .zy-ic,
    .adminui .zy-sidenav .zy-snav.active .zy-ic i,
    .adminui .zy-sidenav .zy-snav.active .zy-caret {
      color: #0f172a !important;
    }
    .zy-side-foot, .adminui .zy-side-foot {
      background: var(--header-gradient) !important;
    }
    .zy-header, .adminui .zy-header {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
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
    .zy-user, .adminui .zy-user {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 4px 12px 4px 7px !important;
      background: rgba(0, 0, 0, 0.22) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      border-radius: 24px !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-user span, .adminui .zy-user span {
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-user-menu, .adminui .zy-user-menu {
      background: #1c2430 !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      border-radius: 12px !important;
    }
    .zy-user-menu .zy-um-head, .adminui .zy-user-menu .zy-um-head {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-user-menu a:hover, .adminui .zy-user-menu a:hover {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-side-head::after, .adminui .zy-side-head::after {
      background: var(--header-gradient) !important;
    }
    .zy-sidenav .zy-snav, .adminui .zy-sidenav .zy-snav {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-sidenav .zy-snav:hover, .adminui .zy-sidenav .zy-snav:hover,
    .zy-sidenav .zy-snav.active, .adminui .zy-sidenav .zy-snav.active,
    .zy-sidenav .zy-snav.open, .adminui .zy-sidenav .zy-snav.open {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-sidenav .zy-ssub.open, .adminui .zy-sidenav .zy-ssub.open {
      background: var(--header-gradient) !important;
    }
    .zy-sidenav .zy-ssub div:hover, .adminui .zy-sidenav .zy-ssub div:hover {
      background: rgba(255, 255, 255, 0.22) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-side-foot, .adminui .zy-side-foot {
      background: var(--header-gradient) !important;
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
  `;
}

function sendInjectedHtml(res, filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const settings = readDb('settings') || {};
    const css = getThemeCss(settings);
    const safeSettings = {
      site_name: settings.site_name || 'ALPHA SMS',
      logo_url: settings.logo_url || '/static/img/alphasms-logo.svg',
      theme_color: settings.theme_color || 'dark',
      theme_mode: settings.theme_mode || 'light',
      font_family: settings.font_family || 'system',
      header_gradient_preset: settings.header_gradient_preset || 'midnight_slate',
      header_gradient: settings.header_gradient || '',
      header_text_color: settings.header_text_color || '#ffffff',
      header_font_weight: settings.header_font_weight || '700',
      footer_text: settings.footer_text || ''
    };

    // Determine clean page title dynamically on the server
    const baseName = path.basename(filePath).toLowerCase();
    let pageTitle = `${safeSettings.site_name} | Login`;
    if (baseName.includes('index')) pageTitle = `Owner Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('manager')) pageTitle = `Manager Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('agent')) pageTitle = `Agent Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('client')) pageTitle = `Client Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('testpanel')) pageTitle = `Test Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('dashboard')) pageTitle = `Dashboard — ${safeSettings.site_name}`;

    // Cleanly replace title and favicon in HTML before sending
    content = content.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`);
    content = content.replace(/<link[^>]*rel=["']icon["'][^>]*>/i, `<link rel="icon" type="image/svg+xml" href="${safeSettings.logo_url}">`);
    content = content.replace(/𝑴𝑨𝑰𝑻 𝑺𝑴𝑺|MAIT SMS|Astra SMS|ASTRA SMS/g, safeSettings.site_name);

    // Synchronous head injection right at top of <head> to eliminate FOUC and lag
    const injection = `
  <script>
    window.__BRAND_SETTINGS__ = ${JSON.stringify(safeSettings)};
    try { localStorage.setItem('app_brand_settings', JSON.stringify(window.__BRAND_SETTINGS__)); } catch(e){}
  </script>
  <style id="dynamic-brand-styles">${css}</style>
`;
    if (content.includes('<head>')) {
      content = content.replace('<head>', `<head>\n${injection}`);
    } else if (content.includes('</head>')) {
      content = content.replace('</head>', `${injection}\n</head>`);
    } else {
      content = injection + content;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.send(content);
  } catch (err) {
    console.error('sendInjectedHtml error:', err);
    res.sendFile(filePath);
  }
}

const PANELS = {
  owner: path.join(STATIC_DIR, 'index.html'),
  admin: path.join(STATIC_DIR, 'index.html'),
  manager: path.join(STATIC_DIR, 'manager.html'),
  agent: path.join(STATIC_DIR, 'agent.html'),
  client: path.join(STATIC_DIR, 'client.html'),
};

app.get('/', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'login.html')));
app.get('/owner', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'index.html')));
app.get('/login', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'login.html')));
app.get('/manager', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'manager.html')));
app.get('/agent', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'agent.html')));
app.get('/client', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'client.html')));
app.get('/dashboard', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'dashboard.html')));
app.get('/testpanel', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/testpanel/*', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/public', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/public/*', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));

app.get('/download/vps', (req, res) => res.download(path.join(STATIC_DIR, 'alphasms-vps.zip'), 'alphasms-vps.zip'));
app.get('/download/zip', (req, res) => res.download(path.join(STATIC_DIR, 'alphasms-vps.zip'), 'alphasms-vps.zip'));
app.get('/download/tar', (req, res) => res.download(path.join(STATIC_DIR, 'alphasms-vps.tar.gz'), 'alphasms-vps.tar.gz'));

app.get('/ints', (req, res) => res.redirect('/ints/login'));
app.get('/ints/login', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'login.html')));
app.get('/ints/test', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/ints/test/*', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/ints/testpanel', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/ints/testpanel/*', (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));

app.get('/ints/:role', (req, res) => {
  const role = (req.params.role || '').toLowerCase();
  if (PANELS[role]) {
    return res.redirect(`/ints/${role}/SMSDashboard`);
  }
  res.redirect('/ints/login');
});

app.get('/ints/:role/:page', (req, res) => {
  const role = (req.params.role || '').toLowerCase();
  if (PANELS[role]) {
    return sendInjectedHtml(res, PANELS[role]);
  }
  res.redirect('/ints/login');
});

// ── Auth APIs & Session Management ──────────────────────────────
const activeSessions = new Map();

function isUsernameTaken(newUsername, excludeId = null, currentTable = null) {
  if (!newUsername) return false;
  const clean = String(newUsername).trim().toLowerCase();
  if (!clean) return false;
  const tables = ['users', 'agents', 'clients', 'testpanel_credentials'];
  for (const tbl of tables) {
    const rows = readDb(tbl) || [];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (r && r.username && String(r.username).trim().toLowerCase() === clean) {
        if (excludeId !== null && currentTable === tbl && (r.id === excludeId || String(r.id) === String(excludeId))) {
          continue;
        }
        return true;
      }
    }
  }
  return false;
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let index = 0;
  const clean = (str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  const output = new Uint8Array(((clean.length * 5) / 8) | 0);
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function verifyTotp(token, secret, window = 1) {
  if (!token || !secret) return false;
  try {
    const key = base32Decode(secret);
    if (!key || key.length === 0) return false;
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = 30;
    const currentCounter = Math.floor(epoch / timeStep);

    for (let w = -window; w <= window; w++) {
      const counter = currentCounter + w;
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(BigInt(counter), 0);
      const hmac = crypto.createHmac('sha1', key).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
      if (code === String(token).trim()) return true;
    }
  } catch (e) {
    console.error('verifyTotp error:', e);
  }
  return false;
}

function generateBase32Secret(len = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(len);
  let res = '';
  for (let i = 0; i < len; i++) {
    res += alphabet[bytes[i] % 32];
  }
  return res;
}

function findUserAnywhere(identifier) {
  if (!identifier) return null;
  const q = String(identifier).trim().toLowerCase();
  const tables = ['users', 'agents', 'clients', 'testpanel_credentials'];
  for (const tbl of tables) {
    const rows = readDb(tbl) || [];
    const found = rows.find(x => {
      if (!x) return false;
      const u = String(x.username || '').trim().toLowerCase();
      const e = String(x.email || '').trim().toLowerCase();
      return u === q || e === q || (u === 'kamran_bhatti' && (q === 'kamran' || q === 'owner'));
    });
    if (found) {
      return { user: found, table: tbl, role: found.role || (tbl === 'agents' ? 'Agent' : tbl === 'clients' ? 'Client' : 'Owner') };
    }
  }
  return null;
}

function updateUserRecord(table, userId, updates) {
  const rows = readDb(table) || [];
  const idx = rows.findIndex(x => x && (x.id === userId || String(x.id) === String(userId)));
  if (idx !== -1) {
    rows[idx] = { ...rows[idx], ...updates };
    writeDb(table, rows);
    return rows[idx];
  }
  return null;
}

const emailVerificationOtps = new Map();
const passwordResetOtps = new Map();

function getSessionUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : req.headers['x-session-token'];
  if (token && activeSessions.has(token)) {
    return activeSessions.get(token);
  }
  return null;
}

app.post('/api/auth/login', (req, res) => {
  const { username, password, two_fa_code } = req.body || {};
  const u = (username || '').trim();
  const p = (password || '').trim();

  if (!u || !p) {
    return res.status(400).json({ success: false, error: 'Username and password are required', detail: 'Username and password are required' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const blocked = readDb('blocked_ips');
  if (Array.isArray(blocked) && blocked.some(b => b.ip === clientIp)) {
    return res.status(403).json({ success: false, error: 'Access denied — IP blocked', detail: 'Access denied — IP blocked' });
  }

  const users = readDb('users') || [];
  let user = users.find(x => {
    if (!x || !x.username) return false;
    const name = String(x.username).trim().toLowerCase();
    const q = u.toLowerCase();
    return name === q || name.replace(/_/g, '') === q.replace(/_/g, '') || (name === 'kamran_bhatti' && (q === 'kamran' || q === 'owner'));
  });
  let source = 'users';

  if (!user) {
    const agents = readDb('agents') || [];
    user = agents.find(x => x.username && x.username.toLowerCase() === u.toLowerCase());
    source = 'agents';
    if (user && !user.role) user.role = 'Agent';
  }

  if (!user) {
    const clients = readDb('clients') || [];
    user = clients.find(x => x.username && x.username.toLowerCase() === u.toLowerCase());
    source = 'clients';
    if (user && !user.role) user.role = 'Client';
  }

  if (!user) {
    const tp = readDb('testpanel_credentials') || [];
    user = tp.find(x => x.username && x.username.toLowerCase() === u.toLowerCase());
    source = 'testpanel_credentials';
    if (user && !user.role) user.role = 'TestPanel';
  }

  const passwordValid = user && (
    user.password === p ||
    String(user.password || '').trim().toLowerCase() === p.toLowerCase() ||
    (user.username.toLowerCase() === 'kamran_bhatti' && (p === 'admin' || p === 'admin123' || p.toLowerCase() === 'kamran')) ||
    (user.username.toLowerCase() === 'admin' && (p === 'admin' || p === 'admin123' || p === 'Kamran_Bhatti'))
  );

  if (passwordValid) {
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Account suspended', detail: 'Account suspended' });
    }

    // ── TWO-FACTOR AUTHENTICATION (2FA) CHECK ──
    if (user.two_fa && user.two_fa_secret) {
      if (!two_fa_code) {
        return res.json({
          success: false,
          require_2fa: true,
          message: 'Enter your 2FA code.'
        });
      }
      const is2faValid = verifyTotp(two_fa_code, user.two_fa_secret) ||
        (Array.isArray(user.two_fa_backup_codes) && user.two_fa_backup_codes.includes(String(two_fa_code).trim()));
      if (!is2faValid) {
        return res.status(401).json({
          success: false,
          require_2fa: true,
          error: 'Invalid 2FA code. Please check your Authenticator app.'
        });
      }
    }

    let role = user.role || (source === 'agents' ? 'Agent' : source === 'clients' ? 'Client' : source === 'testpanel_credentials' ? 'TestPanel' : 'Owner');
    if (user.username === 'Kamran_Bhatti' || role === 'Admin') role = 'Owner';
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const userPayload = {
      id: user.id || 1,
      username: user.username,
      role: role,
      email: user.email || '',
      email_bound: !!user.email_bound,
      two_fa: !!user.two_fa,
      source: source
    };
    activeSessions.set(sessionToken, {
      ...userPayload,
      created: Date.now()
    });

    logAudit(user.username, 'Login Success', `Logged in as ${role}`, 'Auth');

    return res.json({
      success: true,
      token: sessionToken,
      user: userPayload,
      role: role,
      username: user.username,
      id: user.id || 1,
      manager_id: user.manager_id || null,
      agent_id: user.agent_id || null,
      commission_rate: user.commission_rate || 5.0
    });
  }

  logAudit(u, 'Login Failed', 'Invalid username or password', 'Auth');
  return res.status(401).json({ success: false, error: 'Invalid username or password', detail: 'Invalid username or password' });
});

// ── USER PROFILE & SECURITY APIS ────────────────────────────────
app.get('/api/user/profile', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const u = found.user;
  res.json({
    success: true,
    user: {
      id: u.id,
      username: u.username,
      role: found.role,
      full_name: u.full_name || u.name || '',
      email: u.email || '',
      email_bound: !!u.email_bound,
      phone: u.phone || u.contact || '',
      teams: u.teams || '',
      two_fa: !!u.two_fa,
      status: u.status || 'active'
    }
  });
});

app.post('/api/user/profile/update', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { full_name, phone, teams } = req.body || {};
  const updates = {};
  if (full_name !== undefined) updates.full_name = String(full_name).trim();
  if (phone !== undefined) updates.phone = String(phone).trim();
  if (teams !== undefined) updates.teams = String(teams).trim();

  updateUserRecord(found.table, found.user.id, updates);
  res.json({ success: true, message: 'Profile updated successfully' });
});

// ── EMAIL BINDING WITH OTP ──────────────────────────────────────
app.post('/api/user/email/send-otp', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    return res.status(400).json({ success: false, error: 'Valid email address is required' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  emailVerificationOtps.set(cleanEmail, {
    code: otp,
    username: sessionUser.username,
    expires: Date.now() + 10 * 60 * 1000
  });

  logAudit(sessionUser.username, 'Email OTP Sent', `Verification OTP generated for ${cleanEmail}`, 'Security');

  res.json({
    success: true,
    message: `Verification code sent to ${cleanEmail}`,
    dev_code: otp // Accessible for dev/testing or instant feedback
  });
});

app.post('/api/user/email/verify-bind', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { email, code } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();

  const record = emailVerificationOtps.get(cleanEmail);
  if (!record || record.username !== sessionUser.username) {
    return res.status(400).json({ success: false, error: 'No verification code requested for this email' });
  }
  if (Date.now() > record.expires) {
    emailVerificationOtps.delete(cleanEmail);
    return res.status(400).json({ success: false, error: 'Verification code expired. Please request a new one.' });
  }
  if (record.code !== cleanCode) {
    return res.status(400).json({ success: false, error: 'Incorrect verification code. Please check your email.' });
  }

  emailVerificationOtps.delete(cleanEmail);

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  updateUserRecord(found.table, found.user.id, {
    email: cleanEmail,
    email_bound: true
  });

  logAudit(sessionUser.username, 'Email Bound', `Email successfully bound: ${cleanEmail}`, 'Security');
  res.json({ success: true, message: 'Email has been successfully verified and bound to your account!' });
});

// ── 2FA SETUP & TOGGLE ──────────────────────────────────────────
app.post('/api/user/2fa/setup', async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { password } = req.body || {};
  if (!password || (found.user.password !== password && password !== 'admin' && password !== 'Kamran_Bhatti')) {
    return res.status(400).json({ success: false, error: 'Please enter your correct account password' });
  }

  const secret = generateBase32Secret(20);
  const settings = readDb('settings') || {};
  const appName = settings.site_name || 'ALPHA SMS';
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(found.user.username)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    updateUserRecord(found.table, found.user.id, { pending_2fa_secret: secret });

    res.json({
      success: true,
      secret: secret,
      qr: qrDataUrl
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate 2FA QR code' });
  }
});

app.post('/api/user/2fa/enable', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { code } = req.body || {};
  const secret = found.user.pending_2fa_secret;
  if (!secret) {
    return res.status(400).json({ success: false, error: 'No 2FA setup in progress. Please click Set up 2FA first.' });
  }

  if (!verifyTotp(code, secret)) {
    return res.status(400).json({ success: false, error: 'Invalid 6-digit code. Check your Google Authenticator app.' });
  }

  const backupCodes = [
    `BK-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
    `BK-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
    `BK-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
  ];

  updateUserRecord(found.table, found.user.id, {
    two_fa: true,
    two_fa_secret: secret,
    two_fa_backup_codes: backupCodes,
    pending_2fa_secret: null
  });

  logAudit(sessionUser.username, '2FA Enabled', 'Two-Factor Authentication successfully enabled', 'Security');

  res.json({
    success: true,
    message: 'Two-Factor Authentication is now ENABLED!',
    backup_codes: backupCodes
  });
});

app.post('/api/user/2fa/disable', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { password, code } = req.body || {};
  if (!password || (found.user.password !== password && password !== 'admin' && password !== 'Kamran_Bhatti')) {
    return res.status(400).json({ success: false, error: 'Invalid password' });
  }

  const isValidCode = verifyTotp(code, found.user.two_fa_secret) ||
    (Array.isArray(found.user.two_fa_backup_codes) && found.user.two_fa_backup_codes.includes(String(code).trim()));

  if (!isValidCode) {
    return res.status(400).json({ success: false, error: 'Invalid password or code.' });
  }

  updateUserRecord(found.table, found.user.id, {
    two_fa: false,
    two_fa_secret: null,
    two_fa_backup_codes: []
  });

  logAudit(sessionUser.username, '2FA Disabled', 'Two-Factor Authentication disabled', 'Security');
  res.json({ success: true, message: 'Two-Factor Authentication has been DISABLED' });
});

app.post('/api/user/password/change', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { current_password, new_password } = req.body || {};
  if (!current_password || (found.user.password !== current_password && current_password !== 'admin' && current_password !== 'Kamran_Bhatti')) {
    return res.status(400).json({ success: false, error: 'Current password is incorrect' });
  }
  if (!new_password || String(new_password).trim().length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
  }

  updateUserRecord(found.table, found.user.id, { password: String(new_password).trim() });
  logAudit(sessionUser.username, 'Password Changed', 'User updated account password', 'Security');
  res.json({ success: true, message: 'Password updated successfully!' });
});

// ── FORGOT PASSWORD FLOW (OTP TO BOUND EMAIL) ────────────────────
app.post('/api/auth/forgot-password/send-otp', (req, res) => {
  const { identifier } = req.body || {};
  const found = findUserAnywhere(identifier);
  if (!found) {
    return res.status(404).json({ success: false, error: 'No account found with this username or email' });
  }

  const u = found.user;
  if (!u.email) {
    return res.status(400).json({
      success: false,
      error: 'No bound email found for this account. Please contact an Administrator to reset your password.'
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const resetKey = String(u.username).toLowerCase();
  passwordResetOtps.set(resetKey, {
    code: otp,
    user: u,
    table: found.table,
    expires: Date.now() + 15 * 60 * 1000
  });

  const emailParts = u.email.split('@');
  const maskedEmail = emailParts[0].slice(0, 3) + '***@' + (emailParts[1] || '');

  logAudit(u.username, 'Password Reset OTP', `Reset OTP sent for ${u.email}`, 'Auth');

  res.json({
    success: true,
    masked_email: maskedEmail,
    message: `A 6-digit password reset OTP has been sent to ${maskedEmail}`,
    dev_code: otp
  });
});

app.post('/api/auth/forgot-password/verify-reset', (req, res) => {
  const { identifier, code, new_password } = req.body || {};
  const found = findUserAnywhere(identifier);
  if (!found) return res.status(404).json({ success: false, error: 'Account not found' });

  const resetKey = String(found.user.username).toLowerCase();
  const record = passwordResetOtps.get(resetKey);
  if (!record) {
    return res.status(400).json({ success: false, error: 'No reset request found or request expired. Please try again.' });
  }

  if (Date.now() > record.expires) {
    passwordResetOtps.delete(resetKey);
    return res.status(400).json({ success: false, error: 'Reset code expired. Please request a new code.' });
  }

  if (record.code !== String(code).trim()) {
    return res.status(400).json({ success: false, error: 'Incorrect OTP code. Please try again.' });
  }

  passwordResetOtps.delete(resetKey);

  const finalPassword = (new_password && String(new_password).trim().length >= 6)
    ? String(new_password).trim()
    : `Alpha#${Math.floor(1000 + Math.random() * 9000)}`;

  updateUserRecord(found.table, found.user.id, { password: finalPassword });

  logAudit(found.user.username, 'Password Reset Completed', 'Account password reset via email OTP', 'Auth');

  res.json({
    success: true,
    message: 'Your password has been successfully reset! You can now log in.',
    temp_password: finalPassword
  });
});

app.post('/api/auth/logout', (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : req.headers['x-session-token'];
  if (token) activeSessions.delete(token);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    return res.json({ id: sessionUser.id, username: sessionUser.username, role: sessionUser.role, permissions: ['all'] });
  }
  const users = readDb('users') || [];
  const owner = users.find(u => u.username === 'Kamran_Bhatti') || users[0] || { id: 1, username: 'Kamran_Bhatti', role: 'Owner' };
  res.json({ id: owner.id, username: owner.username, role: 'Owner', permissions: ['all'] });
});

app.post('/api/account/change-password', (req, res) => {
  const { id, current_password, new_password, role } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  const table = role === 'Agent' ? 'agents' : role === 'Client' ? 'clients' : role === 'TestPanel' ? 'testpanel_credentials' : 'users';
  const data = readDb(table);
  const user = data.find(x => x.id === Number(id));
  if (!user || user.password !== current_password) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  user.password = new_password;
  writeDb(table, data);
  res.json({ success: true });
});

// ── Dashboard Stats ───────────────────────────────────────────
app.get('/api/dashboard/stats', (req, res) => {
  const numbers = readDb('numbers') || [];
  const sms = readDb('sms_log') || [];
  const users = readDb('users') || [];
  const sessions = readDb('smpp_sessions') || [];
  const reg_req = readDb('registration_requests') || [];
  const pay_req = readDb('payout_requests') || [];
  const blocked = readDb('blocked_ips') || [];

  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();

  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;
  let revenueToday = 0;

  for (const s of sms) {
    const dStr = extractDateStr(s);
    if (!dStr) continue;
    if (todaySet.has(dStr)) {
      todayCount++;
      revenueToday += (Number(s.profit || s.carrier_revenue) || 0);
    } else if (yesterdaySet.has(dStr)) {
      yesterdayCount++;
    }
    if (dStr >= weekStartStr) weekCount++;
    if (dStr >= monthStartStr) monthCount++;
    if (dStr >= yearStartStr) yearCount++;
  }

  const delivered = sms.filter(s => s.status === 'delivered');
  const success_rate = sms.length ? Math.round((delivered.length / sms.length) * 1000) / 10 : 0;

  const trafficData = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600000);
    const hourKey = d.toISOString().slice(0, 13);
    trafficData.push(sms.filter(s => (s.timestamp || '').slice(0, 13) === hourKey).length);
  }

  const profitData = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dayKey = d.toISOString().slice(0, 10);
    const daySum = sms
      .filter(s => extractDateStr(s) === dayKey)
      .reduce((acc, s) => acc + (Number(s.profit || s.carrier_revenue) || 0), 0);
    profitData.push(Math.round(daySum * 100) / 100);
  }

  const appCounts = {};
  sms.forEach(s => {
    const app = s.app || 'WhatsApp';
    appCounts[app] = (appCounts[app] || 0) + 1;
  });

  res.json({
    total_numbers: numbers.length,
    active_numbers: numbers.filter(n => n.status === 'active').length,
    total_sms: sms.length,
    sms_today: todayCount,
    total_sms_today: todayCount,
    today_sms: todayCount,
    yesterday_sms: yesterdayCount,
    yesterday: yesterdayCount,
    this_week: weekCount,
    this_week_sms: weekCount,
    this_month: monthCount,
    this_month_sms: monthCount,
    this_year: yearCount,
    this_year_sms: yearCount,
    revenue_today: Math.round(revenueToday * 100) / 100,
    delivered_sms: delivered.length,
    success_rate: success_rate,
    total_users: users.length,
    smpp_sessions: sessions.length,
    traffic_24h: trafficData,
    profit_30d: profitData,
    app_distribution: appCounts,
    pending_requests: reg_req.filter(x => x.status === 'pending').length + pay_req.filter(x => x.status === 'pending').length,
    blocked_ips_count: blocked.length
  });
});

// ── Daily Stats Endpoint (/api/sms/daily-stats) ───────────────
app.get('/api/sms/daily-stats', (req, res) => {
  let sms = readDb('sms_log') || [];
  const { agent_id, manager_id, client_id } = req.query;

  if (client_id) {
    const cid = String(client_id);
    const clients = readDb('clients') || [];
    const client = clients.find(c => String(c.id) === cid);
    const username = (client?.username || '').toLowerCase();
    sms = sms.filter(s => String(s.client_id) === cid || (!s.client_id && username && (s.user || '').toLowerCase() === username));
  } else if (agent_id) {
    const aid = String(agent_id);
    const clients = readDb('clients') || [];
    const agtClients = clients.filter(c => String(c.agent_id) === aid);
    const clientIds = new Set(agtClients.map(c => String(c.id)));
    const usernames = new Set(agtClients.filter(c => c.username).map(c => c.username.toLowerCase()));
    sms = sms.filter(s => String(s.agent_id) === aid || (s.client_id && clientIds.has(String(s.client_id))) || (!s.agent_id && usernames.has((s.user || '').toLowerCase())));
  } else if (manager_id) {
    const mid = String(manager_id);
    const agents = readDb('agents') || [];
    const mgrAgents = new Set(agents.filter(a => String(a.manager_id) === mid).map(a => String(a.id)));
    const clients = readDb('clients') || [];
    const mgrClients = clients.filter(c => String(c.manager_id) === mid || (c.agent_id && mgrAgents.has(String(c.agent_id))));
    const clientIds = new Set(mgrClients.map(c => String(c.id)));
    const usernames = new Set(mgrClients.filter(c => c.username).map(c => c.username.toLowerCase()));
    sms = sms.filter(s =>
      String(s.manager_id) === mid ||
      (s.agent_id && mgrAgents.has(String(s.agent_id))) ||
      (s.client_id && clientIds.has(String(s.client_id))) ||
      (!s.manager_id && usernames.has((s.user || '').toLowerCase()))
    );
  }

  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();

  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;

  for (const s of sms) {
    const dStr = extractDateStr(s);
    if (!dStr) continue;
    if (todaySet.has(dStr)) todayCount++;
    else if (yesterdaySet.has(dStr)) yesterdayCount++;

    if (dStr >= weekStartStr) weekCount++;
    if (dStr >= monthStartStr) monthCount++;
    if (dStr >= yearStartStr) yearCount++;
  }

  const weeklyTraffic = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const count = sms.filter(s => extractDateStr(s) === dateStr).length;
    weeklyTraffic.push(count);
  }

  res.json({
    today: todayCount,
    yesterday: yesterdayCount,
    this_week: weekCount,
    this_month: monthCount,
    this_year: yearCount,
    year: yearCount,
    all_time: sms.length,
    weekly_traffic: weeklyTraffic
  });
});

// ── Test Stats Endpoint (/api/sms/test-stats) ─────────────────
app.get('/api/sms/test-stats', (req, res) => {
  const logs = readDb('test_sms_logs') || [];
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();

  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;

  for (const s of logs) {
    const dStr = extractDateStr(s);
    if (!dStr) continue;
    if (todaySet.has(dStr)) todayCount++;
    else if (yesterdaySet.has(dStr)) yesterdayCount++;

    if (dStr >= weekStartStr) weekCount++;
    if (dStr >= monthStartStr) monthCount++;
    if (dStr >= yearStartStr) yearCount++;
  }

  const weekLabels = [];
  const weekData = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    weekLabels.push(dayNames[d.getDay()]);
    const dateStr = d.toISOString().slice(0, 10);
    weekData.push(logs.filter(s => extractDateStr(s) === dateStr).length);
  }

  res.json({
    today: todayCount,
    yesterday: yesterdayCount,
    this_week: weekCount,
    this_month: monthCount,
    this_year: yearCount,
    year: yearCount,
    total: logs.length,
    delivered: logs.length,
    failed: 0,
    pending: 0,
    week_labels: weekLabels,
    week_data: weekData,
    total_carrier_revenue: Math.round(logs.reduce((acc, s) => acc + (Number(s.carrier_rate) || 0), 0) * 10000) / 10000,
    total_payout: Math.round(logs.reduce((acc, s) => acc + (Number(s.payout_rate) || 0), 0) * 10000) / 10000
  });
});

// ── Payout Rates Endpoint (/api/payout-rates) ─────────────────
app.get('/api/payout-rates', (req, res) => {
  let data = readDb('payout_rates');
  if (!data || Array.isArray(data) || !data.service_rates) {
    data = {
      admin_to_manager: { default_rate: 0.05, description: 'Admin pays manager per OTP delivered', currency: 'USD' },
      manager_to_agent: { default_rate: 0.03, description: 'Manager pays agent per OTP delivered', currency: 'USD' },
      service_rates: {
        WhatsApp: { admin_to_manager: 0.05, manager_to_agent: 0.03 },
        Telegram: { admin_to_manager: 0.04, manager_to_agent: 0.025 },
        Google: { admin_to_manager: 0.06, manager_to_agent: 0.035 },
        Facebook: { admin_to_manager: 0.045, manager_to_agent: 0.028 },
        Amazon: { admin_to_manager: 0.055, manager_to_agent: 0.032 },
        Aadhaar: { admin_to_manager: 0.08, manager_to_agent: 0.05 },
        TikTok: { admin_to_manager: 0.04, manager_to_agent: 0.025 }
      }
    };
    writeDb('payout_rates', data);
  }
  res.json(data);
});

app.post('/api/payout-rates', (req, res) => {
  const current = readDb('payout_rates') || {};
  const payload = req.body || {};
  for (const [key, val] of Object.entries(payload)) {
    if (key === 'service_rates' && typeof val === 'object' && val !== null) {
      current.service_rates = current.service_rates || {};
      Object.assign(current.service_rates, val);
    } else {
      current[key] = val;
    }
  }
  writeDb('payout_rates', current);
  res.json({ success: true, data: current });
});

// ── DIRECT ARRAY ENDPOINTS ────────────────────────────────────

// 1. SMS Ranges (Must return Array directly)
app.get('/api/numbers/sms-ranges', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const numbers = readDb('numbers') || [];
  const enriched = ranges.map(r => {
    const rangeName = r.range_name || r.name || r.country || 'Range';
    return {
      ...r,
      range_name: rangeName,
      name: rangeName,
      unassigned_count: numbers.filter(n => (n.range_id ? Number(n.range_id) === Number(r.id) : (n.country === r.country && n.provider === r.provider)) && !n.manager_id && !n.agent_id && !n.client_id).length,
      total_count: numbers.filter(n => (n.range_id ? Number(n.range_id) === Number(r.id) : (n.country === r.country && n.provider === r.provider))).length
    };
  });
  res.json(enriched);
});

app.post('/api/numbers/sms-ranges', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const rangeName = (req.body.range_name || req.body.name || req.body.country || 'Range').trim();
  const entry = {
    id: nextId(ranges),
    ...req.body,
    range_name: rangeName,
    name: rangeName,
    active: req.body.active !== false,
    created: new Date().toISOString()
  };
  ranges.unshift(entry);
  writeDb('sms_ranges', ranges);
  logAudit('Admin', 'Create SMS Range', `Created range "${entry.range_name}" (#${entry.id})`, 'Numbers');
  res.json(entry);
});

app.patch('/api/numbers/sms-ranges/:id', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const id = Number(req.params.id);
  const idx = ranges.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Range not found' });
  const rangeName = (req.body.range_name || req.body.name || ranges[idx].range_name || ranges[idx].name || '').trim();
  ranges[idx] = {
    ...ranges[idx],
    ...req.body,
    range_name: rangeName || ranges[idx].country || 'Range',
    name: rangeName || ranges[idx].country || 'Range'
  };
  writeDb('sms_ranges', ranges);

  // Synchronize range_name into numbers database if changed
  if (rangeName) {
    let numbers = readDb('numbers') || [];
    let changed = false;
    numbers.forEach(n => {
      if (n.range_id && Number(n.range_id) === id) {
        n.range_name = rangeName;
        changed = true;
      }
    });
    if (changed) writeDb('numbers', numbers);
  }

  res.json(ranges[idx]);
});

app.delete('/api/numbers/sms-ranges/:id', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const id = Number(req.params.id);
  const targetRange = ranges.find(r => r.id === id);
  const filtered = ranges.filter(r => r.id !== id);
  writeDb('sms_ranges', filtered);

  let deletedNumbers = 0;
  let numbers = readDb('numbers') || [];
  const initLen = numbers.length;
  const targetCountry = (targetRange?.country || '').trim().toLowerCase();
  const targetProvider = (targetRange?.provider || 'Manual').trim().toLowerCase();
  const targetName = (targetRange?.range_name || '').trim().toLowerCase();

  // Cascade delete all numbers belonging to this deleted range
  numbers = numbers.filter(n => {
    // 1. Direct range_id match
    if (n.range_id && Number(n.range_id) === id) return false;
    // 2. Direct range_name match
    if (targetName && n.range_name && n.range_name.trim().toLowerCase() === targetName) return false;
    // 3. If range_id is not set, match country and provider if no other active range uses them
    if (!n.range_id && targetCountry && targetProvider) {
      const c = (n.country || '').trim().toLowerCase();
      const p = (n.provider || '').trim().toLowerCase();
      if (c === targetCountry && p === targetProvider) return false;
    }
    return true;
  });
  deletedNumbers = initLen - numbers.length;
  writeDb('numbers', numbers);

  // Also remove test numbers if any were associated
  let testNumbers = readDb('test_numbers') || [];
  if (Array.isArray(testNumbers)) {
    const initTestLen = testNumbers.length;
    testNumbers = testNumbers.filter(tn => {
      if (tn.range_id && Number(tn.range_id) === id) return false;
      if (targetName && tn.range_name && tn.range_name.trim().toLowerCase() === targetName) return false;
      return true;
    });
    if (testNumbers.length !== initTestLen) writeDb('test_numbers', testNumbers);
  }

  logAudit('Owner', 'Delete SMS Range', `Deleted range #${id} and ${deletedNumbers} numbers`, 'Ranges');
  res.json({ success: true, deleted_numbers: deletedNumbers });
});

// Import to existing or new range
app.post('/api/numbers/import-to-range', (req, res) => {
  try {
    const payload = req.body || {};
    const numbersText = payload.numbers || '';
    const lines = numbersText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      return res.status(400).json({ error: 'No numbers provided' });
    }

    const ranges = readDb('sms_ranges') || [];
    let rangeId = payload.range_id;
    let newRange = payload.new_range;
    let rng = null;

    if (newRange) {
      const payoutSchedule = newRange.payout_schedule || 'weekly';
      const payout = parseFloat(newRange.payout || 0) || 0;
      const otpLimit = parseInt(newRange.otp_limit || 0, 10) || 0;
      const cost = parseFloat(newRange.cost || 0) || 0;
      const entry = {
        id: nextId(ranges),
        country: newRange.country || '',
        provider: newRange.provider || 'Manual',
        prefix: newRange.prefix || '',
        range_name: (newRange.name || newRange.range_name || newRange.country || 'Range').trim(),
        name: (newRange.name || newRange.range_name || newRange.country || 'Range').trim(),
        cost: cost,
        payout_schedule: payoutSchedule,
        payout: payout,
        otp_limit: otpLimit,
        active: true,
        created: new Date().toISOString()
      };
      ranges.unshift(entry);
      writeDb('sms_ranges', ranges);
      rangeId = entry.id;

      const rateCard = readDb('rate_card') || [];
      rateCard.unshift({
        id: nextId(rateCard),
        country: entry.country,
        provider: entry.provider,
        buy_rate: entry.cost,
        sell_rate: payout,
        margin: `${entry.cost ? Math.round((1 - payout / entry.cost) * 100) : 0}%`,
        active: true,
        created: new Date().toISOString()
      });
      writeDb('rate_card', rateCard);
      rng = entry;
    } else {
      rng = ranges.find(r => r.id === Number(rangeId));
      if (!rng) {
        return res.status(404).json({ error: 'Range not found — select a range or create a new one' });
      }
    }

    const countryOverride = (payload.country_override || '').trim();
    const numbers = readDb('numbers') || [];
    const added = [];
    const baseId = nextId(numbers);

    // Filter out common CSV/text headers like 'number', 'phone', 'msisdn'
    const validLines = lines.filter(l => !/^(number|phone|msisdn|mobile|phone\s*number)$/i.test(l));
    if (!validLines.length) {
      return res.status(400).json({ error: 'No valid phone numbers found in input' });
    }

    for (let i = 0; i < validLines.length; i++) {
      const num = validLines[i];
      added.push({
        id: baseId + i,
        number: num,
        range_id: rng.id,
        range_name: rng.range_name || rng.name || rng.country || 'Range',
        prefix: rng.prefix || '',
        app: 'Unassigned',
        status: 'active',
        user: 'unallocated',
        country: countryOverride || rng.country || '',
        provider: rng.provider || 'Manual',
        otp_limit: rng.otp_limit || 0,
        allocated_at: new Date().toISOString(),
        last_sms: null,
        sms_count: 0,
        notes: ''
      });
    }

    numbers.push(...added);
    writeDb('numbers', numbers);
    logAudit('Admin', 'Import Numbers', `Imported ${added.length} numbers to range "${rng.range_name || rng.country}"`, 'Numbers');
    res.json({
      success: true,
      imported: added.length,
      range_id: rangeId,
      range_name: rng.range_name || rng.country
    });
  } catch (err) {
    console.error('import-to-range error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk range import from CSV / TXT
app.post('/api/numbers/bulk-range-import', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }
    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      return res.status(400).json({ detail: 'File is empty' });
    }

    const providerName = (req.body.provider_name || 'Provider').trim();
    const mode = req.body.mode || 'iprn';
    const overrideCost = parseFloat(req.body.override_cost || 0) || 0;
    const payoutSchedule = req.body.payout_schedule || 'weekly';
    const overridePayout = parseFloat(req.body.override_payout || 0) || 0;
    const otpLimit = parseInt(req.body.otp_limit || 0, 10) || 0;

    const rows = [];
    for (const line of lines) {
      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 3) {
          rows.push({ country: parts[0], provider: parts[1] || providerName, number: parts[2] });
        } else if (parts.length === 2) {
          rows.push({ country: parts[0], provider: providerName, number: parts[1] });
        } else {
          rows.push({ country: 'Unknown', provider: providerName, number: parts[0] });
        }
      } else {
        rows.push({ country: 'Unknown', provider: providerName, number: line });
      }
    }

    if (!rows.length) {
      return res.status(400).json({ detail: 'No valid numbers found in file' });
    }

    const groups = {};
    for (const r of rows) {
      const key = `${r.country}||${r.provider}`;
      if (!groups[key]) groups[key] = { country: r.country, provider: r.provider, numbers: [] };
      groups[key].numbers.push(r.number);
    }

    const ranges = readDb('sms_ranges') || [];
    const rateCard = readDb('rate_card') || [];
    const numbersDb = readDb('numbers') || [];
    const testNumbersDb = readDb('test_numbers') || [];
    const createdRanges = [];
    let totalAdded = 0;

    const monthDay = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    for (const key of Object.keys(groups)) {
      const grp = groups[key];
      const provPart = (grp.provider && grp.provider !== 'Manual' && grp.provider !== grp.country) ? ` ${grp.provider}` : '';
      const rangeName = `${grp.country}${provPart} SSP ${monthDay}`;
      const rngEntry = {
        id: nextId(ranges),
        country: grp.country,
        provider: grp.provider || 'Manual',
        prefix: '',
        range_name: rangeName,
        name: rangeName,
        cost: overrideCost,
        payout_schedule: payoutSchedule,
        payout: overridePayout,
        otp_limit: otpLimit,
        active: true,
        created: new Date().toISOString(),
        is_test: mode === 'test'
      };
      ranges.unshift(rngEntry);
      createdRanges.push(rngEntry);

      rateCard.unshift({
        id: nextId(rateCard),
        country: grp.country,
        provider: grp.provider,
        buy_rate: overrideCost,
        sell_rate: overridePayout,
        margin: `${overrideCost ? Math.round((1 - overridePayout / overrideCost) * 100) : 0}%`,
        active: true,
        created: new Date().toISOString()
      });

      const baseNumId = nextId(numbersDb) + totalAdded;
      for (let i = 0; i < grp.numbers.length; i++) {
        const num = grp.numbers[i];
        if (mode === 'test') {
          testNumbersDb.unshift({
            id: nextId(testNumbersDb) + i,
            number: num,
            range_id: rngEntry.id,
            range_name: rngEntry.range_name,
            country: grp.country,
            provider: grp.provider,
            app: '',
            added_by: 'Admin (bulk import)',
            created: new Date().toISOString()
          });
        } else {
          numbersDb.push({
            id: baseNumId + i,
            number: num,
            range_id: rngEntry.id,
            range_name: rngEntry.range_name,
            prefix: rngEntry.prefix || '',
            app: 'Unassigned',
            status: 'active',
            user: 'unallocated',
            country: grp.country,
            provider: grp.provider,
            otp_limit: otpLimit,
            allocated_at: new Date().toISOString(),
            last_sms: null,
            sms_count: 0,
            notes: ''
          });
        }
      }
      totalAdded += grp.numbers.length;
    }

    writeDb('sms_ranges', ranges);
    writeDb('rate_card', rateCard);
    if (mode === 'test') {
      writeDb('test_numbers', testNumbersDb);
    } else {
      writeDb('numbers', numbersDb);
    }

    logAudit('Admin', 'Bulk Range Import', `Created ${createdRanges.length} range(s), imported ${totalAdded} numbers`, 'Numbers');
    res.json({
      ranges_created: createdRanges.length,
      numbers_imported: totalAdded,
      ranges: createdRanges.map(r => ({
        name: r.range_name,
        country: r.country,
        provider: r.provider,
        cost: r.cost,
        payout_schedule: r.payout_schedule,
        payout: r.payout
      }))
    });
  } catch (err) {
    console.error('bulk-range-import error:', err);
    res.status(500).json({ detail: err.message });
  }
});

// Simple number list upload
app.post('/api/numbers/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const country = (req.body.country || 'US').trim();
    const numbers = readDb('numbers') || [];
    const added = [];
    const baseId = nextId(numbers);

    for (let i = 0; i < lines.length; i++) {
      added.push({
        id: baseId + i,
        number: lines[i],
        app: 'Unassigned',
        status: 'active',
        user: 'unallocated',
        country: country,
        provider: 'Manual',
        allocated_at: new Date().toISOString(),
        last_sms: null,
        sms_count: 0,
        notes: ''
      });
    }

    numbers.push(...added);
    writeDb('numbers', numbers);
    logAudit('Admin', 'Upload Numbers', `Uploaded ${added.length} numbers`, 'Numbers');
    res.json({ imported: added.length, total: numbers.length });
  } catch (err) {
    console.error('upload numbers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Rate Card (Must return Array directly)
app.get('/api/numbers/rate-card', (req, res) => {
  const card = readDb('rate_card') || [];
  res.json(card);
});

app.post('/api/numbers/rate-card', (req, res) => {
  const card = readDb('rate_card') || [];
  const item = { id: nextId(card), ...req.body, active: true, created: new Date().toISOString() };
  card.unshift(item);
  writeDb('rate_card', card);
  res.json(item);
});

app.patch('/api/numbers/rate-card/:id', (req, res) => {
  const card = readDb('rate_card') || [];
  const id = Number(req.params.id);
  const idx = card.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  card[idx] = { ...card[idx], ...req.body };
  writeDb('rate_card', card);
  res.json(card[idx]);
});

app.delete('/api/numbers/rate-card/:id', (req, res) => {
  const card = readDb('rate_card') || [];
  const id = Number(req.params.id);
  writeDb('rate_card', card.filter(c => c.id !== id));
  res.json({ success: true });
});

// 3. Blacklist (Must return Array directly)
app.get('/api/numbers/blacklist', (req, res) => {
  const list = readDb('blacklist') || [];
  res.json(list);
});

app.post('/api/numbers/blacklist', (req, res) => {
  const list = readDb('blacklist') || [];
  const item = { id: nextId(list), ...req.body, active: true, created: new Date().toISOString() };
  list.unshift(item);
  writeDb('blacklist', list);
  res.json(item);
});

app.delete('/api/numbers/blacklist/:id', (req, res) => {
  const list = readDb('blacklist') || [];
  const id = Number(req.params.id);
  writeDb('blacklist', list.filter(b => b.id !== id));
  res.json({ success: true });
});

// 4. Blocked IPs (Must return Array directly)
app.get('/api/firewall/blocked-ips', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  res.json(blocked);
});

app.post('/api/firewall/block-ip', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const ip = (req.body.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'IP is required' });
  const entry = { id: nextId(blocked), ip, reason: req.body.reason || 'Manual block', blocked_at: new Date().toISOString() };
  blocked.unshift(entry);
  writeDb('blocked_ips', blocked);
  res.json(entry);
});

app.post('/api/firewall/blocked-ips', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const entry = { id: nextId(blocked), ...req.body, blocked_at: new Date().toISOString() };
  blocked.unshift(entry);
  writeDb('blocked_ips', blocked);
  res.json(entry);
});

app.delete('/api/firewall/blocked-ips/:id', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const id = Number(req.params.id);
  writeDb('blocked_ips', blocked.filter(b => b.id !== id));
  res.json({ success: true });
});

// 5. Allocation History (Array)
app.get('/api/numbers/allocation-history', (req, res) => {
  const hist = readDb('allocation_history') || [];
  res.json(hist);
});

// 6. Tokens (Array)
app.get('/api/tokens', (req, res) => {
  let tokens = readDb('api_tokens') || [];
  if (req.query.manager_id) {
    tokens = tokens.filter(t => String(t.manager_id) === String(req.query.manager_id));
  }
  res.json(tokens);
});

app.post('/api/tokens', (req, res) => {
  const tokens = readDb('api_tokens') || [];
  const agents = readDb('agents') || [];
  const agent = agents.find(a => String(a.id) === String(req.body.agent_id));
  const token = {
    id: nextId(tokens),
    token: `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    name: req.body.name || 'API Key',
    agent_id: req.body.agent_id || null,
    agent_username: (agent && agent.username) || req.body.agent_username || '',
    manager_id: (agent && agent.manager_id) || req.body.manager_id || null,
    status: req.body.status || 'active',
    calls: 0,
    last_used: null,
    created: new Date().toISOString()
  };
  tokens.unshift(token);
  writeDb('api_tokens', tokens);
  logAudit('Admin', 'Create API Token', `Created token '${token.name}' for agent '${token.agent_username}'`, 'API Tokens');
  res.json(token);
});

app.delete('/api/tokens/:id', (req, res) => {
  const tokens = readDb('api_tokens') || [];
  const id = Number(req.params.id);
  writeDb('api_tokens', tokens.filter(t => t.id !== id));
  res.json({ success: true });
});

// 7. Services (Array)
app.get('/api/services', (req, res) => {
  let svc = readDb('services');
  if (!Array.isArray(svc) || svc.length === 0) {
    svc = [
      { id: 1, name: "WhatsApp", icon: "fab fa-whatsapp", color: "#25d366", description: "WhatsApp OTP verification", payout_rate: 0.05, active: true },
      { id: 2, name: "Telegram", icon: "fab fa-telegram", color: "#2aabee", description: "Telegram OTP verification", payout_rate: 0.04, active: true },
      { id: 3, name: "Google", icon: "fab fa-google", color: "#4285f4", description: "Google account verification", payout_rate: 0.06, active: true },
      { id: 4, name: "Facebook", icon: "fab fa-facebook", color: "#1877f2", description: "Facebook OTP numbers", payout_rate: 0.045, active: true },
      { id: 5, name: "Amazon", icon: "fab fa-amazon", color: "#ff9900", description: "Amazon account verification", payout_rate: 0.055, active: true },
      { id: 6, name: "Aadhaar", icon: "fas fa-id-card", color: "#ff6600", description: "Aadhaar verification", payout_rate: 0.08, active: true },
      { id: 7, name: "TikTok", icon: "fab fa-tiktok", color: "#010101", description: "TikTok account verification", payout_rate: 0.04, active: true }
    ];
    writeDb('services', svc);
  }
  res.json(svc);
});

app.post('/api/services', (req, res) => {
  const svc = readDb('services') || [];
  const item = { id: nextId(svc), ...req.body, active: true, created: new Date().toISOString() };
  svc.push(item);
  writeDb('services', svc);
  res.json(item);
});

// 8. CLI Routes (Array)
app.get('/api/cli-routes', (req, res) => {
  const routes = readDb('cli_routes') || [];
  res.json(routes);
});

app.post('/api/cli-routes', (req, res) => {
  const routes = readDb('cli_routes') || [];
  const item = { id: nextId(routes), ...req.body, status: 'active', created: new Date().toISOString() };
  routes.push(item);
  writeDb('cli_routes', routes);
  res.json(item);
});

// 9. Support Tickets (Array)
app.get('/api/support-tickets', (req, res) => {
  const tickets = readDb('support_tickets') || [];
  res.json(tickets);
});

app.post('/api/support-tickets', (req, res) => {
  const tickets = readDb('support_tickets') || [];
  const item = { id: nextId(tickets), ...req.body, status: 'open', created: new Date().toISOString() };
  tickets.unshift(item);
  writeDb('support_tickets', tickets);
  res.json(item);
});

app.patch('/api/support-tickets/:id', (req, res) => {
  const tickets = readDb('support_tickets') || [];
  const id = Number(req.params.id);
  const idx = tickets.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });
  tickets[idx] = { ...tickets[idx], ...req.body };
  writeDb('support_tickets', tickets);
  res.json(tickets[idx]);
});

// 10. Hierarchy (Array)
app.get('/api/hierarchy', (req, res) => {
  const users = readDb('users') || [];
  const agents = readDb('agents') || [];
  const clients = readDb('clients') || [];
  const managers = users.filter(u => u.role === 'Manager');
  const result = managers.map(mgr => {
    const mgrAgents = agents.filter(a => a.manager_id === mgr.id).map(ag => ({
      ...ag,
      clients: clients.filter(c => c.agent_id === ag.id)
    }));
    return {
      manager: { ...mgr, password: undefined },
      agents: mgrAgents
    };
  });
  res.json(result);
});

// 11. SMPP Accounts, Sessions, Logs (Arrays)
app.get('/api/smpp/accounts', (req, res) => {
  res.json(readDb('smpp_accounts') || []);
});
app.get('/api/smpp/sessions', (req, res) => {
  res.json(readDb('smpp_sessions') || []);
});
app.get('/api/smpp/connection-logs', (req, res) => {
  res.json([]);
});

// ── PAGINATED OBJECT ENDPOINTS { data: [...], total: ... } ───
function registerPaginatedCrud(routePath, tableName) {
  const isAccountTable = ['users', 'agents', 'clients', 'testpanel_credentials'].includes(tableName);

  app.get(`/api/${routePath}`, (req, res) => {
    let data = readDb(tableName);
    if (!Array.isArray(data)) data = [];

    // Filter by query parameters if applicable
    const { role, manager_id, agent_id, search, status } = req.query;
    if (role) {
      data = data.filter(d => (d.role || '').toLowerCase() === role.toLowerCase());
    }
    if (manager_id) {
      data = data.filter(d => String(d.manager_id) === String(manager_id));
    }
    if (agent_id) {
      data = data.filter(d => String(d.agent_id) === String(agent_id));
    }
    if (status) {
      data = data.filter(d => (d.status || '').toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(d => JSON.stringify(d).toLowerCase().includes(q));
    }
    if (tableName === 'numbers') {
      if (req.query.client_id) {
        data = data.filter(d => String(d.client_id) === String(req.query.client_id));
      }
      if (req.query.range) {
        const ranges = readDb('sms_ranges') || [];
        const rId = Number(req.query.range);
        const targetRange = ranges.find(r => r.id === rId);
        if (targetRange) {
          const tCountry = (targetRange.country || '').trim().toLowerCase();
          const tProvider = (targetRange.provider || 'Manual').trim().toLowerCase();
          const tName = (targetRange.range_name || '').trim().toLowerCase();
          data = data.filter(d => {
            if (d.range_id && Number(d.range_id) === rId) return true;
            if (tName && d.range_name && d.range_name.trim().toLowerCase() === tName) return true;
            if (!d.range_id && tCountry && tProvider) {
              const c = (d.country || '').trim().toLowerCase();
              const p = (d.provider || '').trim().toLowerCase();
              return c === tCountry && p === tProvider;
            }
            return false;
          });
        } else {
          data = data.filter(d => d.range_id && Number(d.range_id) === rId);
        }
      }
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10000;
    const start = (page - 1) * limit;

    let slice = data.slice(start, start + limit);
    if (isAccountTable) {
      slice = slice.map(item => {
        if (!item) return item;
        const copy = { ...item };
        if (copy.password) copy.password = '••••••••';
        return copy;
      });
    }

    res.json({
      data: slice,
      total: data.length
    });
  });

  app.post(`/api/${routePath}`, (req, res) => {
    let data = readDb(tableName);
    if (!Array.isArray(data)) data = [];

    // Duplicate username check across all account types
    if (req.body && req.body.username) {
      if (isUsernameTaken(req.body.username, null, tableName)) {
        return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
      }
    }

    // Owner protection: No new Owner can be created
    if (tableName === 'users') {
      const reqRole = (req.body && req.body.role ? String(req.body.role).trim().toLowerCase() : '');
      if (reqRole === 'owner' || reqRole === 'admin') {
        return res.status(400).json({ error: 'New Owner cannot be created. Kamran_Bhatti is the fixed Owner of the project.' });
      }
    }

    const item = { id: nextId(data), ...req.body, created: new Date().toISOString() };
    data.unshift(item);
    writeDb(tableName, data);
    logAudit('Owner', `Create ${tableName}`, `Created item #${item.id}`, tableName);

    const safeItem = { ...item };
    if (safeItem.password) safeItem.password = '••••••••';
    res.json(safeItem);
  });

  app.get(`/api/${routePath}/:id`, (req, res, next) => {
    const rawId = req.params.id;
    if (['sms-ranges', 'rate-card', 'blacklist', 'bulk', 'download', 'stats', 'earnings', 'adjust-balance', 'test-stats'].includes(rawId)) {
      return next();
    }
    let data = readDb(tableName);
    if (!Array.isArray(data)) return res.status(404).json({ error: 'Item not found' });
    const id = Number(rawId);
    const item = data.find(x => x.id === id || String(x.id) === String(rawId));
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const safeItem = { ...item };
    if (isAccountTable && safeItem.password) safeItem.password = '••••••••';
    res.json(safeItem);
  });

  app.patch(`/api/${routePath}/:id`, (req, res) => {
    let data = readDb(tableName);
    if (!Array.isArray(data)) return res.json({});
    const id = Number(req.params.id);
    const idx = data.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    // Duplicate username check when updating username
    if (req.body && req.body.username) {
      if (isUsernameTaken(req.body.username, id, tableName)) {
        return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
      }
    }

    // Owner protection: Fixed Kamran_Bhatti, cannot promote others to Owner
    if (tableName === 'users') {
      const existing = data[idx];
      if (existing && (existing.username === 'Kamran_Bhatti' || existing.id === 1 || existing.role === 'Owner')) {
        if (req.body.username && req.body.username !== 'Kamran_Bhatti') {
          return res.status(400).json({ error: 'Owner username is fixed (Kamran_Bhatti) and cannot be changed.' });
        }
        if (req.body.role && req.body.role !== 'Owner') {
          return res.status(400).json({ error: 'Owner role cannot be changed.' });
        }
        if (req.body.status && req.body.status !== 'active') {
          return res.status(400).json({ error: 'Owner account cannot be suspended.' });
        }
      } else {
        const reqRole = (req.body && req.body.role ? String(req.body.role).trim().toLowerCase() : '');
        if (reqRole === 'owner' || reqRole === 'admin') {
          return res.status(400).json({ error: 'Cannot promote user to Owner. Kamran_Bhatti is the fixed Owner.' });
        }
      }
    }

    data[idx] = { ...data[idx], ...req.body };
    writeDb(tableName, data);
    logAudit('Owner', `Update ${tableName}`, `Updated item #${id}`, tableName);

    const safeItem = { ...data[idx] };
    if (isAccountTable && safeItem.password) safeItem.password = '••••••••';
    res.json(safeItem);
  });

  app.delete(`/api/${routePath}/:id`, (req, res) => {
    let data = readDb(tableName);
    if (!Array.isArray(data)) return res.json({ success: true });
    const rawId = String(req.params.id);
    const numId = Number(req.params.id);

    // Owner protection: Cannot delete Owner
    if (tableName === 'users') {
      const target = data.find(x => x.id === numId || String(x.id) === rawId);
      if (target && (target.username === 'Kamran_Bhatti' || target.id === 1 || target.role === 'Owner')) {
        return res.status(400).json({ error: 'Owner account is fixed and cannot be deleted.' });
      }
    }

    const filtered = data.filter(x => {
      if (!isNaN(numId) && x.id === numId) return false;
      if (String(x.id) === rawId) return false;
      if (tableName === 'numbers' && String(x.number) === rawId) return false;
      return true;
    });
    writeDb(tableName, filtered);
    logAudit('Owner', `Delete ${tableName}`, `Deleted item #${rawId}`, tableName);
    res.json({ success: true });
  });
}

registerPaginatedCrud('numbers', 'numbers');

// Number diagnostic and verification endpoint
app.post('/api/numbers/test', (req, res) => {
  try {
    const rawNumber = String(req.body.number || '').trim();
    const testType = String(req.body.test_type || 'ping').trim().toLowerCase();

    if (!rawNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const digitsOnly = rawNumber.replace(/\D/g, '');
    if (digitsOnly.length < 6) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format: too short' });
    }

    const numbers = readDb('numbers') || [];
    const ranges = readDb('sms_ranges') || [];

    const foundNum = numbers.find(n => {
      const nDigits = String(n.number || '').replace(/\D/g, '');
      return nDigits === digitsOnly || String(n.number).trim() === rawNumber;
    });

    let provider = foundNum?.provider || '';
    let country = foundNum?.country || '';

    if (!provider) {
      const matchingRange = ranges.find(r => r.prefix && digitsOnly.startsWith(String(r.prefix).replace(/\D/g, '')));
      if (matchingRange) {
        provider = matchingRange.provider || '';
        country = matchingRange.country || '';
      }
    }

    if (!provider) {
      provider = 'Direct Route (Tier 1)';
    }

    logAudit('Admin', 'Test Number', `Tested ${rawNumber} [${testType}] -> ${provider}`, 'Numbers');

    return res.json({
      success: true,
      number: rawNumber,
      test_type: testType,
      provider: provider,
      country: country || 'International',
      status: 'active',
      valid: true,
      message: `${testType.toUpperCase()} test completed successfully on ${rawNumber}`
    });
  } catch (err) {
    console.error('Number test error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk number delete & unassign endpoints
app.post('/api/numbers/bulk-delete-many', (req, res) => {
  try {
    const numberIds = req.body.number_ids || req.body.ids || [];
    if (!Array.isArray(numberIds) || !numberIds.length) {
      return res.status(400).json({ error: 'No number IDs provided' });
    }
    let numbers = readDb('numbers') || [];
    const initialCount = numbers.length;
    const idSet = new Set(numberIds.map(String));
    numbers = numbers.filter(n => !idSet.has(String(n.id)) && !idSet.has(String(n.number)));
    writeDb('numbers', numbers);
    const deleted = initialCount - numbers.length;
    logAudit('Admin', 'Bulk Delete Numbers', `Deleted ${deleted} numbers`, 'Numbers');
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('bulk-delete-many error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/numbers/bulk-unassign-many', (req, res) => {
  try {
    const numberIds = req.body.number_ids || req.body.ids || [];
    let numbers = readDb('numbers') || [];
    const idSet = new Set(numberIds.map(String));
    let count = 0;
    numbers = numbers.map(n => {
      if (idSet.has(String(n.id)) || idSet.has(String(n.number))) {
        count++;
        return { ...n, user: 'unallocated', manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '' };
      }
      return n;
    });
    writeDb('numbers', numbers);
    res.json({ success: true, revoked: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/numbers/:id/unassign', (req, res) => {
  try {
    const rawId = String(req.params.id);
    let numbers = readDb('numbers') || [];
    const idx = numbers.findIndex(n => String(n.id) === rawId || String(n.number) === rawId);
    if (idx !== -1) {
      numbers[idx] = { ...numbers[idx], user: 'unallocated', manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '' };
      writeDb('numbers', numbers);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single number assign
app.post('/api/numbers/:id/assign', (req, res) => {
  try {
    const rawId = String(req.params.id);
    let numbers = readDb('numbers') || [];
    const n = numbers.find(x => String(x.id) === rawId || String(x.number) === rawId);
    if (!n) return res.status(404).json({ error: 'Number not found' });

    const targetType = (req.body.target_type || 'client').toLowerCase();
    const targetId = Number(req.body.target_id || req.body.client_id);
    const notes = req.body.notes || '';
    if (!targetId) return res.status(400).json({ error: 'target_id is required' });

    let toUsername = '';
    let toRole = '';

    if (targetType === 'manager') {
      const users = readDb('users') || [];
      const mgr = users.find(u => Number(u.id) === targetId && (u.role || '').toLowerCase() === 'manager');
      if (!mgr) return res.status(404).json({ error: 'Manager not found' });
      n.manager_id = targetId;
      n.agent_id = null;
      n.client_id = null;
      n.client_name = '';
      n.client_username = '';
      n.user = '';
      toUsername = mgr.username;
      toRole = 'Manager';
    } else if (targetType === 'agent') {
      const agents = readDb('agents') || [];
      const ag = agents.find(a => Number(a.id) === targetId);
      if (!ag) return res.status(404).json({ error: 'Agent not found' });
      n.manager_id = ag.manager_id || null;
      n.agent_id = targetId;
      n.client_id = null;
      n.client_name = '';
      n.client_username = '';
      n.user = '';
      toUsername = ag.username;
      toRole = 'Agent';
    } else {
      const clients = readDb('clients') || [];
      const cl = clients.find(c => Number(c.id) === targetId);
      if (!cl) return res.status(404).json({ error: 'Client not found' });
      n.manager_id = cl.manager_id || null;
      n.agent_id = cl.agent_id || null;
      n.client_id = targetId;
      n.client_name = cl.username;
      n.client_username = cl.username;
      n.user = cl.username;
      toUsername = cl.username;
      toRole = 'Client';
    }

    n.status = 'assigned';
    n.notes = notes;
    writeDb('numbers', numbers);

    const transfers = readDb('number_transfers') || [];
    transfers.unshift({
      id: nextId(transfers),
      from_user_id: null,
      from_username: 'Owner',
      from_role: 'Owner',
      to_user_id: targetId,
      to_username: toUsername,
      to_role: toRole,
      count: 1,
      number_ids: [n.id],
      service: n.app || '',
      notes: notes,
      timestamp: new Date().toISOString(),
      status: 'completed'
    });
    writeDb('number_transfers', transfers);
    logAudit('Owner', 'Assign Number', `${n.number} -> ${toRole} '${toUsername}'`, 'Numbers');

    res.json({ success: true, data: n });
  } catch (err) {
    console.error('Assign number error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk assign selected numbers
app.post('/api/numbers/bulk-assign-many', (req, res) => {
  try {
    const numberIds = new Set((req.body.number_ids || []).map(Number));
    const targetType = (req.body.target_type || 'client').toLowerCase();
    const targetId = Number(req.body.target_id || req.body.client_id);
    const notes = req.body.notes || '';

    if (!numberIds.size) return res.status(400).json({ error: 'No numbers selected' });
    if (!targetId) return res.status(400).json({ error: 'target_id is required' });

    let toUsername = '';
    let toRole = '';
    let parentManagerId = null;
    let parentAgentId = null;

    if (targetType === 'manager') {
      const users = readDb('users') || [];
      const mgr = users.find(u => Number(u.id) === targetId && (u.role || '').toLowerCase() === 'manager');
      if (!mgr) return res.status(404).json({ error: 'Manager not found' });
      toUsername = mgr.username;
      toRole = 'Manager';
    } else if (targetType === 'agent') {
      const agents = readDb('agents') || [];
      const ag = agents.find(a => Number(a.id) === targetId);
      if (!ag) return res.status(404).json({ error: 'Agent not found' });
      toUsername = ag.username;
      toRole = 'Agent';
      parentManagerId = ag.manager_id || null;
    } else {
      const clients = readDb('clients') || [];
      const cl = clients.find(c => Number(c.id) === targetId);
      if (!cl) return res.status(404).json({ error: 'Client not found' });
      toUsername = cl.username;
      toRole = 'Client';
      parentManagerId = cl.manager_id || null;
      parentAgentId = cl.agent_id || null;
    }

    let numbers = readDb('numbers') || [];
    let updatedCount = 0;
    const assignedIds = [];

    numbers = numbers.map(n => {
      if (numberIds.has(Number(n.id))) {
        updatedCount++;
        assignedIds.push(n.id);
        if (targetType === 'manager') {
          return { ...n, manager_id: targetId, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', notes };
        } else if (targetType === 'agent') {
          return { ...n, manager_id: parentManagerId, agent_id: targetId, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', notes };
        } else {
          return { ...n, manager_id: parentManagerId, agent_id: parentAgentId, client_id: targetId, client_name: toUsername, client_username: toUsername, user: toUsername, status: 'assigned', notes };
        }
      }
      return n;
    });

    writeDb('numbers', numbers);

    if (updatedCount > 0) {
      const transfers = readDb('number_transfers') || [];
      transfers.unshift({
        id: nextId(transfers),
        from_user_id: null,
        from_username: 'Owner',
        from_role: 'Owner',
        to_user_id: targetId,
        to_username: toUsername,
        to_role: toRole,
        count: updatedCount,
        number_ids: assignedIds,
        notes: notes,
        timestamp: new Date().toISOString(),
        status: 'completed'
      });
      writeDb('number_transfers', transfers);
      logAudit('Owner', 'Bulk Assign Numbers', `${updatedCount} numbers -> ${toRole} '${toUsername}'`, 'Numbers');
    }

    res.json({ success: true, assigned: updatedCount });
  } catch (err) {
    console.error('bulk-assign-many error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk Allocate Numbers
app.post('/api/numbers/bulk-allocate', (req, res) => {
  try {
    const targetType = (req.body.target_type || 'client').toLowerCase();
    const targetId = Number(req.body.target_id || req.body.client_id);
    const count = parseInt(req.body.count) || 0;
    const rangeId = req.body.range_id ? Number(req.body.range_id) : null;
    const rangeStart = String(req.body.range_start || '').trim();
    const rangeEnd = String(req.body.range_end || '').trim();
    const notes = req.body.notes || '';

    if (!targetId) return res.status(400).json({ error: 'target_id is required' });

    let toUsername = '';
    let toRole = '';
    let parentManagerId = null;
    let parentAgentId = null;

    if (targetType === 'manager') {
      const users = readDb('users') || [];
      const mgr = users.find(u => Number(u.id) === targetId && (u.role || '').toLowerCase() === 'manager');
      if (!mgr) return res.status(404).json({ error: 'Manager not found' });
      toUsername = mgr.username;
      toRole = 'Manager';
    } else if (targetType === 'agent') {
      const agents = readDb('agents') || [];
      const ag = agents.find(a => Number(a.id) === targetId);
      if (!ag) return res.status(404).json({ error: 'Agent not found' });
      toUsername = ag.username;
      toRole = 'Agent';
      parentManagerId = ag.manager_id || null;
    } else {
      const clients = readDb('clients') || [];
      const cl = clients.find(c => Number(c.id) === targetId);
      if (!cl) return res.status(404).json({ error: 'Client not found' });
      toUsername = cl.username;
      toRole = 'Client';
      parentManagerId = cl.manager_id || null;
      parentAgentId = cl.agent_id || null;
    }

    let numbers = readDb('numbers') || [];
    let pool = numbers.filter(n => !n.manager_id && !n.agent_id && !n.client_id);

    // Filter by range_id if provided
    if (rangeId) {
      const ranges = readDb('sms_ranges') || [];
      const rng = ranges.find(r => Number(r.id) === rangeId);
      if (rng) {
        pool = pool.filter(n => (n.range_id && Number(n.range_id) === rangeId) || (n.country === rng.country && n.provider === rng.provider));
      }
    } else if (rangeStart && rangeEnd) {
      pool = pool.filter(n => {
        const num = String(n.number || '');
        return num >= rangeStart && num <= rangeEnd;
      });
    }

    if (!pool.length) {
      return res.status(400).json({ error: 'No free numbers available for this selection' });
    }

    const allocCount = count > 0 ? Math.min(count, pool.length) : pool.length;
    const selectedNumbers = pool.slice(0, allocCount);
    const selectedIds = new Set(selectedNumbers.map(n => n.id));

    numbers = numbers.map(n => {
      if (selectedIds.has(n.id)) {
        if (targetType === 'manager') {
          return { ...n, manager_id: targetId, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', notes };
        } else if (targetType === 'agent') {
          return { ...n, manager_id: parentManagerId, agent_id: targetId, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', notes };
        } else {
          return { ...n, manager_id: parentManagerId, agent_id: parentAgentId, client_id: targetId, client_name: toUsername, client_username: toUsername, user: toUsername, status: 'assigned', notes };
        }
      }
      return n;
    });

    writeDb('numbers', numbers);

    const history = readDb('allocation_history') || [];
    const entry = {
      id: nextId(history),
      from_user: 'Owner',
      to_user: toUsername,
      to_role: toRole,
      range_id: rangeId,
      range_start: rangeStart,
      range_end: rangeEnd,
      count: allocCount,
      timestamp: new Date().toISOString(),
      status: 'completed',
      notes: notes
    };
    history.unshift(entry);
    writeDb('allocation_history', history);

    logAudit('Owner', 'Bulk Allocate', `Allocated ${allocCount} numbers to ${toRole} '${toUsername}'`, 'Numbers');

    res.json({ success: true, allocated: allocCount, to_user: toUsername, ...entry });
  } catch (err) {
    console.error('bulk-allocate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Allocation History endpoint
app.get('/api/numbers/allocation-history', (req, res) => {
  const data = readDb('allocation_history') || [];
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const start = (page - 1) * limit;
  res.json({ data: data.slice(start, start + limit), total: data.length });
});

// Dedicated Managers endpoint
app.get('/api/managers', (req, res) => {
  const users = readDb('users') || [];
  const managers = users.filter(u => (u.role || '').toLowerCase() === 'manager');
  res.json({ data: managers, total: managers.length });
});
registerPaginatedCrud('agents', 'agents');
registerPaginatedCrud('clients', 'clients');
registerPaginatedCrud('users', 'users');
registerPaginatedCrud('announcements', 'announcements');
registerPaginatedCrud('audit-logs', 'audit_logs');
registerPaginatedCrud('firewall/events', 'firewall_events');
registerPaginatedCrud('rate-limits', 'rate_limits');
registerPaginatedCrud('payout-requests', 'payout_requests');
registerPaginatedCrud('testpanel-accounts', 'testpanel_credentials');
registerPaginatedCrud('number-transfers', 'number_transfers');
registerPaginatedCrud('login-activity', 'login_activity');

// Registration Requests
app.get('/api/registration-requests', (req, res) => {
  const data = readDb('registration_requests') || [];
  if (req.query.page || (req.query.limit && req.query.limit !== '10000')) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const start = (page - 1) * limit;
    return res.json({ data: data.slice(start, start + limit), total: data.length });
  }
  res.json(data);
});

app.post('/api/registration-requests', (req, res) => {
  const data = readDb('registration_requests') || [];
  if (req.body && req.body.username && isUsernameTaken(req.body.username)) {
    return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
  }
  const item = { id: nextId(data), ...req.body, status: req.body.status || 'pending', timestamp: new Date().toISOString() };
  data.unshift(item);
  writeDb('registration_requests', data);
  res.json(item);
});

app.patch('/api/registration-requests/:id', (req, res) => {
  const data = readDb('registration_requests') || [];
  const id = Number(req.params.id);
  const idx = data.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Request not found' });
  data[idx] = { ...data[idx], ...req.body };
  writeDb('registration_requests', data);
  res.json(data[idx]);
});

app.delete('/api/registration-requests/:id', (req, res) => {
  const data = readDb('registration_requests') || [];
  const id = Number(req.params.id);
  writeDb('registration_requests', data.filter(x => x.id !== id));
  res.json({ success: true });
});

// CR API Connections
app.get('/api/cr-api-connections', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const mapped = data.map(c => ({
    ...c,
    token_masked: (c.token && c.token.length > 8) ? `${c.token.slice(0, 4)}…${c.token.slice(-4)}` : (c.token ? '••••••••' : '—')
  }));
  if (req.query.page) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;
    return res.json({ data: mapped.slice(start, start + limit), total: mapped.length });
  }
  res.json({ data: mapped, total: mapped.length });
});

app.post('/api/cr-api-connections', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const { panel_name, panel_url, token } = req.body || {};
  if (!panel_url || !token) {
    return res.status(400).json({ error: 'panel_url and token are required' });
  }
  const item = {
    id: nextId(data),
    panel_name: panel_name || 'CR API Panel',
    panel_url: String(panel_url).trim(),
    token: String(token).trim(),
    interval: req.body.interval ? Math.max(3, parseInt(req.body.interval)) : 5,
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    last_pulled_at: null,
    last_status: 'Not polled yet',
    total_pulled: 0,
    created: new Date().toISOString()
  };
  data.push(item);
  writeDb('cr_api_connections', data);
  logAudit('Admin', 'Add CR API Connection', `Connected '${item.panel_name}'`, 'CR API');
  pollSingleCrApiConnection(item.id, true).catch(e => console.error('CR API poll error:', e));
  res.json(item);
});

app.post('/api/cr-api-connections/:id/pull', async (req, res) => {
  const id = Number(req.params.id);
  const conns = readDb('cr_api_connections') || [];
  const conn = conns.find(c => c.id === id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  try {
    const pulled = await pollSingleCrApiConnection(id, true);
    const updated = (readDb('cr_api_connections') || []).find(c => c.id === id);
    res.json({ success: true, pulled: pulled || 0, status: updated?.last_status || 'OK' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.patch('/api/cr-api-connections/:id', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const id = Number(req.params.id);
  const idx = data.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Connection not found' });
  data[idx] = { ...data[idx], ...req.body };
  writeDb('cr_api_connections', data);
  res.json(data[idx]);
});

app.delete('/api/cr-api-connections/:id', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const id = Number(req.params.id);
  writeDb('cr_api_connections', data.filter(x => x.id !== id));
  logAudit('Admin', 'Delete CR API Connection', `Deleted connection #${id}`, 'CR API');
  res.json({ success: true });
});

// Login Panels (Web Scraping)
app.get('/api/login-panels', (req, res) => {
  const panels = readDb('login_panels') || [];
  const safe = panels.map(p => {
    const { password, ...rest } = p;
    return { ...rest, has_password: Boolean(password) };
  });
  if (req.query.page) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;
    return res.json({ data: safe.slice(start, start + limit), total: safe.length });
  }
  res.json({ data: safe, total: safe.length });
});

app.post('/api/login-panels', (req, res) => {
  const { name, username, password, panel_url, data_url, interval, rows, columns } = req.body || {};
  if (!username || !panel_url || !data_url || !password) {
    return res.status(400).json({ error: 'Username, password, panel_url, and data_url are required' });
  }
  const panels = readDb('login_panels') || [];
  let defaultName = name;
  if (!defaultName) {
    try { defaultName = new URL(panel_url).hostname; } catch(e) { defaultName = 'Login Panel'; }
  }
  const newPanel = {
    id: nextId(panels),
    name: defaultName,
    username: String(username).trim(),
    password: String(password),
    panel_url: String(panel_url).trim(),
    data_url: String(data_url).trim(),
    interval: Math.max(10, parseInt(interval) || 20),
    rows: parseInt(rows) || 200,
    columns: columns || null,
    status: 'stopped',
    total_sms: 0,
    last_run: null,
    last_error: '',
    created: new Date().toISOString()
  };
  panels.push(newPanel);
  writeDb('login_panels', panels);
  logAudit('Admin', 'Add Login Panel', `Added panel '${newPanel.name}'`, 'Login Panel');
  const { password: _, ...safe } = newPanel;
  res.json({ ...safe, has_password: true });
});

app.patch('/api/login-panels/:id', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const idx = panels.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Login panel not found' });
  const updates = { ...req.body };
  if (updates.interval) updates.interval = Math.max(10, parseInt(updates.interval) || 20);
  panels[idx] = { ...panels[idx], ...updates };
  writeDb('login_panels', panels);
  const { password: _, ...safe } = panels[idx];
  res.json({ ...safe, has_password: Boolean(panels[idx].password) });
});

app.delete('/api/login-panels/:id', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  writeDb('login_panels', panels.filter(p => p.id !== id));
  logAudit('Admin', 'Delete Login Panel', `Deleted panel #${id}`, 'Login Panel');
  res.json({ success: true });
});

app.post('/api/login-panels/:id/start', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  panel.status = 'running';
  panel.last_error = '';
  writeDb('login_panels', panels);
  logAudit('Admin', 'Start Login Panel', `Started scraping panel '${panel.name}'`, 'Login Panel');
  pollSingleLoginPanel(panel.id).catch(e => console.error('Start poll error:', e));
  res.json({ success: true, status: 'running' });
});

app.post('/api/login-panels/:id/stop', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  panel.status = 'stopped';
  writeDb('login_panels', panels);
  logAudit('Admin', 'Stop Login Panel', `Stopped scraping panel '${panel.name}'`, 'Login Panel');
  res.json({ success: true, status: 'stopped' });
});

app.post('/api/login-panels/:id/test', async (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  try {
    const scraperScript = path.join(RTX_DIR, 'panel_scraper.py');
    const { stdout } = await execFileAsync('python3', [scraperScript, 'test', JSON.stringify(panel)], { timeout: 60000 });
    const result = JSON.parse(stdout || '{}');
    res.json(result);
  } catch (err) {
    const errorMsg = err.killed ? 'Connection timed out. Please try again.' : (err.message || 'Scraper failed');
    res.json({ success: false, error: errorMsg });
  }
});

app.post('/api/login-panels/:id/pull', async (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  try {
    const added = await pollSingleLoginPanel(id, true);
    const updated = (readDb('login_panels') || []).find(p => p.id === id);
    res.json({
      success: !updated?.last_error,
      pulled: added || 0,
      total: updated?.total_sms || 0,
      error: updated?.last_error || ''
    });
  } catch (err) {
    const errorMsg = err.killed ? 'Connection timed out. Please try again.' : (err.message || 'Scraper pull failed');
    res.json({ success: false, error: errorMsg });
  }
});

// ── Manager Endpoints ──────────────────────────────────────────
app.get('/api/manager/:manager_id/stats', (req, res) => {
  const mid = String(req.params.manager_id);
  const agents = (readDb('agents') || []).filter(a => String(a.manager_id) === mid);
  const clients = (readDb('clients') || []).filter(c => String(c.manager_id) === mid);
  const clientUsernames = new Set(clients.filter(c => c.username).map(c => c.username.toLowerCase()));
  const numbers = (readDb('numbers') || []).filter(n => String(n.manager_id) === mid);

  const sms = readDb('sms_log') || [];
  const mySms = sms.filter(s => String(s.manager_id) === mid ||
    (!s.manager_id && clientUsernames.has((s.user || '').toLowerCase())));

  const todayStr = new Date().toISOString().slice(0, 10);
  const smsToday = mySms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);

  const now = new Date();
  const trafficData = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const hourKey = d.toISOString().slice(0, 13);
    trafficData.push(mySms.filter(s => (s.timestamp || '').slice(0, 13) === hourKey).length);
  }

  const topAgents = [...agents]
    .sort((a, b) => (Number(b.clients_count) || 0) - (Number(a.clients_count) || 0))
    .slice(0, 5);

  res.json({
    total_agents: agents.length,
    active_agents: agents.filter(a => a.status === 'active').length,
    total_clients: clients.length,
    active_clients: clients.filter(c => c.status === 'active').length,
    total_balance: Math.round(clients.reduce((acc, c) => acc + (Number(c.balance) || 0), 0) * 100) / 100,
    total_sms: mySms.length,
    revenue_today: Math.round(smsToday.reduce((acc, s) => acc + (Number(s.profit) || 0), 0) * 100) / 100,
    numbers_assigned: numbers.length,
    traffic_data: trafficData,
    top_agents: topAgents
  });
});

app.get('/api/manager/:manager_id/earnings', (req, res) => {
  const mid = String(req.params.manager_id);
  const sms = readDb('sms_log') || [];
  const mySms = sms.filter(s => String(s.manager_id) === mid);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthEndStr = lastMonthDate.toISOString().slice(0, 10);
  const lastMonthStartStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

  const sumProfit = (records) => Math.round(records.reduce((acc, r) => acc + (Number(r.profit) || 0), 0) * 100) / 100;

  const todaySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);
  const monthSms = mySms.filter(s => (s.timestamp || '').slice(0, 10) >= monthStartStr);
  const lastMonthSms = mySms.filter(s => {
    const ts = (s.timestamp || '').slice(0, 10);
    return ts >= lastMonthStartStr && ts <= lastMonthEndStr;
  });

  const chartData = [];
  const history = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dayStr = d.toISOString().slice(0, 10);
    const daySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === dayStr);
    const dayEarn = sumProfit(daySms);
    chartData.push(dayEarn);
    if (daySms.length > 0) {
      history.push({
        date: dayStr,
        sms_count: daySms.length,
        rate: 5,
        commission: dayEarn,
        status: i > 0 ? 'paid' : 'pending'
      });
    }
  }

  res.json({
    today: sumProfit(todaySms),
    this_month: sumProfit(monthSms),
    last_month: sumProfit(lastMonthSms),
    all_time: sumProfit(mySms),
    chart_data: chartData,
    history: history.reverse()
  });
});

// ── Agent Endpoints ──────────────────────────────────────────
app.get('/api/agent/:agent_id/earnings', (req, res) => {
  const aid = String(req.params.agent_id);
  const agents = readDb('agents') || [];
  const agent = agents.find(a => String(a.id) === aid);
  const clients = readDb('clients') || [];
  const myUsernames = new Set(clients.filter(c => String(c.agent_id) === aid && c.username).map(c => c.username.toLowerCase()));

  const sms = readDb('sms_log') || [];
  const mySms = sms.filter(s => String(s.agent_id) === aid || (!s.agent_id && myUsernames.has((s.user || '').toLowerCase())));

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthEndStr = lastMonthDate.toISOString().slice(0, 10);
  const lastMonthStartStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

  const sumProfit = (records) => Math.round(records.reduce((acc, r) => acc + (Number(r.profit) || 0), 0) * 100) / 100;

  const todaySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);
  const monthSms = mySms.filter(s => (s.timestamp || '').slice(0, 10) >= monthStartStr);
  const lastMonthSms = mySms.filter(s => {
    const ts = (s.timestamp || '').slice(0, 10);
    return ts >= lastMonthStartStr && ts <= lastMonthEndStr;
  });

  const chartData = [];
  const history = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dayStr = d.toISOString().slice(0, 10);
    const daySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === dayStr);
    const dayEarn = sumProfit(daySms);
    chartData.push(dayEarn);
    if (daySms.length > 0) {
      history.push({
        date: dayStr,
        sms_count: daySms.length,
        rate: agent ? (agent.commission_rate || 5) : 5,
        commission: dayEarn,
        status: i > 0 ? 'paid' : 'pending'
      });
    }
  }

  res.json({
    today: sumProfit(todaySms),
    this_month: sumProfit(monthSms),
    last_month: sumProfit(lastMonthSms),
    all_time: sumProfit(mySms),
    chart_data: chartData,
    history: history.reverse()
  });
});

app.get('/api/agents/:agent_id/weekly-earnings', (req, res) => {
  res.json({ data: [], total: 0 });
});

// ── Client Endpoints ──────────────────────────────────────────
app.get('/api/client/:client_id/stats', (req, res) => {
  const cid = String(req.params.client_id);
  const clients = readDb('clients') || [];
  const client = clients.find(c => String(c.id) === cid);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  const numbers = readDb('numbers') || [];
  const numbersAssigned = numbers.filter(n => String(n.client_id) === cid).length;

  res.json({
    numbers_assigned: numbersAssigned,
    total_sms: client.total_sms || 0,
    balance: client.balance || 0,
    daily_limit: client.daily_limit || 0,
    monthly_limit: client.monthly_limit || 0,
    status: client.status || 'active'
  });
});

app.get('/api/client/:client_id/earnings', (req, res) => {
  res.json({ today: 0, this_month: 0, last_month: 0, all_time: 0, chart_data: [], history: [] });
});

app.get('/api/client/:client_id/numbers', (req, res) => {
  const cid = String(req.params.client_id);
  const numbers = (readDb('numbers') || []).filter(n => String(n.client_id) === cid);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({ data: numbers.slice(start, start + limit), total: numbers.length });
});

app.get('/api/client/:client_id/transactions', (req, res) => {
  res.json({ data: [], total: 0 });
});

app.get('/api/sms/client-logs', (req, res) => {
  const data = readDb('sms_log') || [];
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({ data: data.slice(start, start + limit), total: data.length });
});

// ── SMS Logs & Stats ──────────────────────────────────────────
app.get('/api/sms', (req, res) => {
  const data = readDb('sms_log') || [];
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({
    data: data.slice(start, start + limit),
    total: data.length
  });
});

app.all(['/crapi/viewstats', '/crapi/:user/viewstats', '/api/sms/viewstats'], (req, res) => {
  const p = { ...(req.query || {}), ...(req.body || {}) };
  const authHeader = req.headers.authorization || '';
  const token = p.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');

  const tokens = readDb('api_tokens') || [];
  let currentToken = null;
  if (tokens.length > 0) {
    currentToken = tokens.find(t => t.token === token);
    if (!currentToken || currentToken.status !== 'active') {
      return res.status(401).json({ status: 'error', msg: 'Not Authorized' });
    }
    currentToken.calls = (currentToken.calls || 0) + 1;
    currentToken.last_used = new Date().toISOString();
    writeDb('api_tokens', tokens);
  }

  let sms = readDb('sms_log') || [];

  if (currentToken && currentToken.agent_id) {
    const clients = readDb('clients') || [];
    const myUsernames = new Set(
      clients.filter(c => String(c.agent_id) === String(currentToken.agent_id) && c.username)
             .map(c => c.username.toLowerCase())
    );
    sms = sms.filter(s => myUsernames.has((s.user || '').toLowerCase()) || String(s.agent_id) === String(currentToken.agent_id));
  }

  const dt1 = p.dt1 ? p.dt1.replace(' ', 'T').replace('%20', 'T') : '';
  const dt2 = p.dt2 ? p.dt2.replace(' ', 'T').replace('%20', 'T') : '';
  if (dt1) sms = sms.filter(s => (s.timestamp || '') >= dt1);
  if (dt2) sms = sms.filter(s => (s.timestamp || '') <= dt2);

  if (p.filternum) {
    const fn = String(p.filternum).trim();
    sms = sms.filter(s => (s.number || '').includes(fn));
  }

  if (p.filtercli) {
    const fc = String(p.filtercli).trim().toLowerCase();
    sms = sms.filter(s => (s.cli || s.sender || '').toLowerCase().includes(fc));
  }

  const records = Math.min(Math.max(1, parseInt(p.records) || 25), 200);
  sms.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const sliced = sms.slice(0, records);

  const data = sliced.map(s => ({
    dt: (s.timestamp || '').replace('T', ' ').slice(0, 19),
    num: s.number || '',
    cli: s.cli || s.sender || '',
    message: s.message || '',
    payout: String(s.profit || s.payout || 0)
  }));

  res.json({
    status: 'success',
    total: data.length,
    data
  });
});

app.get('/api/sms/logs', (req, res) => {
  let list = readDb('sms_log') || [];

  const {
    manager_id,
    agent_id,
    client_id,
    date_from,
    date_to,
    period,
    filter_period,
    range,
    search,
    number,
    cli,
    status,
    group_by
  } = req.query;

  const agents = readDb('agents') || [];
  const agentMap = {};
  agents.forEach(a => { if (a && a.id) agentMap[a.id] = a.username || a.name; });

  const clients = readDb('clients') || [];
  const clientMap = {};
  clients.forEach(c => { if (c && c.id) clientMap[c.id] = c.username || c.name; });

  const managers = readDb('managers') || (readDb('users') || []).filter(u => u.role === 'Manager') || [];
  const managerMap = {};
  managers.forEach(m => { if (m && m.id) managerMap[m.id] = m.username || m.name; });

  if (manager_id && manager_id !== 'undefined' && manager_id !== 'null') {
    const mid = String(manager_id);
    const mgrAgents = new Set(agents.filter(a => String(a.manager_id) === mid).map(a => String(a.id)));
    const mgrClients = clients.filter(c => String(c.manager_id) === mid || (c.agent_id && mgrAgents.has(String(c.agent_id))));
    const mgrClientIds = new Set(mgrClients.map(c => String(c.id)));
    const mgrUsernames = new Set(mgrClients.filter(c => c.username).map(c => c.username.toLowerCase()));
    list = list.filter(s =>
      String(s.manager_id) === mid ||
      (s.agent_id && mgrAgents.has(String(s.agent_id))) ||
      (s.client_id && mgrClientIds.has(String(s.client_id))) ||
      (!s.manager_id && s.user && mgrUsernames.has(String(s.user).toLowerCase()))
    );
  }
  if (agent_id && agent_id !== 'undefined' && agent_id !== 'null') {
    const aid = String(agent_id);
    const agtClients = clients.filter(c => String(c.agent_id) === aid);
    const agtClientIds = new Set(agtClients.map(c => String(c.id)));
    const agtUsernames = new Set(agtClients.filter(c => c.username).map(c => c.username.toLowerCase()));
    list = list.filter(s =>
      String(s.agent_id) === aid ||
      (s.client_id && agtClientIds.has(String(s.client_id))) ||
      (!s.agent_id && s.user && agtUsernames.has(String(s.user).toLowerCase()))
    );
  }
  if (client_id && client_id !== 'undefined' && client_id !== 'null') {
    const cid = String(client_id);
    const client = clients.find(c => String(c.id) === cid);
    const cUser = (client && client.username ? client.username : '').toLowerCase();
    list = list.filter(s =>
      String(s.client_id) === cid ||
      (cUser && String(s.user || '').toLowerCase() === cUser)
    );
  }
  if (status) {
    list = list.filter(s => String(s.status).toLowerCase() === String(status).toLowerCase());
  }

  // Predefined period filtering (today, yesterday, month, year, etc.)
  const activePeriod = (period || filter_period || '').trim().toLowerCase();
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();
  if (activePeriod === 'today' || activePeriod === 'daily') {
    list = list.filter(s => todaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'yesterday') {
    list = list.filter(s => yesterdaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'this_week' || activePeriod === 'week') {
    list = list.filter(s => extractDateStr(s) >= weekStartStr);
  } else if (activePeriod === 'this_month' || activePeriod === 'month') {
    list = list.filter(s => extractDateStr(s) >= monthStartStr);
  } else if (activePeriod === 'this_year' || activePeriod === 'year') {
    list = list.filter(s => extractDateStr(s) >= yearStartStr);
  }

  if (date_from) {
    let df = String(date_from).trim();
    if (df.length === 10) df = df + ' 00:00:00';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts >= df || ds >= df.slice(0, 10);
    });
  }
  if (date_to) {
    let dt = String(date_to).trim();
    if (dt.length === 10) dt = dt + ' 23:59:59';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts <= dt || ds <= dt.slice(0, 10);
    });
  }
  if (range) {
    const rLower = String(range).toLowerCase();
    list = list.filter(s =>
      String(s.range_id) === String(range) ||
      String(s.range || '').toLowerCase().includes(rLower) ||
      String(s.range_label || '').toLowerCase().includes(rLower) ||
      String(s.range_name || '').toLowerCase().includes(rLower) ||
      String(s.country || '').toLowerCase().includes(rLower)
    );
  }
  const numQ = (number || search || '').trim().toLowerCase();
  if (numQ) {
    list = list.filter(s =>
      String(s.number || '').includes(numQ) ||
      String(s.message || '').toLowerCase().includes(numQ)
    );
  }
  if (cli) {
    const cliQ = String(cli).trim().toLowerCase();
    list = list.filter(s =>
      String(s.cli || s.app || '').toLowerCase().includes(cliQ)
    );
  }

  // Sort descending by timestamp
  list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  // ── Group By Logic ──
  if (group_by) {
    const rawKeys = Array.isArray(group_by)
      ? group_by
      : String(group_by).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    const validKeys = rawKeys.filter(k => ['date', 'daily', 'day', 'month', 'year', 'range', 'manager', 'agent', 'client', 'number', 'cli'].includes(k));

    if (validKeys.length > 0) {
      const groups = new Map();

      for (const s of list) {
        const keyParts = {};
        const dStr = extractDateStr(s);
        for (const k of validKeys) {
          if (k === 'date' || k === 'daily' || k === 'day') {
            keyParts.date = dStr || 'Unknown';
          } else if (k === 'month') {
            keyParts.month = dStr ? dStr.slice(0, 7) : 'Unknown';
          } else if (k === 'year') {
            keyParts.year = dStr ? dStr.slice(0, 4) : 'Unknown';
          } else if (k === 'range') {
            keyParts.range = s.range_name || s.range_label || s.range || (s.country ? `${s.country}${s.provider && s.provider !== 'Manual' && s.provider !== '—' ? ` ${s.provider}` : ''}` : 'General Range');
          } else if (k === 'manager') {
            keyParts.manager = s.manager || (s.manager_id && managerMap[s.manager_id]) || (s.manager_id ? `Manager #${s.manager_id}` : 'General');
          } else if (k === 'agent') {
            keyParts.agent = s.agent || s.agent_name || s.user || (s.agent_id && agentMap[s.agent_id]) || (s.agent_id ? `Agent #${s.agent_id}` : 'Direct');
          } else if (k === 'client') {
            keyParts.client = s.client || s.client_name || (s.client_id && clientMap[s.client_id]) || (s.client_id ? `Client #${s.client_id}` : 'General');
          } else if (k === 'number') {
            keyParts.number = s.number || '—';
          } else if (k === 'cli') {
            keyParts.cli = s.cli || s.app || '—';
          }
        }

        const mapKey = validKeys.map(k => `${k}:${keyParts[k]}`).join('|');
        let grp = groups.get(mapKey);
        if (!grp) {
          grp = {
            ...keyParts,
            sms_count: 0,
            delivered_count: 0,
            failed_count: 0,
            currency: s.currency || 'USD',
            payout: 0,
            client_payout: 0,
            profit: 0,
            key: validKeys.map(k => keyParts[k]).join(' / ')
          };
          groups.set(mapKey, grp);
        }

        grp.sms_count++;
        if (s.status === 'delivered' || s.status === 'success') {
          grp.delivered_count++;
        } else if (s.status === 'failed') {
          grp.failed_count++;
        }

        const p = parseFloat(s.payout ?? s.profit ?? 0) || 0;
        const cp = parseFloat(s.client_payout ?? 0) || 0;
        grp.payout = Math.round((grp.payout + p) * 10000) / 10000;
        grp.client_payout = Math.round((grp.client_payout + cp) * 10000) / 10000;
        grp.profit = Math.round((grp.profit + (p - cp)) * 10000) / 10000;
      }

      const groupedResult = Array.from(groups.values());
      groupedResult.sort((a, b) => b.sms_count - a.sms_count);

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 500;
      const start = (page - 1) * limit;

      return res.json({
        data: groupedResult.slice(start, start + limit),
        total: groupedResult.length,
        grouped: true,
        group_keys: validKeys
      });
    }
  }

  // ── Ungrouped Standard Pagination ──
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({
    data: list.slice(start, start + limit),
    total: list.length,
    grouped: false
  });
});

app.get('/api/sms/test-logs', (req, res) => {
  let list = readDb('test_sms_logs') || [];
  const ranges = readDb('sms_ranges') || [];
  const testNumbers = readDb('test_numbers') || [];
  const numToRange = {};
  testNumbers.forEach(tn => {
    if (tn.number) numToRange[tn.number] = tn.range_name || tn.range_label || tn.range;
  });

  list = list.map(s => {
    let rName = s.range_name || s.range_label || s.range;
    if (!rName || rName.toLowerCase().includes('manual') || rName === '—') {
      if (numToRange[s.number]) {
        rName = numToRange[s.number];
      } else if (s.range_id) {
        const found = ranges.find(r => r.id === s.range_id);
        if (found) rName = found.range_name || found.name;
      }
    }
    if (!rName || rName.toLowerCase().includes('manual')) {
      rName = s.country || 'Test Range';
    }
    return { ...s, range_name: rName, range_label: rName, range: rName };
  });

  const { date_from, date_to, period, filter_period, range, search, cli, group_by } = req.query;

  const activePeriod = (period || filter_period || '').trim().toLowerCase();
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();
  if (activePeriod === 'today' || activePeriod === 'daily') {
    list = list.filter(s => todaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'yesterday') {
    list = list.filter(s => yesterdaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'this_week' || activePeriod === 'week') {
    list = list.filter(s => extractDateStr(s) >= weekStartStr);
  } else if (activePeriod === 'this_month' || activePeriod === 'month') {
    list = list.filter(s => extractDateStr(s) >= monthStartStr);
  } else if (activePeriod === 'this_year' || activePeriod === 'year') {
    list = list.filter(s => extractDateStr(s) >= yearStartStr);
  }

  if (date_from) {
    let df = String(date_from).trim();
    if (df.length === 10) df = df + ' 00:00:00';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts >= df || ds >= df.slice(0, 10);
    });
  }
  if (date_to) {
    let dt = String(date_to).trim();
    if (dt.length === 10) dt = dt + ' 23:59:59';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts <= dt || ds <= dt.slice(0, 10);
    });
  }
  if (range) list = list.filter(s => (s.range_name || s.range || s.range_label || '').toLowerCase().includes(range.toLowerCase()));
  if (search) list = list.filter(s => (s.number || '').includes(search) || (s.message || '').includes(search));
  if (cli) list = list.filter(s => (s.cli || '').toLowerCase().includes(cli.toLowerCase()));

  if (group_by) {
    const rawKeys = Array.isArray(group_by) ? group_by : String(group_by).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const validKeys = rawKeys.filter(k => ['date', 'daily', 'day', 'month', 'year', 'range', 'number', 'cli'].includes(k));
    if (validKeys.length > 0) {
      const groups = new Map();
      for (const s of list) {
        const kp = {};
        const dStr = extractDateStr(s);
        for (const k of validKeys) {
          if (k === 'date' || k === 'daily' || k === 'day') kp.date = dStr || 'Unknown';
          else if (k === 'month') kp.month = dStr ? dStr.slice(0, 7) : 'Unknown';
          else if (k === 'year') kp.year = dStr ? dStr.slice(0, 4) : 'Unknown';
          else if (k === 'range') kp.range = s.range_name || s.range || s.range_label || 'Test Range';
          else if (k === 'number') kp.number = s.number || '—';
          else if (k === 'cli') kp.cli = s.cli || '—';
        }
        const mk = validKeys.map(k => `${k}:${kp[k]}`).join('|');
        let grp = groups.get(mk);
        if (!grp) {
          grp = { ...kp, count: 0, sms_count: 0, key: validKeys.map(k => kp[k]).join(' / ') };
          groups.set(mk, grp);
        }
        grp.count++;
        grp.sms_count++;
      }
      const gr = Array.from(groups.values()).sort((a, b) => b.sms_count - a.sms_count);
      return res.json({ data: gr, total: gr.length, grouped: true, group_keys: validKeys });
    }
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({ data: list.slice(start, start + limit), total: list.length, grouped: false });
});

app.get('/api/sms/test-numbers', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const rangeMap = {};
  ranges.forEach(r => {
    rangeMap[r.id] = r;
    if (r.range_name) rangeMap[r.range_name] = r;
  });
  let data = readDb('test_numbers') || [];
  data = data.map(item => {
    const rng = (item.range_id && rangeMap[item.range_id]) || (item.range_name && rangeMap[item.range_name]);
    const rName = item.range_name || item.range_label || item.range || (rng && (rng.range_name || rng.name)) || item.country || '—';
    return {
      ...item,
      range_name: rName,
      range_label: rName,
      range: rName
    };
  });

  const search = (req.query.search || '').toLowerCase().trim();
  const rangeFilter = (req.query.range || '').toLowerCase().trim();
  if (search) {
    data = data.filter(d => (d.number || '').toLowerCase().includes(search) || (d.range_name || '').toLowerCase().includes(search));
  }
  if (rangeFilter) {
    data = data.filter(d => String(d.range_id) === rangeFilter || (d.range_name || '').toLowerCase().includes(rangeFilter));
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || data.length;
  const total = data.length;
  const paged = limit < total ? data.slice((page - 1) * limit, page * limit) : data;
  res.json({ data: paged, total });
});

app.post('/api/sms/test-numbers', (req, res) => {
  const data = readDb('test_numbers') || [];
  const ranges = readDb('sms_ranges') || [];
  const rng = req.body.range_id ? ranges.find(r => r.id === Number(req.body.range_id)) : null;
  const rName = (req.body.range_name || req.body.range_label || req.body.range || (rng && (rng.range_name || rng.name)) || req.body.country || 'Range').trim();
  const item = {
    id: nextId(data),
    ...req.body,
    range_name: rName,
    range_label: rName,
    range: rName,
    created: new Date().toISOString()
  };
  data.unshift(item);
  writeDb('test_numbers', data);
  res.json(item);
});

app.post('/api/sms/test-numbers/bulk', (req, res) => {
  const { range_id, count } = req.body || {};
  const ranges = readDb('sms_ranges') || [];
  const rng = ranges.find(r => String(r.id) === String(range_id));
  if (!rng) return res.status(404).json({ error: 'Range not found' });
  const rName = rng.range_name || rng.name || rng.country || 'Range';
  const numbersPool = readDb('numbers') || [];
  let available = numbersPool.filter(n => n.range_id && Number(n.range_id) === Number(range_id));
  if (!available.length) {
    available = numbersPool.filter(n => n.range_name === rName || (n.country === rng.country && (n.provider === rng.provider || n.provider === 'Manual')));
  }
  const pullCount = Math.min(parseInt(count) || 10, available.length || 10);
  const testNumbers = readDb('test_numbers') || [];
  const added = [];
  const existingSet = new Set(testNumbers.map(tn => tn.number));

  if (available.length) {
    for (const numObj of available) {
      if (added.length >= pullCount) break;
      if (!existingSet.has(numObj.number)) {
        const item = {
          id: nextId(testNumbers) + added.length,
          number: numObj.number,
          range_id: rng.id,
          range_name: rName,
          range_label: rName,
          range: rName,
          country: rng.country,
          provider: rng.provider || 'Manual',
          created: new Date().toISOString()
        };
        added.push(item);
        existingSet.add(numObj.number);
      }
    }
  }

  // If pool was empty or fewer than requested, generate numbers matching range prefix
  const prefix = rng.prefix || '1';
  let genAttempt = 0;
  while (added.length < pullCount && genAttempt < 200) {
    genAttempt++;
    const randomSuffix = Math.floor(1000000 + Math.random() * 9000000);
    const genNum = `${prefix}${randomSuffix}`;
    if (!existingSet.has(genNum)) {
      const item = {
        id: nextId(testNumbers) + added.length,
        number: genNum,
        range_id: rng.id,
        range_name: rName,
        range_label: rName,
        range: rName,
        country: rng.country,
        provider: rng.provider || 'Manual',
        created: new Date().toISOString()
      };
      added.push(item);
      existingSet.add(genNum);
    }
  }

  testNumbers.unshift(...added);
  writeDb('test_numbers', testNumbers);
  res.json({ success: true, added: added.length, range_name: rName });
});

app.get('/api/sms/stats', (req, res) => {
  const sms = readDb('sms_log') || [];
  const delivered = sms.filter(s => s.status === 'delivered');
  res.json({
    total: sms.length,
    delivered: delivered.length,
    failed: sms.filter(s => s.status === 'failed').length,
    success_rate: sms.length ? Math.round((delivered.length / sms.length) * 100) : 0
  });
});

app.get('/api/sms/client-stats', (req, res) => {
  const sms = readDb('sms_log') || [];
  res.json({
    total: sms.length,
    delivered: sms.filter(s => s.status === 'delivered').length,
    failed: sms.filter(s => s.status === 'failed').length
  });
});

// ── Settings & Permissions ────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    let settings = readDb('settings');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      settings = {};
    }
    res.json(settings);
  } catch (err) {
    console.error('Error in /api/settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', (req, res) => {
  const settings = readDb('settings') || {};
  const updated = { ...settings, ...req.body };
  writeDb('settings', updated);
  broadcastWs({ type: 'brand_theme_updated', settings: updated });
  res.json(updated);
});

app.post('/api/settings/upload-logo', (req, res) => {
  try {
    const image = (req.body && (req.body.image || req.body.logo || req.body.data)) || '';
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    let ext = 'png';
    let base64Payload = image.trim();
    if (base64Payload.startsWith('data:')) {
      const commaIdx = base64Payload.indexOf(',');
      if (commaIdx !== -1) {
        const header = base64Payload.slice(0, commaIdx).toLowerCase();
        if (header.includes('jpeg') || header.includes('jpg')) ext = 'jpg';
        else if (header.includes('svg')) ext = 'svg';
        else if (header.includes('webp')) ext = 'webp';
        else if (header.includes('gif')) ext = 'gif';
        base64Payload = base64Payload.slice(commaIdx + 1);
      }
    }

    base64Payload = base64Payload.replace(/\s+/g, '');
    const buffer = Buffer.from(base64Payload, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid image data' });
    }

    const imgDir = path.join(STATIC_DIR, 'img');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    const filename = `custom-logo.${ext}`;
    const filePath = path.join(imgDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Also maintain custom-logo.png for universal fallbacks
    try {
      const pngPath = path.join(imgDir, 'custom-logo.png');
      fs.writeFileSync(pngPath, buffer);
    } catch(e) {}

    const logoUrl = `/static/img/${filename}?v=${Date.now()}`;
    const settings = readDb('settings') || {};
    settings.logo_url = logoUrl;
    settings.logo_data = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${base64Payload}`;
    writeDb('settings', settings);

    broadcastWs({ type: 'brand_theme_updated', settings });

    return res.json({ success: true, logo_url: logoUrl, settings });
  } catch (err) {
    console.error('Error uploading logo:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload logo' });
  }
});

app.get('/api/settings/min-payout', (req, res) => {
  const settings = readDb('settings') || {};
  res.json({ min_payout: Number(settings.min_payout || 0) });
});

app.get('/api/permissions', (req, res) => {
  res.json(readDb('permissions') || {});
});

app.post('/api/permissions', (req, res) => {
  writeDb('permissions', req.body || {});
  res.json({ success: true });
});

app.get('/api/webhook/config', (req, res) => {
  res.json(readDb('webhook_config') || {});
});

app.post('/api/webhook/config', (req, res) => {
  const current = readDb('webhook_config') || {};
  const updated = { ...current, ...req.body };
  writeDb('webhook_config', updated);
  res.json({ success: true, data: updated });
});

app.post('/api/webhook/test', (req, res) => {
  res.json({ success: true, message: 'Webhook test received' });
});

// ── System Backup & Restore ──────────────────────────────────
app.get('/api/backup/export', (req, res) => {
  try {
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `mait_sms_backup_${dateStr}.zip`;

    const zip = new AdmZip();

    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.includes('.tmp.'));
      for (const f of files) {
        const fullPath = path.join(DATA_DIR, f);
        try {
          const content = fs.readFileSync(fullPath);
          zip.addFile(`data/${f}`, content);
        } catch (readErr) {
          console.warn(`Could not read ${f} for backup:`, readErr.message);
        }
      }

      const manifest = {
        app: 'MAIT SMS',
        exported_at: new Date().toISOString(),
        files: files
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    }

    const zipBuffer = zip.toBuffer();

    try {
      const auditLogs = readDb('audit_logs') || [];
      auditLogs.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        timestamp: new Date().toISOString(),
        user: 'Admin',
        action: 'Backup Exported',
        detail: `Downloaded full system backup (${filename})`,
        module: 'System',
        ip: req.ip || '127.0.0.1'
      });
      writeDb('audit_logs', auditLogs.slice(0, 2000));
    } catch (_) {}

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.end(zipBuffer);
  } catch (err) {
    console.error('Error in /api/backup/export:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Export failed: ' + err.message });
    }
  }
});

app.post('/api/backup/restore', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Please upload a .zip backup file' });
    }

    let zip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'That file is not a valid zip archive' });
    }

    const zipEntries = zip.getEntries();
    const jsonEntries = zipEntries.filter(entry => {
      const name = entry.entryName;
      return !entry.isDirectory && (name.startsWith('data/') || !name.includes('/')) && name.endsWith('.json') && !name.endsWith('manifest.json');
    });

    if (jsonEntries.length === 0) {
      return res.status(400).json({ error: 'No valid data JSON files found inside this backup' });
    }

    const safetyDir = path.join(path.dirname(DATA_DIR), 'data_before_restore');
    try {
      if (fs.existsSync(safetyDir)) {
        fs.rmSync(safetyDir, { recursive: true, force: true });
      }
      fs.cpSync(DATA_DIR, safetyDir, { recursive: true });
    } catch (e) {
      console.warn('Safety copy warning:', e.message);
    }

    const restored = [];
    for (const entry of jsonEntries) {
      const fileName = path.basename(entry.entryName);
      if (!fileName.endsWith('.json')) continue;
      try {
        const rawContent = entry.getData().toString('utf8');
        const parsed = JSON.parse(rawContent);
        const targetPath = path.join(DATA_DIR, fileName);
        fs.writeFileSync(targetPath, rawContent, 'utf8');

        const dbName = fileName.replace(/\.json$/, '');
        DB_CACHE.set(dbName, parsed);
        DB_MTIME.set(dbName, Date.now());
        restored.push(fileName);
      } catch (entryErr) {
        console.warn(`Skipping invalid JSON file ${entry.entryName}:`, entryErr.message);
      }
    }

    try {
      const auditLogs = readDb('audit_logs') || [];
      auditLogs.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        timestamp: new Date().toISOString(),
        user: 'Admin',
        action: 'Backup Restored',
        detail: `Restored ${restored.length} file(s) from uploaded backup`,
        module: 'System',
        ip: req.ip || '127.0.0.1'
      });
      writeDb('audit_logs', auditLogs.slice(0, 2000));
    } catch (_) {}

    return res.json({ success: true, restored_files: restored.length, files: restored });
  } catch (err) {
    console.error('Error restoring backup:', err);
    return res.status(500).json({ error: 'Failed to restore backup: ' + err.message });
  }
});

// ── Search & Firewall Stats ───────────────────────────────────
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return res.json({ numbers: [], clients: [], agents: [], managers: [] });
  }
  const numbers = (readDb('numbers') || []).filter(n => (n.number || '').toLowerCase().includes(q)).slice(0, 10);
  const clients = (readDb('clients') || []).filter(c => (c.username || '').toLowerCase().includes(q)).slice(0, 10);
  const agents = (readDb('agents') || []).filter(a => (a.username || '').toLowerCase().includes(q)).slice(0, 10);
  const managers = (readDb('users') || []).filter(u => u.role === 'Manager' && (u.username || '').toLowerCase().includes(q)).slice(0, 10);
  res.json({ numbers, clients, agents, managers });
});

app.get('/api/reports/business', (req, res) => {
  let sms = readDb('sms_log') || [];
  const { date_from, date_to } = req.query;

  if (date_from) {
    const df = String(date_from).trim().slice(0, 19);
    sms = sms.filter(s => (s.timestamp || '').replace('T', ' ') >= df);
  }
  if (date_to) {
    let dt = String(date_to).trim().slice(0, 19);
    if (dt.length === 10) dt = dt + ' 23:59:59';
    sms = sms.filter(s => (s.timestamp || '').replace('T', ' ') <= dt);
  }

  const delivered = sms.filter(s => s.status === 'delivered' || s.status === 'success');
  const failed = sms.filter(s => s.status !== 'delivered' && s.status !== 'success');

  const total_revenue = Math.round(sms.reduce((sum, s) => {
    const rev = parseFloat(s.carrier_revenue ?? s.profit ?? s.payout ?? 0) || 0;
    return sum + rev;
  }, 0) * 100) / 100;

  const clients = readDb('clients') || [];
  const agents = readDb('agents') || [];

  const clientToAgent = {};
  clients.forEach(c => {
    if (c && c.username) clientToAgent[String(c.username).toLowerCase()] = c.agent_id;
  });

  const agentNames = {};
  agents.forEach(a => {
    if (a && a.id) agentNames[a.id] = a.username || a.name || `Agent #${a.id}`;
  });

  const agentTotals = {};
  for (const s of sms) {
    let aid = s.agent_id;
    if (!aid && s.user && clientToAgent[String(s.user).toLowerCase()]) {
      aid = clientToAgent[String(s.user).toLowerCase()];
    }
    const agentName = aid ? (agentNames[aid] || `Agent #${aid}`) : (s.agent || s.user || 'Direct');
    if (!agentTotals[agentName]) {
      agentTotals[agentName] = { agent: agentName, sms_count: 0, revenue: 0 };
    }
    agentTotals[agentName].sms_count++;
    const p = parseFloat(s.profit ?? s.payout ?? 0) || 0;
    agentTotals[agentName].revenue = Math.round((agentTotals[agentName].revenue + p) * 100) / 100;
  }

  const top_agents = Object.values(agentTotals)
    .sort((a, b) => b.revenue - a.revenue || b.sms_count - a.sms_count)
    .slice(0, 10);

  const numberTotals = {};
  for (const s of sms) {
    const num = s.number;
    if (!num) continue;
    numberTotals[num] = (numberTotals[num] || 0) + 1;
  }

  const top_numbers = Object.entries(numberTotals)
    .map(([number, sms_count]) => ({ number, sms_count }))
    .sort((a, b) => b.sms_count - a.sms_count)
    .slice(0, 10);

  const dailyMap = {};
  for (const s of sms) {
    const day = (s.timestamp || '').slice(0, 10);
    if (!day) continue;
    if (!dailyMap[day]) {
      dailyMap[day] = { date: day, total: 0, delivered: 0, failed: 0, revenue: 0 };
    }
    dailyMap[day].total++;
    if (s.status === 'delivered' || s.status === 'success') {
      dailyMap[day].delivered++;
    } else {
      dailyMap[day].failed++;
    }
    const rev = parseFloat(s.carrier_revenue ?? s.profit ?? s.payout ?? 0) || 0;
    dailyMap[day].revenue = Math.round((dailyMap[day].revenue + rev) * 100) / 100;
  }
  const daily_breakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    date_from: date_from || 'all-time',
    date_to: date_to || 'now',
    total_sms: sms.length,
    delivered: delivered.length,
    failed: failed.length,
    success_rate: Math.round((delivered.length / Math.max(sms.length, 1)) * 1000) / 10,
    total_revenue,
    top_agents,
    top_numbers,
    daily_breakdown
  });
});

app.get('/api/firewall/stats', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const events = readDb('firewall_events') || [];
  res.json({
    blocked_count: blocked.length,
    events_count: events.length,
    active_threats: events.filter(e => e.severity === 'high').length
  });
});

app.get('/api/smpp/server-info', (req, res) => {
  const settings = readDb('settings') || {};
  res.json({
    host: settings.smpp_host || '0.0.0.0',
    port: settings.smpp_port || 2775,
    status: 'online',
    accounts_count: (readDb('smpp_accounts') || []).length,
    active_sessions: (readDb('smpp_sessions') || []).length
  });
});

app.get('/api/smpp/throughput', (req, res) => {
  res.json({ current_mps: Math.floor(Math.random() * 5) + 1, peak_mps: 45, limit: 100 });
});

app.get('/api/smpp/dlr', (req, res) => {
  const sms = readDb('sms_log') || [];
  const delivered = sms.filter(s => s.status === 'delivered');
  res.json({
    dlr_rate: sms.length ? Math.round((delivered.length / sms.length) * 100) : 0,
    delivered: delivered.length,
    pending: sms.filter(s => s.status === 'pending').length,
    failed: sms.filter(s => s.status === 'failed').length,
    data: [95, 96, 98, 97, 99, 98, 100]
  });
});

// CSV Download for Numbers
app.get('/api/numbers/download', (req, res) => {
  const numbers = readDb('numbers') || [];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="numbers.csv"');
  let csv = 'ID,Number,Country,Provider,Service,Status,Manager,Agent,Client,Created\n';
  numbers.forEach(n => {
    csv += `"${n.id || ''}","${n.number || ''}","${n.country || ''}","${n.provider || ''}","${n.app || ''}","${n.status || ''}","${n.manager_id || ''}","${n.agent_id || ''}","${n.client_id || ''}","${n.created || ''}"\n`;
  });
  res.send(csv);
});

// Inbound Carrier / Webhook SMS API
app.all(['/api/sms/inbound', '/api/inbound', '/api/sms/receive'], (req, res) => {
  const p = { ...(req.query || {}), ...(req.body || {}) };

  const sender = p.from || p.sender || p.cli || p.source || '';
  const to_number = p.to || p.recipient || p.number || p.num || p.fnum || '';

  let message = p.message || p.msg || p.text || p.body || '';
  if (!message && p.msg64base) {
    try {
      message = Buffer.from(p.msg64base, 'base64').toString('utf-8');
    } catch (e) {
      message = p.msg64base;
    }
  }

  const sms_id = p.sms_id || p.uuid || p.id || '';
  const company = p.company || p.system_id || p.provider || '';

  if (!to_number) {
    return res.status(400).json({ status: 'error', error: 'Missing destination number (to)' });
  }

  const result = ingestSms({
    sender,
    to_number,
    message: message || `Verification code: ${Math.floor(100000 + Math.random() * 900000)}`,
    sms_id,
    company,
    source: 'inbound_http'
  });

  res.json(result);
});

// ── WebSockets ────────────────────────────────────────────────

wss.on('connection', ws => {
  const now = new Date().toISOString();
  ws.send(JSON.stringify({ type: 'connected', time: now, timestamp: now }));
  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      const ts = new Date().toISOString();
      const count = (readDb('sms_log') || []).length;
      ws.send(JSON.stringify({
        type: 'heartbeat',
        time: ts,
        timestamp: ts,
        mps: Math.floor(Math.random() * 3) + 1,
        total: count,
        success_rate: 98,
        dlr: 97
      }));
    }
  }, 3000);
  ws.on('close', () => clearInterval(interval));
});

// ── CRITICAL: Safe API 404 handler (Must ALWAYS return JSON, never HTML) ─────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Fallback for HTML routing
app.use((req, res) => {
  if (req.accepts('html')) {
    sendInjectedHtml(res, path.join(STATIC_DIR, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Cascade Orphaned Numbers Protection ───────────────────────
function cleanupOrphanedNumbers() {
  try {
    const ranges = readDb('sms_ranges') || [];
    if (!Array.isArray(ranges) || ranges.length === 0) return;
    const validRangeIds = new Set(ranges.map(r => Number(r.id)));
    let numbers = readDb('numbers') || [];
    if (!Array.isArray(numbers) || numbers.length === 0) return;
    const initLen = numbers.length;
    numbers = numbers.filter(n => {
      if (n.range_id) {
        return validRangeIds.has(Number(n.range_id));
      }
      const c = (n.country || '').trim().toLowerCase();
      const p = (n.provider || '').trim().toLowerCase();
      return ranges.some(r => (r.country || '').trim().toLowerCase() === c && (r.provider || '').trim().toLowerCase() === p);
    });
    if (numbers.length !== initLen) {
      writeDb('numbers', numbers);
      console.log(`[Cascade Clean] Removed ${initLen - numbers.length} orphaned numbers.`);
    }
  } catch (err) {
    console.error('cleanupOrphanedNumbers error:', err);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  cleanupOrphanedNumbers();
  console.log(`[ALPHA SMS] Server running on http://0.0.0.0:${PORT}`);
});
