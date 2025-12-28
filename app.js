import { SessionKit } from 'https://unpkg.com/@wharfkit/session@1.6.1/lib/session.m.js';
import { WebRenderer } from 'https://unpkg.com/@wharfkit/web-renderer@1.4.3/lib/web-renderer.m.js';
import { WalletPluginAnchor } from 'https://unpkg.com/@wharfkit/wallet-plugin-anchor@1.6.1/lib/wallet-plugin-anchor.m.js';

const chainId = '384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0';
const endpoints = ['https://proton.greymass.com', 'https://proton.eoscafeblock.com'];
const appIdentifier = 'FlexTokens';

const tokens = [
  { symbol: 'WON', name: 'WON', contract: 'w3won', explorer: 'https://explorer.xprnetwork.org/tokens/WON-proton-w3won' },
  { symbol: 'EASY', name: 'EASY', contract: 'mon3y', explorer: 'https://explorer.xprnetwork.org/tokens/EASY-proton-mon3y' },
  { symbol: 'MEME', name: 'MEME', contract: 'm3m3', explorer: 'https://explorer.xprnetwork.org/tokens/MEME-proton-m3m3' }
];

const sessionKit = new SessionKit(
  {
    appName: appIdentifier,
    chains: [{ id: chainId, url: endpoints[0] }]
  },
  {
    ui: new WebRenderer(),
    walletPlugins: [new WalletPluginAnchor()]
  }
);

let session;
const tokenStats = {};

const el = {
  connect: document.getElementById('connectBtn'),
  disconnect: document.getElementById('disconnectBtn'),
  sessionStatus: document.getElementById('sessionStatus'),
  tokenGrid: document.getElementById('tokenGrid'),
  balanceList: document.getElementById('balanceList'),
  refreshBalances: document.getElementById('refreshBalances'),
  transferForm: document.getElementById('transferForm'),
  transferToken: document.getElementById('transferToken'),
  transferTo: document.getElementById('transferTo'),
  transferAmount: document.getElementById('transferAmount'),
  transferMemo: document.getElementById('transferMemo'),
  transferSubmit: document.getElementById('transferSubmit'),
  transferResult: document.getElementById('transferResult'),
  lookupForm: document.getElementById('lookupForm'),
  lookupAccount: document.getElementById('lookupAccount'),
  lookupResults: document.getElementById('lookupResults'),
  actionsGrid: document.getElementById('actionsGrid'),
  toast: document.getElementById('toast')
};

const state = {
  loadingBalances: false,
  loadingTokens: false,
  loadingActions: false
};

const abiCache = {};
const preferredActionOrder = ['transfer', 'distribute', 'radiate', 'setflextoken', 'sprouttoken', 'setflexpool', 'addpool', 'setconfig', 'noflexzone', 'optoutoftax', 'settree', 'settreememo', 'open', 'close', 'issue', 'burn', 'create'];
const actionForms = new Map();

function showToast(message, tone = 'info') {
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  el.toast.classList.add('show');
  el.toast.style.borderColor = tone === 'error' ? 'rgba(247,107,138,0.5)' : 'rgba(110,243,197,0.5)';
  clearTimeout(el.toast._timer);
  el.toast._timer = setTimeout(() => {
    el.toast.classList.remove('show');
    setTimeout(() => el.toast.classList.add('hidden'), 200);
  }, 3200);
}

function formatQuantity(value, precision) {
  return Number(value || 0).toFixed(precision);
}

function short(str, len = 10) {
  if (!str) return '';
  if (str.length <= len) return str;
  return `${str.slice(0, len / 2)}…${str.slice(-len / 2)}`;
}

async function rpcPost(path, body) {
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        lastError = new Error(`RPC ${path} failed on ${endpoint} (${res.status})`);
        continue;
      }
      const data = await res.json();
      return { data, endpoint };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All endpoints failed');
}

async function fetchTokenStats() {
  state.loadingTokens = true;
  renderTokens();
  try {
    await Promise.all(tokens.map(async (token) => {
      const { data } = await rpcPost('/v1/chain/get_currency_stats', { code: token.contract, symbol: token.symbol });
      const info = data[token.symbol];
      if (!info) return;
      const [supplyAmount] = (info.supply || '').split(' ');
      const decimals = supplyAmount && supplyAmount.includes('.') ? supplyAmount.split('.')[1].length : 4;
      tokenStats[token.symbol] = {
        supply: info.supply,
        maxSupply: info.max_supply,
        issuer: info.issuer,
        precision: decimals
      };
    }));
  } catch (err) {
    console.error(err);
    showToast('Could not load token stats from RPC.', 'error');
  } finally {
    state.loadingTokens = false;
    renderTokens();
  }
}

async function ensureAbi(contract) {
  if (abiCache[contract]) return abiCache[contract];
  const { data } = await rpcPost('/v1/chain/get_abi', { account_name: contract });
  if (!data?.abi) {
    throw new Error(`ABI unavailable for ${contract}`);
  }
  abiCache[contract] = data.abi;
  return data.abi;
}

function renderTokens() {
  el.tokenGrid.innerHTML = '';
  tokens.forEach((token) => {
    const stats = tokenStats[token.symbol];
    const card = document.createElement('div');
    card.className = 'token-card';
    card.innerHTML = `
      <div class="token-header">
        <div>
          <h3>${token.name}</h3>
          <div class="token-meta">Contract: <span class="mono">${token.contract}</span></div>
        </div>
        <a class="pill" href="${token.explorer}" target="_blank" rel="noreferrer">Explorer</a>
      </div>
      <div class="token-stats">
        <div class="stat">
          <label>Supply</label>
          <strong>${stats?.supply || (state.loadingTokens ? 'Loading…' : '—')}</strong>
        </div>
        <div class="stat">
          <label>Max supply</label>
          <strong>${stats?.maxSupply || (state.loadingTokens ? 'Loading…' : '—')}</strong>
        </div>
        <div class="stat">
          <label>Issuer</label>
          <strong class="mono">${stats?.issuer || (state.loadingTokens ? 'Loading…' : '—')}</strong>
        </div>
      </div>
    `;
    el.tokenGrid.appendChild(card);
  });
}

function updateSessionUI() {
  if (session) {
    el.sessionStatus.textContent = `Connected as ${session.actor}`;
    el.sessionStatus.classList.remove('offline');
    el.sessionStatus.classList.add('online');
    el.connect.disabled = true;
    el.disconnect.disabled = false;
    el.refreshBalances.disabled = false;
    el.transferSubmit.disabled = false;
  } else {
    el.sessionStatus.textContent = 'Wallet not connected';
    el.sessionStatus.classList.add('offline');
    el.sessionStatus.classList.remove('online');
    el.connect.disabled = false;
    el.disconnect.disabled = true;
    el.refreshBalances.disabled = true;
    el.transferSubmit.disabled = true;
    el.balanceList.innerHTML = 'Connect a wallet to load balances.';
    el.balanceList.classList.add('empty');
  }
}

async function connectWallet() {
  try {
    el.connect.disabled = true;
    el.connect.textContent = 'Connecting…';
    const { session: sess } = await sessionKit.login({ chain: chainId });
    session = sess;
    updateSessionUI();
    showToast(`Connected as ${session.actor}`);
    await loadBalances(session.actor);
  } catch (err) {
    console.error(err);
    showToast('Connection cancelled or failed.', 'error');
  } finally {
    el.connect.textContent = 'Connect wallet';
    if (!session) el.connect.disabled = false;
  }
}

async function disconnectWallet() {
  try {
    if (session) {
      await sessionKit.logout(session);
    }
  } catch (err) {
    console.warn('Error removing session', err);
  } finally {
    session = undefined;
    updateSessionUI();
    showToast('Disconnected');
  }
}

async function loadBalances(actor) {
  if (!actor) return;
  state.loadingBalances = true;
  el.balanceList.classList.remove('empty');
  el.balanceList.innerHTML = '<div class="balance-item"><span class="label">Loading balances…</span><span class="value">⏳</span></div>';
  try {
    const balances = await Promise.all(tokens.map(async (token) => {
      const { data } = await rpcPost('/v1/chain/get_currency_balance', {
        account: actor,
        code: token.contract,
        symbol: token.symbol
      });
      const balance = Array.isArray(data) && data.length ? data[0] : `0.0000 ${token.symbol}`;
      return { token, balance };
    }));
    el.balanceList.innerHTML = '';
    balances.forEach(({ token, balance }) => {
      const row = document.createElement('div');
      row.className = 'balance-item';
      row.innerHTML = `
        <div>
          <div class="label">${token.symbol}</div>
          <div class="mono small">${token.contract}</div>
        </div>
        <div class="value">${balance}</div>
      `;
      el.balanceList.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    el.balanceList.innerHTML = 'Unable to fetch balances.';
    el.balanceList.classList.add('empty');
    showToast('Balance lookup failed.', 'error');
  } finally {
    state.loadingBalances = false;
  }
}

async function submitTransfer(evt) {
  evt.preventDefault();
  if (!session) {
    showToast('Connect a wallet before sending.', 'error');
    return;
  }
  const symbol = el.transferToken.value;
  const token = tokens.find((t) => t.symbol === symbol);
  const to = el.transferTo.value.trim();
  const amount = Number(el.transferAmount.value);
  const memo = el.transferMemo.value.trim();
  const precision = tokenStats[symbol]?.precision || 4;

  if (!to || !amount || amount <= 0) {
    showToast('Enter a valid recipient and amount.', 'error');
    return;
  }

  el.transferSubmit.disabled = true;
  el.transferSubmit.textContent = 'Awaiting signature…';
  el.transferResult.textContent = '';

  try {
    const quantity = `${formatQuantity(amount, precision)} ${symbol}`;
    const tx = await session.transact({
      actions: [
        {
          account: token.contract,
          name: 'transfer',
          authorization: [session.permissionLevel],
          data: {
            from: session.actor,
            to,
            quantity,
            memo
          }
        }
      ]
    });

    el.transferResult.innerHTML = `
      <div>Transfer sent: <span class="mono">${quantity}</span> → <span class="mono">${to}</span></div>
      <div class="helper-text mono small">Transaction id: ${short(tx.transaction_id || tx.resolved?.transaction?.id || tx.processed?.id || 'pending')}</div>
    `;
    showToast('Transfer submitted to network.');
    await loadBalances(session.actor);
  } catch (err) {
    console.error(err);
    const reason = err?.cause?.message || err?.message || 'Transfer failed.';
    el.transferResult.textContent = reason;
    showToast(reason, 'error');
  } finally {
    el.transferSubmit.textContent = 'Send with wallet';
    if (session) el.transferSubmit.disabled = false;
  }
}

async function lookupAccount(evt) {
  evt.preventDefault();
  const account = el.lookupAccount.value.trim();
  if (!account) return;
  el.lookupResults.classList.remove('empty');
  el.lookupResults.innerHTML = '<div class="lookup-row"><span>Loading…</span><span class="mono">⏳</span></div>';
  try {
    const balances = await Promise.all(tokens.map(async (token) => {
      const { data } = await rpcPost('/v1/chain/get_currency_balance', {
        account,
        code: token.contract,
        symbol: token.symbol
      });
      const balance = Array.isArray(data) && data.length ? data[0] : `0.0000 ${token.symbol}`;
      return { token, balance };
    }));
    el.lookupResults.innerHTML = '';
    balances.forEach(({ token, balance }) => {
      const row = document.createElement('div');
      row.className = 'lookup-row';
      row.innerHTML = `
        <span>${token.symbol}</span>
        <span class="mono">${balance}</span>
      `;
      el.lookupResults.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    el.lookupResults.innerHTML = `<div class="lookup-row"><span>Error</span><span class="mono small">${err.message}</span></div>`;
    el.lookupResults.classList.remove('empty');
    showToast('Lookup failed.', 'error');
  }
}

function buildFieldsForAction(abi, actionName, fieldsWrap) {
  const action = abi.actions.find((a) => a.name === actionName);
  const struct = abi.structs.find((s) => s.name === action?.type);
  fieldsWrap.innerHTML = '';
  if (!struct?.fields?.length) {
    fieldsWrap.innerHTML = '<div class="action-hint">This action accepts no parameters.</div>';
    return;
  }
  struct.fields.forEach((field) => {
    const fieldWrap = document.createElement('label');
    fieldWrap.innerHTML = `
      <span>${field.name} <span class="mono small">(${field.type})</span></span>
      <input data-field="${field.name}" type="text" placeholder="${field.type === 'asset' ? '0.0000 SYMBOL' : field.type}">
    `;
    fieldsWrap.appendChild(fieldWrap);
  });
}

function sortActions(abi) {
  return [...abi.actions].sort((a, b) => {
    const ia = preferredActionOrder.indexOf(a.name);
    const ib = preferredActionOrder.indexOf(b.name);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function readFields(fieldsWrap) {
  const inputs = fieldsWrap.querySelectorAll('[data-field]');
  const data = {};
  inputs.forEach((input) => {
    const name = input.dataset.field;
    const raw = input.value;
    data[name] = raw;
  });
  return data;
}

async function executeAction(token, selectEl, fieldsWrap, resultEl, buttonEl) {
  if (!session) {
    showToast('Connect a wallet to sign transactions.', 'error');
    return;
  }
  const actionName = selectEl.value;
  const abi = abiCache[token.contract];
  const payload = readFields(fieldsWrap);
  buttonEl.disabled = true;
  buttonEl.textContent = 'Awaiting signature…';
  resultEl.textContent = '';
  try {
    const tx = await session.transact({
      actions: [
        {
          account: token.contract,
          name: actionName,
          authorization: [session.permissionLevel],
          data: payload
        }
      ]
    });
    const txid = tx.transaction_id || tx.resolved?.transaction?.id || tx.processed?.id || '';
    resultEl.innerHTML = `
      <div>Called <strong>${actionName}</strong> on <span class="mono">${token.contract}</span></div>
      <div class="helper-text mono small">${txid ? `Transaction: ${short(txid)}` : 'Sent for signing'}</div>
    `;
    showToast(`${actionName} sent to network.`);
    if (session?.actor) await loadBalances(session.actor);
  } catch (err) {
    console.error(err);
    const reason = err?.cause?.message || err?.message || 'Action failed.';
    resultEl.textContent = reason;
    showToast(reason, 'error');
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Execute with wallet';
  }
}

async function buildActionCard(token) {
  const card = document.createElement('div');
  card.className = 'action-card';
  const header = document.createElement('header');
  header.innerHTML = `
    <div>
      <div class="eyebrow">${token.name}</div>
      <h3 style="margin:4px 0;">${token.contract}</h3>
    </div>
    <a class="pill" href="${token.explorer}" target="_blank" rel="noreferrer">Explorer</a>
  `;
  const selectLabel = document.createElement('label');
  selectLabel.innerHTML = '<span>Action</span>';
  const select = document.createElement('select');
  selectLabel.appendChild(select);
  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'action-fields';
  const hint = document.createElement('div');
  hint.className = 'action-hint';
  hint.textContent = 'Most actions require you to provide the same fields shown in the explorer. Numbers, names, and assets must respect on-chain formats.';
  const submit = document.createElement('button');
  submit.className = 'btn primary small';
  submit.type = 'button';
  submit.textContent = 'Execute with wallet';
  const result = document.createElement('div');
  result.className = 'result';
  card.appendChild(header);
  card.appendChild(selectLabel);
  card.appendChild(fieldsWrap);
  card.appendChild(hint);
  card.appendChild(submit);
  card.appendChild(result);
  el.actionsGrid.appendChild(card);

  try {
    const abi = await ensureAbi(token.contract);
    const sortedActions = sortActions(abi);
    sortedActions.forEach((action) => {
      const opt = document.createElement('option');
      opt.value = action.name;
      opt.textContent = action.name;
      select.appendChild(opt);
    });
    buildFieldsForAction(abi, sortedActions[0]?.name, fieldsWrap);
    select.addEventListener('change', () => buildFieldsForAction(abi, select.value, fieldsWrap));
    submit.addEventListener('click', () => executeAction(token, select, fieldsWrap, result, submit));
    actionForms.set(token.contract, { select, fieldsWrap, result, submit });
  } catch (err) {
    console.error(err);
    fieldsWrap.innerHTML = `<div class="action-hint">Unable to fetch ABI for ${token.contract}. Try refreshing.</div>`;
  }
}

async function renderActionCards() {
  state.loadingActions = true;
  el.actionsGrid.innerHTML = '<div class="action-hint">Loading contract ABIs…</div>';
  try {
    el.actionsGrid.innerHTML = '';
    for (const token of tokens) {
      await buildActionCard(token);
    }
  } finally {
    state.loadingActions = false;
  }
}

function bindEvents() {
  el.connect.addEventListener('click', connectWallet);
  el.disconnect.addEventListener('click', disconnectWallet);
  el.refreshBalances.addEventListener('click', () => session && loadBalances(session.actor));
  el.transferForm.addEventListener('submit', submitTransfer);
  el.lookupForm.addEventListener('submit', lookupAccount);
}

async function init() {
  bindEvents();
  updateSessionUI();
  renderTokens();
  await fetchTokenStats();
  await renderActionCards();
  try {
    const restored = await sessionKit.restore();
    if (restored?.session) {
      session = restored.session;
      updateSessionUI();
      await loadBalances(session.actor);
      showToast(`Restored session for ${session.actor}`);
    }
  } catch (err) {
    console.warn('No prior session to restore', err);
  }
}

init();
