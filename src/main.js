import './style.css';
import { Chart, registerables } from 'chart.js';
import { transactions as knownTransactions, USDT_RATE_VND } from './data.js';

Chart.register(...registerables);

// ===== CONFIG =====
const BTC_ADDRESS = '3J4khZgkxF7UHeeWJvoGer5ZTPxLg2dY3j';

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

function satoshiToBTC(satoshi) {
  return satoshi / 100000000;
}

// ===== BLOCKCHAIN API =====
async function fetchTransactionsFromBlockchain() {
  try {
    const res = await fetch(`https://blockchain.info/rawaddr/${BTC_ADDRESS}?cors=true`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    return data.txs || [];
  } catch (err) {
    console.warn('Blockchain API fetch failed:', err);
    return null;
  }
}

// Parse blockchain tx to find amount received by our address
function parseTx(tx) {
  let btcReceived = 0;
  for (const out of tx.out) {
    if (out.addr === BTC_ADDRESS) {
      btcReceived += out.value;
    }
  }
  const date = new Date(tx.time * 1000);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

  return {
    tx_hash: tx.hash,
    date: dateStr,
    timestamp: tx.time,
    btc_received: satoshiToBTC(btcReceived),
    gas_fee_btc: satoshiToBTC(tx.fee),
    total_btc_spent: satoshiToBTC(btcReceived + tx.fee),
  };
}

// ===== FETCH HISTORICAL BTC PRICE =====
async function fetchHistoricalPrice(dateStr) {
  // dateStr format: YYYY-MM-DD → need DD-MM-YYYY for CoinGecko
  const parts = dateStr.split('-');
  const cgDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${cgDate}`);
    if (!res.ok) throw new Error('CoinGecko rate limited');
    const data = await res.json();
    return Math.round(data.market_data.current_price.usd);
  } catch (err) {
    console.warn(`Failed to fetch price for ${dateStr}:`, err);
    return null;
  }
}

// ===== MERGE KNOWN + NEW TRANSACTIONS =====
async function getAllTransactions() {
  const statusEl = document.getElementById('loading-status');

  // Step 1: Start with known transactions
  const knownHashes = new Set(knownTransactions.map(t => t.tx_hash));
  let allTransactions = [...knownTransactions];

  // Step 2: Try to fetch from blockchain
  if (statusEl) statusEl.textContent = '🔍 Đang kiểm tra giao dịch mới từ blockchain...';

  const blockchainTxs = await fetchTransactionsFromBlockchain();

  if (blockchainTxs) {
    // Find new transactions
    const newTxs = [];
    for (const tx of blockchainTxs) {
      if (!knownHashes.has(tx.hash)) {
        const parsed = parseTx(tx);
        if (parsed.btc_received > 0) {
          newTxs.push(parsed);
        }
      }
    }

    if (newTxs.length > 0) {
      if (statusEl) statusEl.textContent = `🆕 Tìm thấy ${newTxs.length} giao dịch mới! Đang tra giá BTC...`;

      // Fetch historical prices for new transactions
      for (const tx of newTxs) {
        const price = await fetchHistoricalPrice(tx.date);
        if (price) {
          tx.btc_price_usd = price;
          tx.cost_usd = parseFloat((tx.total_btc_spent * price).toFixed(2));
          tx.cost_vnd = Math.round(tx.cost_usd * USDT_RATE_VND);
        } else {
          // Use current BTC price as fallback
          const currentPrice = await fetchBtcPrice();
          tx.btc_price_usd = currentPrice || 70000;
          tx.cost_usd = parseFloat((tx.total_btc_spent * tx.btc_price_usd).toFixed(2));
          tx.cost_vnd = Math.round(tx.cost_usd * USDT_RATE_VND);
        }
        allTransactions.push(tx);
      }

      if (statusEl) statusEl.textContent = `✅ Đã cập nhật ${newTxs.length} giao dịch mới!`;
    } else {
      if (statusEl) statusEl.textContent = '✅ Không có giao dịch mới';
    }
  } else {
    if (statusEl) statusEl.textContent = '⚠️ Không thể kết nối blockchain API, dùng dữ liệu đã lưu';
  }

  // Sort by date
  allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Re-index
  allTransactions.forEach((t, i) => t.index = i + 1);

  // Hide status after 5 seconds
  setTimeout(() => {
    if (statusEl) statusEl.style.opacity = '0';
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 500);
  }, 5000);

  return allTransactions;
}

// ===== DATA CALCULATIONS =====
function calcSummary(txList, currentBtcPrice) {
  const totalBtcReceived = txList.reduce((s, t) => s + t.btc_received, 0);
  const totalGasFee = txList.reduce((s, t) => s + t.gas_fee_btc, 0);
  const totalCostUSD = txList.reduce((s, t) => s + t.cost_usd, 0);
  const totalCostVND = txList.reduce((s, t) => s + t.cost_vnd, 0);
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
    txCount: txList.length
  };
}

// ===== FETCH BTC PRICE =====
async function fetchBtcPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    return data.bitcoin.usd;
  } catch {
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
function renderDashboard(txList, btcPrice) {
  const summary = calcSummary(txList, btcPrice);

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

  document.getElementById('current-price').textContent = fmtUSD(btcPrice);
  document.getElementById('current-price').style.color = isProfit ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('current-value-vnd').textContent = fmtVND(Math.round(summary.currentValueVND));
  document.getElementById('tx-count').textContent = summary.txCount;

  document.getElementById('last-updated').textContent =
    'Cập nhật: ' + new Date().toLocaleString('vi-VN');
}

function renderTable(txList) {
  const tbody = document.getElementById('tx-tbody');
  const tfoot = document.getElementById('tx-tfoot');

  let totalBtc = 0, totalGas = 0, totalSpent = 0, totalCostUSD = 0, totalCostVND = 0;

  tbody.innerHTML = txList.map(t => {
    totalBtc += t.btc_received;
    totalGas += t.gas_fee_btc;
    totalSpent += t.total_btc_spent;
    totalCostUSD += t.cost_usd;
    totalCostVND += t.cost_vnd;

    const isNew = !knownTransactions.find(kt => kt.tx_hash === t.tx_hash);
    const rowClass = isNew ? 'class="new-tx-row"' : '';

    return `<tr ${rowClass}>
      <td>${t.index}${isNew ? ' 🆕' : ''}</td>
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

function renderChart(txList, currentPrice) {
  const ctx = document.getElementById('price-chart').getContext('2d');

  const labels = txList.map(t => fmtShortDate(t.date));
  const prices = txList.map(t => t.btc_price_usd);
  const totalCostUSD = txList.reduce((s, t) => s + t.cost_usd, 0);
  const totalBtc = txList.reduce((s, t) => s + t.btc_received, 0);
  const avgPrice = totalCostUSD / totalBtc;
  const avgLine = txList.map(() => avgPrice);

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
          pointBackgroundColor: (ctx) =>
            ctx.dataIndex === prices.length - 1 ? '#10b981' : '#f7931a',
          pointBorderColor: (ctx) =>
            ctx.dataIndex === prices.length - 1 ? '#10b981' : '#f7931a',
          pointRadius: (ctx) =>
            ctx.dataIndex === prices.length - 1 ? 6 : 4,
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
      interaction: { intersect: false, mode: 'index' },
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
            label: (context) =>
              context.dataset.label.split('(')[0] + ': $' + context.parsed.y.toLocaleString()
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
let currentTxList = [];

async function initDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  // Fetch all transactions (known + auto-detect new)
  currentTxList = await getAllTransactions();

  // Render table
  renderTable(currentTxList);

  // Fetch live price & render
  const btcPrice = await fetchBtcPrice();
  if (btcPrice) {
    renderDashboard(currentTxList, btcPrice);
    renderChart(currentTxList, btcPrice);
  } else {
    const lastTx = currentTxList[currentTxList.length - 1];
    renderDashboard(currentTxList, lastTx.btc_price_usd);
    renderChart(currentTxList, lastTx.btc_price_usd);
    document.getElementById('current-price').textContent =
      fmtUSD(lastTx.btc_price_usd) + ' (offline)';
  }
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Always attach logout & refresh (they exist in the DOM regardless)
  document.getElementById('btn-logout').addEventListener('click', logout);

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh');
    btn.style.animation = 'spin 1s linear infinite';

    // Re-fetch everything
    currentTxList = await getAllTransactions();
    renderTable(currentTxList);

    const btcPrice = await fetchBtcPrice();
    if (btcPrice) {
      renderDashboard(currentTxList, btcPrice);
      renderChart(currentTxList, btcPrice);
    }
    btn.style.animation = '';
  });

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
      document.querySelector('.login-container').style.animation = 'none';
      setTimeout(() => {
        document.querySelector('.login-container').style.animation = 'shake 0.4s';
      }, 10);
    }
  });
});

// Add animations
const extraStyle = document.createElement('style');
extraStyle.textContent = `
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
  .new-tx-row {
    background: rgba(16, 185, 129, 0.08) !important;
    border-left: 3px solid var(--accent-green);
  }
  .new-tx-row:hover {
    background: rgba(16, 185, 129, 0.15) !important;
  }
`;
document.head.appendChild(extraStyle);
