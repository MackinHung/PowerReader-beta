/**
 * PowerReader — Dashboard Controller
 *
 * Extracted from dashboard.html inline <script>.
 * Manages: KPI rendering, usage bars, alerts, Canvas charts,
 *          token management, auto-refresh countdown.
 */

/* ==============================================
   Constants
   ============================================== */
const API_BASE = 'https://powerreader-api.watermelom5404.workers.dev/api/v1';
const REFRESH_INTERVAL_SEC = 60;
const TOKEN_KEY = 'powerreader_service_token';

/* KPI thresholds: [target, warn, critical, direction]
   direction: 'lower' = lower is better, 'higher' = higher is better */
const KPI_CONFIG = {
  kv:        { target: 30,  warn: 80,  critical: 100, dir: 'lower',  unit: 'ms', fmt: v => Math.round(v) + 'ms' },
  cdn:       { target: 80,  warn: 65,  critical: 60,  dir: 'higher', unit: '%',  fmt: v => Math.round(v) + '%' },
  inference: { target: 10,  warn: 20,  critical: 30,  dir: 'lower',  unit: 's',  fmt: v => v.toFixed(1) + 's' },
  crawler:   { target: 90,  warn: 85,  critical: 90,  dir: 'higher', unit: '%',  fmt: v => Math.round(v) + '%' },
  analysis:  { target: 60,  warn: 55,  critical: 60,  dir: 'higher', unit: '%',  fmt: v => Math.round(v) + '%' },
};

/* Usage definitions */
const USAGE_DEFS = [
  { key: 'workers_requests', label: 'Workers 請求數', field: 'workers_requests_today', limit: 100000, limitLabel: '100K/天' },
  { key: 'd1_reads',         label: 'D1 讀取次數',    field: 'd1_reads_today',         limit: 5000000, limitLabel: '5M/天' },
  { key: 'kv_writes',        label: 'KV 寫入使用量',  field: 'kv_writes_today',        limit: 1000, limitLabel: '1000/天' },
  { key: 'vectorize',        label: 'Vectorize 查詢', field: 'vectorize_queries_today', limit: 1000000, limitLabel: '~1M/天' },
  { key: 'workers_ai',       label: 'Workers AI',     field: 'workers_ai_neurons_today',limit: 10000, limitLabel: '10K/天' },
  { key: 'r2',               label: 'R2 儲存量',      field: 'r2_storage_gb',          limit: 10, limitLabel: '10 GB', unit: 'GB' },
];

/* ==============================================
   State
   ============================================== */
let countdownSec = REFRESH_INTERVAL_SEC;
let countdownTimer = null;
let kvHistory = [];
let cdnHistory = [];

/* ==============================================
   DOM refs
   ============================================== */
const $tokenInput = document.getElementById('token-input');
const $tokenSave = document.getElementById('token-save');
const $statusDot = document.getElementById('status-dot');
const $statusText = document.getElementById('status-text');
const $lastUpdate = document.getElementById('last-update');
const $countdown = document.getElementById('countdown');
const $refreshBtn = document.getElementById('refresh-btn');
const $probes = document.getElementById('probes-container');
const $usageGrid = document.getElementById('usage-grid');
const $alerts = document.getElementById('alerts-container');

/* ==============================================
   Token Management
   ============================================== */
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function saveToken() {
  const val = $tokenInput.value.trim();
  if (val) {
    localStorage.setItem(TOKEN_KEY, val);
    $tokenInput.value = '';
    $tokenInput.placeholder = '已儲存 (隱藏中)';
    fetchAll();
  }
}

$tokenSave.addEventListener('click', saveToken);
$tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveToken(); });

if (getToken()) {
  $tokenInput.placeholder = '已儲存 (隱藏中)';
}

/* ==============================================
   Fetch helpers
   ============================================== */
async function fetchJSON(path, auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (!token) return { success: false, error: '未設定 Service Token' };
    headers['Authorization'] = 'Bearer ' + token;
  }
  try {
    const res = await fetch(API_BASE + path, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message || '網路錯誤' };
  }
}

/* ==============================================
   Status determination
   ============================================== */
function determineKpiStatus(value, cfg) {
  if (value == null) return 'unknown';
  if (cfg.dir === 'lower') {
    if (value <= cfg.target) return 'ok';
    if (value <= cfg.critical) return 'warn';
    return 'error';
  }
  /* higher is better */
  if (value >= cfg.target) return 'ok';
  if (value >= cfg.critical) return 'warn';
  return 'error';
}

function statusColor(status) {
  if (status === 'ok') return 'var(--green)';
  if (status === 'warn') return 'var(--yellow)';
  if (status === 'error') return 'var(--red)';
  return 'var(--text-muted)';
}

/* ==============================================
   Render: Health Probes
   ============================================== */
function renderProbes(checks) {
  if (!checks) {
    $probes.innerHTML = '';
    return;
  }
  const entries = Object.entries(checks);
  $probes.innerHTML = entries.map(([name, info]) => {
    const ok = info.status === 'ok';
    const dotColor = ok ? 'var(--green)' : 'var(--red)';
    const label = name.replace(/_/g, ' ');
    const latency = info.latency_ms != null ? info.latency_ms + 'ms' : '--';
    return `<div class="probe-chip">
      <span class="probe-chip__dot" style="background:${dotColor}"></span>
      ${escapeHtml(label)}
      <span class="probe-chip__latency">${latency}</span>
    </div>`;
  }).join('');
}

/* ==============================================
   Render: KPI Card
   ============================================== */
function renderKpiCard(id, value, cfg) {
  const el = document.getElementById('kpi-' + id);
  if (!el) return;
  const valEl = el.querySelector('.card__value');
  const status = determineKpiStatus(value, cfg);
  valEl.textContent = value != null ? cfg.fmt(value) : '--';
  valEl.style.color = statusColor(status);
}

/* ==============================================
   Render: Usage Grid
   ============================================== */
function renderUsage(metricsData) {
  $usageGrid.innerHTML = USAGE_DEFS.map(def => {
    const raw = metricsData ? metricsData[def.field] : null;
    const value = raw != null ? raw : 0;
    const pct = def.limit > 0 ? (value / def.limit) * 100 : 0;
    const pctClamped = Math.min(pct, 100);
    let barColor = 'var(--green)';
    if (pct >= 80) barColor = 'var(--yellow)';
    if (pct >= 95) barColor = 'var(--red)';

    const valueLabel = def.unit === 'GB'
      ? value.toFixed(1) + ' / ' + def.limit + ' GB'
      : formatNum(value) + ' / ' + def.limitLabel;

    return `<div class="usage-card">
      <div class="usage-card__header">
        <span class="usage-card__name">${escapeHtml(def.label)}</span>
        <span class="usage-card__pct" style="color:${barColor}">${pct.toFixed(1)}%</span>
      </div>
      <div class="usage-bar">
        <div class="usage-bar__fill" style="width:${pctClamped}%;background:${barColor}"></div>
      </div>
      <div class="usage-card__detail">${valueLabel}</div>
    </div>`;
  }).join('');
}

/* ==============================================
   Render: Alerts
   ============================================== */
function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    $alerts.innerHTML = '<div class="alert-empty">目前無活躍告警</div>';
    return;
  }

  $alerts.innerHTML = alerts.map(a => {
    const severity = (a.severity || 'p3').toLowerCase();
    const badge = severity.toUpperCase();
    const time = a.triggered_at ? formatTime(a.triggered_at) : '--';
    return `<div class="alert-item">
      <span class="alert-badge alert-badge--${severity}">${badge}</span>
      <span class="alert-msg">${escapeHtml(a.message || a.description || '--')}</span>
      <span class="alert-time">${time}</span>
    </div>`;
  }).join('');
}

/* ==============================================
   Render: Charts (Canvas 2D)
   ============================================== */
function drawLineChart(canvasId, data, targetLine, yLabel, color, isPercent) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = container.clientWidth * dpr;
  canvas.height = container.clientHeight * dpr;
  ctx.scale(dpr, dpr);

  const W = container.clientWidth;
  const H = container.clientHeight;
  const padL = 48, padR = 12, padT = 12, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  if (!data || data.length === 0) {
    ctx.fillStyle = '#5a6a7a';
    ctx.font = '13px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暫無趨勢資料', W / 2, H / 2);
    return;
  }

  const values = data.map(d => d.value);
  let yMin = Math.min(...values, targetLine) * 0.8;
  let yMax = Math.max(...values, targetLine) * 1.2;
  if (isPercent) { yMin = Math.max(0, yMin); yMax = Math.min(100, yMax); }
  if (yMin === yMax) { yMin -= 10; yMax += 10; }

  const xScale = (i) => padL + (i / Math.max(data.length - 1, 1)) * plotW;
  const yScale = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  /* Grid lines */
  ctx.strokeStyle = '#2a3346';
  ctx.lineWidth = 1;
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const y = padT + (plotH / gridCount) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();

    const val = yMax - ((yMax - yMin) / gridCount) * i;
    ctx.fillStyle = '#5a6a7a';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(isPercent ? val.toFixed(0) + '%' : val.toFixed(0), padL - 6, y + 3);
  }

  /* Target line */
  const targetY = yScale(targetLine);
  ctx.strokeStyle = '#ef444480';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, targetY);
  ctx.lineTo(W - padR, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ef4444';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(isPercent ? targetLine + '%' : targetLine + 'ms', W - padR + 2, targetY + 3);

  /* Data line */
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xScale(i);
    const y = yScale(d.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  /* Data dots */
  data.forEach((d, i) => {
    const x = xScale(i);
    const y = yScale(d.value);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  /* X-axis labels (show every few hours) */
  ctx.fillStyle = '#5a6a7a';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(data.length / 6));
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1) {
      ctx.fillText(d.label || '', xScale(i), H - 6);
    }
  });
}

/* ==============================================
   Overall Status
   ============================================== */
function updateOverallStatus(healthData, metricsData) {
  let level = 'ok';
  let text = '系統正常';

  if (!healthData || healthData.status !== 'ok') {
    level = 'error';
    text = '系統異常';
  } else if (metricsData) {
    /* Check KPIs for warn/error */
    const checks = [
      { v: metricsData.kv_read_latency_ms?.avg, c: KPI_CONFIG.kv },
      { v: metricsData.cdn_cache_hit_rate != null ? metricsData.cdn_cache_hit_rate * 100 : null, c: KPI_CONFIG.cdn },
      { v: metricsData.model_inference_avg_sec, c: KPI_CONFIG.inference },
      { v: metricsData.crawler_success_rate != null ? metricsData.crawler_success_rate * 100 : null, c: KPI_CONFIG.crawler },
      { v: metricsData.analysis_pass_rate != null ? metricsData.analysis_pass_rate * 100 : null, c: KPI_CONFIG.analysis },
    ];
    for (const chk of checks) {
      const s = determineKpiStatus(chk.v, chk.c);
      if (s === 'error') { level = 'error'; text = '指標異常'; break; }
      if (s === 'warn' && level !== 'error') { level = 'warn'; text = '部分指標警告'; }
    }
  }

  $statusDot.className = 'status-dot status-dot--' + level;
  $statusText.textContent = text;
}

/* ==============================================
   Main Fetch
   ============================================== */
async function fetchAll() {
  const now = new Date();
  $lastUpdate.textContent = formatDateTime(now);

  /* 1. Health check (no auth) */
  const healthRes = await fetchJSON('/health/ready');
  const healthData = healthRes.success ? healthRes : (healthRes.data || null);

  if (healthData && healthData.checks) {
    renderProbes(healthData.checks);
  } else if (healthRes.success && healthRes.data && healthRes.data.checks) {
    renderProbes(healthRes.data.checks);
  } else {
    renderProbes(null);
  }

  /* 2. Metrics (auth) */
  const metricsRes = await fetchJSON('/metrics', true);
  const md = metricsRes.success ? (metricsRes.data || metricsRes) : null;

  if (md) {
    const kvAvg = md.kv_read_latency_ms?.avg ?? md.kv_read_latency_ms;
    const cdnRate = md.cdn_cache_hit_rate != null ? md.cdn_cache_hit_rate * 100 : null;
    const crawlerRate = md.crawler_success_rate != null ? md.crawler_success_rate * 100 : null;
    const analysisRate = md.analysis_pass_rate != null ? md.analysis_pass_rate * 100 : null;

    renderKpiCard('kv', kvAvg, KPI_CONFIG.kv);
    renderKpiCard('cdn', cdnRate, KPI_CONFIG.cdn);
    renderKpiCard('inference', md.model_inference_avg_sec, KPI_CONFIG.inference);
    renderKpiCard('crawler', crawlerRate, KPI_CONFIG.crawler);
    renderKpiCard('analysis', analysisRate, KPI_CONFIG.analysis);

    renderUsage(md);

    /* Trend data: accumulate from each fetch */
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    if (kvAvg != null) {
      kvHistory.push({ label: timeLabel, value: kvAvg });
      if (kvHistory.length > 24) kvHistory.shift();
    }
    if (cdnRate != null) {
      cdnHistory.push({ label: timeLabel, value: cdnRate });
      if (cdnHistory.length > 24) cdnHistory.shift();
    }

    /* Use historical data from API if available */
    const kvTrend = md.kv_latency_history || kvHistory;
    const cdnTrend = md.cdn_hit_rate_history || cdnHistory;

    drawLineChart('chart-kv', kvTrend, 30, 'ms', '#3b82f6', false);
    drawLineChart('chart-cdn', cdnTrend, 80, '%', '#22c55e', true);

    /* Alerts */
    renderAlerts(md.active_alerts || []);
  } else {
    /* No metrics data — show placeholder */
    renderUsage(null);
    renderAlerts(null);
    drawLineChart('chart-kv', [], 30, 'ms', '#3b82f6', false);
    drawLineChart('chart-cdn', [], 80, '%', '#22c55e', true);
  }

  /* 3. Overall status */
  const hd = healthRes.success ? healthRes : (healthRes.data ? { status: healthRes.data.status } : null);
  updateOverallStatus(hd, md);

  /* Reset countdown */
  countdownSec = REFRESH_INTERVAL_SEC;
}

/* ==============================================
   Countdown Timer
   ============================================== */
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownSec = REFRESH_INTERVAL_SEC;

  countdownTimer = setInterval(() => {
    countdownSec--;
    $countdown.textContent = Math.max(0, countdownSec);
    if (countdownSec <= 0) {
      fetchAll();
    }
  }, 1000);
}

$refreshBtn.addEventListener('click', () => {
  countdownSec = REFRESH_INTERVAL_SEC;
  fetchAll();
});

/* ==============================================
   Utility Functions
   ============================================== */
function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatDateTime(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return y + '/' + m + '/' + day + ' ' + h + ':' + min;
}

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } catch {
    return '--';
  }
}

/* ==============================================
   Resize handler for charts
   ============================================== */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawLineChart('chart-kv', kvHistory, 30, 'ms', '#3b82f6', false);
    drawLineChart('chart-cdn', cdnHistory, 80, '%', '#22c55e', true);
  }, 200);
});

/* ==============================================
   Init
   ============================================== */
fetchAll();
startCountdown();
