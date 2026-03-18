import './style.css';
import { Chart, registerables } from 'chart.js';
import { transactions, USDT_RATE_VND } from './data.js';

Chart.register(...registerables);

// ===== AUTH =====
const VALID_USER = 'hn999';
const VALID_PASS = '15041993Hn';
const SESSION_KEY = 'btc_dca_auth';

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

function login(user, pass) {
  if (user === VALID_USER && pass === VALID_PASS) {
    sessionStorage.setItem(SESSION_KEY, 'true');
    return true;
  }
  return false;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

// ===== FORMAT HELPERS =====
function fmtBTC(val) {
  return val.toFixed(8);
}

function fmtUSD(val) {
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtUSD2(val) {
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVND(val) {
  return val.toLocaleString('vi-VN') + 'đ';
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ===== DATA CALCULATIONS =====
function calcSummary(currentBtcPrice) {
  const totalBtcReceived = transactions.reduce((s, t) => s + t.btc_received, 0);
  const totalGasFee = transactions.reduce((s, t) => s + t.gas_fee_btc, 0);
  const totalCostUSD = transactions.reduce((s, t) => s + t.cost_usd, 0);
  const totalCostVND = transactions.reduce((s, t) => s + t.cost_vnd, 0);
  const avgPriceUSD = totalCostUSD / totalBtcReceived;
  const currentValueUSD = totalBtcReceived * currentBtcPrice;
  const currentValueVND = currentValueUSD * USDT_RATE_VND;
  const pnlVND = currentValueVND - totalCostVND;
  const pnlPercent = ((currentValueVND - totalCostVND) / totalCostVND) * 100;

  return {
    totalBtcReceived,
    totalGasFee,
    totalCostUSD,
    totalCostVND,
    avgPriceUSD,
    currentValueUSD,
    currentValueVND,
    pnlVND,
    pnlPercent,
    txCount: transactions.length
  };
}

// ===== FETCH BTC PRICE =====
async function fetchBtcPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    return data.bitcoin.usd;
  } catch {
    // Fallback: try alternative API
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      const data = await res.json();
      return parseFloat(data.data.amount);
    } catch {
      return null;
    }
  }
}

// ===== RENDER DASHBOARD =====
function renderDashboard(btcPrice) {
  const summary = calcSummary(btcPrice);

  // Stats cards
  document.getElementById('total-btc').textContent = fmtBTC(summary.totalBtcReceived) + ' BTC';
  document.getElementById('total-invested').textContent = fmtVND(summary.totalCostVND);
  document.getElementById('avg-price').textContent = fmtUSD(Math.round(summary.avgPriceUSD));
  
  const pnlCard = document.getElementById('pnl-card');
  const pnlValue = document.getElementById('pnl-value');
  const pnlPercent = document.getElementById('pnl-percent');
  
  const isProfit = summary.pnlVND >= 0;
  pnlCard.className = 'stat-card ' + (isProfit ? 'stat-green' : 'stat-red');
  pnlValue.textContent = (isProfit ? '+' : '') + fmtVND(Math.round(summary.pnlVND));
  pnlValue.style.color = isProfit ? 'var(--accent-green)' : 'var(--accent-red)';
  pnlPercent.textContent = (isProfit ? '+' : '') + summary.pnlPercent.toFixed(1) + '%';
  pnlPercent.style.color = isProfit ? 'var(--accent-green)' : 'var(--accent-red)';

  // Price row
  document.getElementById('current-price').textContent = fmtUSD(btcPrice);
  document.getElementById('current-price').style.color = isProfit ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('current-value-vnd').textContent = fmtVND(Math.round(summary.currentValueVND));
  document.getElementById('tx-count').textContent = summary.txCount;

  // Last updated
  document.getElementById('last-updated').textContent =
    'Cập nhật: ' + new Date().toLocaleString('vi-VN');
}

function renderTable() {
  const tbody = document.getElementById('tx-tbody');
  const tfoot = document.getElementById('tx-tfoot');

  let totalBtc = 0, totalGas = 0, totalSpent = 0, totalCostUSD = 0, totalCostVND = 0;

  tbody.innerHTML = transactions.map(t => {
    totalBtc += t.btc_received;
    totalGas += t.gas_fee_btc;
    totalSpent += t.total_btc_spent;
    totalCostUSD += t.cost_usd;
    totalCostVND += t.cost_vnd;

    return `<tr>
      <td>${t.index}</td>
      <td>${fmtDate(t.date)}</td>
      <td class="td-btc">${fmtBTC(t.btc_received)}</td>
      <td class="td-gas">${fmtBTC(t.gas_fee_btc)}</td>
      <td class="td-btc">${fmtBTC(t.total_btc_spent)}</td>
      <td class="td-price">${fmtUSD(t.btc_price_usd)}</td>
      <td class="td-cost-usd">${fmtUSD2(t.cost_usd)}</td>
      <td class="td-cost-vnd">${fmtVND(t.cost_vnd)}</td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `<tr>
    <td colspan="2">Tổng cộng</td>
    <td class="td-btc">${fmtBTC(totalBtc)}</td>
    <td class="td-gas">${fmtBTC(totalGas)}</td>
    <td class="td-btc">${fmtBTC(totalSpent)}</td>
    <td></td>
    <td class="td-cost-usd">${fmtUSD2(totalCostUSD)}</td>
    <td class="td-cost-vnd">${fmtVND(totalCostVND)}</td>
  </tr>`;
}

// ===== CHART =====
let chartInstance = null;

function renderChart(currentPrice) {
  const ctx = document.getElementById('price-chart').getContext('2d');

  const labels = transactions.map(t => fmtShortDate(t.date));
  const prices = transactions.map(t => t.btc_price_usd);
  const totalCostUSD = transactions.reduce((s, t) => s + t.cost_usd, 0);
  const totalBtc = transactions.reduce((s, t) => s + t.btc_received, 0);
  const avgPrice = totalCostUSD / totalBtc;
  const avgLine = transactions.map(() => avgPrice);

  // Add current price as last point
  labels.push('Hiện tại');
  prices.push(currentPrice);
  avgLine.push(avgPrice);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Giá BTC tại lần mua ($)',
          data: prices,
          borderColor: '#f7931a',
          backgroundColor: 'rgba(247, 147, 26, 0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: (ctx) => {
            return ctx.dataIndex === prices.length - 1 ? '#10b981' : '#f7931a';
          },
          pointBorderColor: (ctx) => {
            return ctx.dataIndex === prices.length - 1 ? '#10b981' : '#f7931a';
          },
          pointRadius: (ctx) => {
            return ctx.dataIndex === prices.length - 1 ? 6 : 4;
          },
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Giá TB mua vào ($' + Math.round(avgPrice).toLocaleString() + ')',
          data: avgLine,
          borderColor: '#ef4444',
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 12 },
            usePointStyle: true,
            padding: 20,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              return context.dataset.label.split('(')[0] + ': $' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: v => '$' + (v / 1000).toFixed(0) + 'K'
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
        }
      }
    }
  });
}

// ===== INIT =====
async function initDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  renderTable();

  // Fetch live price
  const btcPrice = await fetchBtcPrice();
  if (btcPrice) {
    renderDashboard(btcPrice);
    renderChart(btcPrice);
  } else {
    // Use last known price from data
    const lastTx = transactions[transactions.length - 1];
    renderDashboard(lastTx.btc_price_usd);
    renderChart(lastTx.btc_price_usd);
    document.getElementById('current-price').textContent = fmtUSD(lastTx.btc_price_usd) + ' (offline)';
  }
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Check session
  if (isLoggedIn()) {
    initDashboard();
    return;
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    
    if (login(user, pass)) {
      initDashboard();
    } else {
      const errEl = document.getElementById('login-error');
      errEl.textContent = '❌ Sai tài khoản hoặc mật khẩu';
      document.getElementById('password').value = '';
      // Shake animation
      document.querySelector('.login-container').style.animation = 'none';
      setTimeout(() => {
        document.querySelector('.login-container').style.animation = 'shake 0.4s';
      }, 10);
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Refresh
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh');
    btn.style.animation = 'spin 1s linear infinite';
    const btcPrice = await fetchBtcPrice();
    if (btcPrice) {
      renderDashboard(btcPrice);
      renderChart(btcPrice);
    }
    btn.style.animation = '';
  });
});

// Add shake animation dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-10px); }
    40% { transform: translateX(10px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(6px); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(shakeStyle);
