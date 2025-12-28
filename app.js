import { SessionKit } from 'https://unpkg.com/@wharfkit/session@1.6.1/lib/session.m.js';
import { WebRenderer } from 'https://unpkg.com/@wharfkit/web-renderer@1.4.3/lib/web-renderer.m.js';
import { WalletPluginAnchor } from 'https://unpkg.com/@wharfkit/wallet-plugin-anchor@1.6.1/lib/wallet-plugin-anchor.m.js';
import { WalletPluginWebAuth } from 'https://unpkg.com/@wharfkit/wallet-plugin-webauth@1.6.1/lib/wallet-plugin-webauth.m.js';

const chainId = '384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0';
const endpoints = ['https://proton.greymass.com', 'https://proton.eoscafeblock.com'];
const appIdentifier = 'FlexTokens';

const tokens = [
  { symbol: 'WON', name: 'WON', contract: 'w3won', explorer: 'https://explorer.xprnetwork.org/tokens/WON-proton-w3won' },
  { symbol: 'EASY', name: 'EASY', contract: 'mon3y', explorer: 'https://explorer.xprnetwork.org/tokens/EASY-proton-mon3y' },
  { symbol: 'MEME', name: 'MEME', contract: 'm3m3', explorer: 'https://explorer.xprnetwork.org/tokens/MEME-proton-m3m3' }
];

const anchorPlugin = new WalletPluginAnchor();
const webAuthPlugin = new WalletPluginWebAuth({ appName: appIdentifier });

const sessionKit = new SessionKit(
  {
    appName: appIdentifier,
    chains: [{ id: chainId, url: endpoints[0] }]
  },
  {
    ui: new WebRenderer(),
    walletPlugins: [webAuthPlugin, anchorPlugin]
  }
);

let session;
const tokenStats = {};
let loginInFlight = false;

const el = {
  connect: document.getElementById('connectBtn'),
  disconnect: document.getElementById('disconnectBtn'),
  sessionStatus: document.getElementById('sessionStatus'),
  tokenGrid: document.getElementById('tokenGrid'),
  actionsGrid: document.getElementById('actionsGrid'),
  walletModal: document.getElementById('walletModal'),
  walletClose: document.getElementById('walletClose'),
  walletAnchor: document.getElementById('walletAnchor'),
  walletWebAuth: document.getElementById('walletWebAuth'),
  toast: document.getElementById('toast')
};

const state = {
  loadingTokens: false
};

const actionCatalog = {
  mon3y: [
    {
      name: 'transfer',
      label: 'transfer',
      description: 'Send EASY tokens (flex tax applies).',
      fields: [
        { name: 'from', type: 'name', autofill: 'actor' },
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'EASY' },
        { name: 'memo', type: 'string', optional: true }
      ]
    },
    { name: 'distribute', label: 'distribute', description: 'Trigger reflection + burn distribution.', fields: [] },
    {
      name: 'setflextoken',
      label: 'setflextoken',
      description: 'Pick your reward token symbol.',
      fields: [
        { name: 'owner', type: 'name', autofill: 'actor' },
        { name: 'token_symbol', type: 'string', placeholder: 'BTC' }
      ]
    },
    {
      name: 'setconfig',
      label: 'setconfig',
      description: 'Set pagination + rates.',
      fields: [
        { name: 'sym', type: 'symbol', placeholder: '4,EASY' },
        { name: 'start_key', type: 'uint64', placeholder: '0' },
        { name: 'limit', type: 'uint32', placeholder: '100' },
        { name: 'reflection_rate', type: 'uint16', placeholder: '100' },
        { name: 'burn_rate', type: 'uint16', placeholder: '100' }
      ]
    },
    {
      name: 'setflexpool',
      label: 'setflexpool',
      description: 'Register or update a flex pool.',
      fields: [
        { name: 'id', type: 'uint64' },
        { name: 'token_symbol', type: 'symbol', placeholder: '4,EASY' },
        { name: 'token_contract', type: 'name', placeholder: 'swap.alcor' },
        { name: 'pool_ids', type: 'string', placeholder: 'pool ids csv' }
      ]
    },
    {
      name: 'noflexzone',
      label: 'noflexzone',
      description: 'Opt out of taxes/rewards (irreversible without contract auth).',
      fields: [
        { name: 'account', type: 'name', autofill: 'actor' },
        { name: 'ban_status', type: 'bool', placeholder: 'false' }
      ]
    },
    {
      name: 'create',
      label: 'create',
      description: 'Create EASY supply (issuer only).',
      fields: [
        { name: 'issuer', type: 'name' },
        { name: 'maximum_supply', type: 'asset', assetSymbol: 'EASY', placeholder: '21000000.0000 EASY' }
      ]
    },
    {
      name: 'issue',
      label: 'issue',
      description: 'Issue EASY to an account.',
      fields: [
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'EASY' },
        { name: 'memo', type: 'string', optional: true }
      ]
    },
    {
      name: 'open',
      label: 'open',
      description: 'Open balance row for EASY.',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'symbol', type: 'symbol', placeholder: '4,EASY' },
        { name: 'ram_payer', type: 'name' }
      ]
    },
    {
      name: 'close',
      label: 'close',
      description: 'Close zero balance row.',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'symbol', type: 'symbol', placeholder: '4,EASY' }
      ]
    },
    {
      name: 'burn',
      label: 'burn',
      description: 'Burn EASY from an account.',
      fields: [
        { name: 'username', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'EASY' },
        { name: 'memo', type: 'string', optional: true }
      ]
    }
  ],
  w3won: [
    {
      name: 'transfer',
      label: 'transfer',
      description: 'Send WON tokens.',
      fields: [
        { name: 'from', type: 'name', autofill: 'actor' },
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'WON' },
        { name: 'memo', type: 'string', optional: true }
      ]
    },
    { name: 'radiate', label: 'radiate', description: 'Run reflections and burns.', fields: [] },
    {
      name: 'sprouttoken',
      label: 'sprouttoken',
      description: 'Select reward token symbol.',
      fields: [
        { name: 'owner', type: 'name', autofill: 'actor' },
        { name: 'token_symbol', type: 'string', placeholder: 'EASY' }
      ]
    },
    {
      name: 'setconfig',
      label: 'setconfig',
      description: 'Set pagination, rates, and project account.',
      fields: [
        { name: 'sym', type: 'symbol', placeholder: '4,WON' },
        { name: 'start_key', type: 'uint64', placeholder: '0' },
        { name: 'limit', type: 'uint32', placeholder: '100' },
        { name: 'reflection_rate', type: 'uint16', placeholder: '220' },
        { name: 'burn_rate', type: 'uint16', placeholder: '0' },
        { name: 'project_rate', type: 'uint16', placeholder: '80' },
        { name: 'project_account', type: 'name', placeholder: '1won' }
      ]
    },
    {
      name: 'addpool',
      label: 'addpool',
      description: 'Register or update a flex pool.',
      fields: [
        { name: 'id', type: 'uint64' },
        { name: 'token_symbol', type: 'symbol', placeholder: '4,WON' },
        { name: 'token_contract', type: 'name', placeholder: 'swap.alcor' },
        { name: 'pool_ids', type: 'string', placeholder: 'pool ids csv' }
      ]
    },
    {
      name: 'optoutoftax',
      label: 'optoutoftax',
      description: 'Opt out of fees/rewards.',
      fields: [
        { name: 'account', type: 'name', autofill: 'actor' },
        { name: 'ban_status', type: 'bool', placeholder: 'false' }
      ]
    },
    {
      name: 'settree',
      label: 'settree',
      description: 'Assign a tree recipient and rate.',
      fields: [
        { name: 'flexer', type: 'name', autofill: 'actor' },
        { name: 'tree', type: 'name' },
        { name: 'rate', type: 'uint16', placeholder: '10000' }
      ]
    },
    {
      name: 'settreememo',
      label: 'settreememo',
      description: 'Custom memo for tree leg.',
      fields: [
        { name: 'flexer', type: 'name', autofill: 'actor' },
        { name: 'custom_memo', type: 'string', placeholder: 'memo content' }
      ]
    },
    {
      name: 'create',
      label: 'create',
      description: 'Create WON supply (issuer only).',
      fields: [
        { name: 'issuer', type: 'name' },
        { name: 'maximum_supply', type: 'asset', assetSymbol: 'WON', placeholder: '1000000.0000 WON' }
      ]
    },
    {
      name: 'issue',
      label: 'issue',
      description: 'Issue WON to an account.',
      fields: [
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'WON' },
        { name: 'memo', type: 'string', optional: true }
      ]
    },
    {
      name: 'open',
      label: 'open',
      description: 'Open balance row for WON.',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'symbol', type: 'symbol', placeholder: '4,WON' },
        { name: 'ram_payer', type: 'name' }
      ]
    },
    {
      name: 'close',
      label: 'close',
      description: 'Close zero balance row.',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'symbol', type: 'symbol', placeholder: '4,WON' }
      ]
    },
    {
      name: 'burn',
      label: 'burn',
      description: 'Burn WON from an account.',
      fields: [
        { name: 'username', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'WON' },
        { name: 'memo', type: 'string', optional: true }
      ]
    }
  ],
  m3m3: [
    {
      name: 'transfer',
      label: 'transfer',
      description: 'Send MEME tokens.',
      fields: [
        { name: 'from', type: 'name', autofill: 'actor' },
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'MEME' },
        { name: 'memo', type: 'string', optional: true }
      ]
    },
    { name: 'distribute', label: 'distribute', description: 'Trigger reflection + burn distribution.', fields: [] },
    {
      name: 'setflextoken',
      label: 'setflextoken',
      description: 'Pick your reward token symbol.',
      fields: [
        { name: 'owner', type: 'name', autofill: 'actor' },
        { name: 'token_symbol', type: 'string', placeholder: 'EASY' }
      ]
    },
    {
      name: 'setconfig',
      label: 'setconfig',
      description: 'Set pagination + rates.',
      fields: [
        { name: 'sym', type: 'symbol', placeholder: '4,MEME' },
        { name: 'start_key', type: 'uint64', placeholder: '0' },
        { name: 'limit', type: 'uint32', placeholder: '100' },
        { name: 'reflection_rate', type: 'uint16', placeholder: '100' },
        { name: 'burn_rate', type: 'uint16', placeholder: '100' }
      ]
    },
    {
      name: 'setflexpool',
      label: 'setflexpool',
      description: 'Register or update a flex pool.',
      fields: [
        { name: 'id', type: 'uint64' },
        { name: 'token_symbol', type: 'symbol', placeholder: '4,MEME' },
        { name: 'token_contract', type: 'name', placeholder: 'swap.alcor' },
        { name: 'pool_ids', type: 'string', placeholder: 'pool ids csv' }
      ]
    },
    {
      name: 'noflexzone',
      label: 'noflexzone',
      description: 'Opt out of fees/rewards (irreversible without contract auth).',
      fields: [
        { name: 'account', type: 'name', autofill: 'actor' },
        { name: 'ban_status', type: 'bool', placeholder: 'false' }
      ]
    },
    {
      name: 'create',
      label: 'create',
      description: 'Create MEME supply (issuer only).',
      fields: [
        { name: 'issuer', type: 'name' },
        { name: 'maximum_supply', type: 'asset', assetSymbol: 'MEME', placeholder: '10000000000000.0000 MEME' }
      ]
    },
    {
      name: 'issue',
      label: 'issue',
      description: 'Issue MEME to an account.',
      fields: [
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'MEME' },
        { name: 'memo', type: 'string', optional: true }
      ]
    },
    {
      name: 'open',
      label: 'open',
      description: 'Open balance row for MEME.',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'symbol', type: 'symbol', placeholder: '4,MEME' },
        { name: 'ram_payer', type: 'name' }
      ]
    },
    {
      name: 'close',
      label: 'close',
      description: 'Close zero balance row.',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'symbol', type: 'symbol', placeholder: '4,MEME' }
      ]
    },
    {
      name: 'burn',
      label: 'burn',
      description: 'Burn MEME from an account.',
      fields: [
        { name: 'username', type: 'name' },
        { name: 'quantity', type: 'asset', assetSymbol: 'MEME' },
        { name: 'memo', type: 'string', optional: true }
      ]
    }
  ]
};

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

function short(str, len = 10) {
  if (!str) return '';
  if (str.length <= len) return str;
  return `${str.slice(0, len / 2)}...${str.slice(-len / 2)}`;
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
          <strong>${stats?.supply || (state.loadingTokens ? 'Loading...' : '—')}</strong>
        </div>
        <div class="stat">
          <label>Max supply</label>
          <strong>${stats?.maxSupply || (state.loadingTokens ? 'Loading...' : '—')}</strong>
        </div>
        <div class="stat">
          <label>Issuer</label>
          <strong class="mono">${stats?.issuer || (state.loadingTokens ? 'Loading...' : '—')}</strong>
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
  } else {
    el.sessionStatus.textContent = 'Wallet not connected';
    el.sessionStatus.classList.add('offline');
    el.sessionStatus.classList.remove('online');
    el.connect.disabled = false;
    el.disconnect.disabled = true;
  }
  prefillAutofillFields();
  toggleActionButtons();
}

function openWalletModal() {
  if (el.walletModal) el.walletModal.classList.add('show');
}

function closeWalletModal() {
  if (el.walletModal) el.walletModal.classList.remove('show');
}

async function connectWallet(pluginOverride) {
  if (loginInFlight) return;
  loginInFlight = true;
  openWalletModal();
  try {
    el.connect.disabled = true;
    el.connect.textContent = 'Connecting...';
    const args = { chain: chainId };
    if (pluginOverride) args.walletPlugin = pluginOverride;
    const { session: sess } = await sessionKit.login(args);
    session = sess;
    updateSessionUI();
    showToast(`Connected as ${session.actor}`);
    closeWalletModal();
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Connection cancelled or failed.', 'error');
  } finally {
    loginInFlight = false;
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

function normalizeValue(field, raw, token) {
  if (field.type === 'bool') return raw === 'true' || raw === true || raw === '1';
  if (['uint64', 'uint32', 'uint16'].includes(field.type)) {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? raw : parsed;
  }
  if (field.type === 'asset') {
    if (!raw) return raw;
    if (raw.includes(' ')) return raw;
    const precision = tokenStats[token.symbol]?.precision ?? 4;
    const num = Number(raw);
    if (Number.isNaN(num)) return raw;
    const symbol = field.assetSymbol || token.symbol;
    return `${num.toFixed(precision)} ${symbol}`;
  }
  return raw;
}

function prefillAutofillFields() {
  const actor = session?.actor || '';
  document.querySelectorAll('[data-autofill="actor"]').forEach((input) => {
    input.value = actor;
  });
}

function toggleActionButtons() {
  const disabled = !session;
  document.querySelectorAll('.action-submit').forEach((btn) => {
    // eslint-disable-next-line no-param-reassign
    btn.disabled = disabled;
  });
}

function buildActionForm(token, action) {
  const form = document.createElement('form');
  form.className = 'action-form';

  const header = document.createElement('div');
  header.className = 'action-form-head';
  header.innerHTML = `
    <div>
      <h4>${action.label}</h4>
      <div class="action-hint">${action.description || ''}</div>
    </div>
    <span class="tag">${token.contract}</span>
  `;
  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'action-fields';

  if (!action.fields.length) {
    fieldsWrap.innerHTML = '<div class="action-hint">This action has no parameters.</div>';
  } else {
    action.fields.forEach((field) => {
      const label = document.createElement('label');
      label.innerHTML = `<span>${field.name} <span class="mono small">(${field.type})</span></span>`;
      let input;
      if (field.type === 'bool') {
        input = document.createElement('select');
        const optFalse = document.createElement('option');
        optFalse.value = 'false';
        optFalse.textContent = 'false';
        const optTrue = document.createElement('option');
        optTrue.value = 'true';
        optTrue.textContent = 'true';
        input.append(optFalse, optTrue);
      } else {
        input = document.createElement('input');
        input.type = ['uint64', 'uint32', 'uint16'].includes(field.type) ? 'number' : 'text';
        input.placeholder = field.placeholder || field.type;
      }
      input.dataset.field = field.name;
      if (field.autofill === 'actor') input.dataset.autofill = 'actor';
      if (!field.optional && field.type !== 'bool') input.required = true;
      label.appendChild(input);
      fieldsWrap.appendChild(label);
    });
  }

  const submit = document.createElement('button');
  submit.className = 'btn primary small action-submit';
  submit.type = 'submit';
  submit.textContent = `Call ${action.name}`;

  const result = document.createElement('div');
  result.className = 'result';

  form.appendChild(header);
  form.appendChild(fieldsWrap);
  form.appendChild(submit);
  form.appendChild(result);

  form.addEventListener('submit', (evt) => {
    evt.preventDefault();
    submitAction(token, action, form, result, submit);
  });

  return form;
}

async function submitAction(token, action, form, resultEl, buttonEl) {
  if (!session) {
    showToast('Connect a wallet to sign transactions.', 'error');
    return;
  }
  const payload = {};
  const missing = [];
  action.fields.forEach((field) => {
    const input = form.querySelector(`[data-field="${field.name}"]`);
    if (!input) return;
    const raw = (input.value || '').trim();
    if (!raw && !field.optional && field.type !== 'bool') {
      missing.push(field.name);
      return;
    }
    if (!raw && field.optional) return;
    payload[field.name] = normalizeValue(field, raw, token);
  });

  if (missing.length) {
    showToast(`Missing required fields: ${missing.join(', ')}`, 'error');
    return;
  }

  buttonEl.disabled = true;
  buttonEl.textContent = 'Awaiting signature...';
  resultEl.textContent = '';

  try {
    const tx = await session.transact({
      actions: [
        {
          account: token.contract,
          name: action.name,
          authorization: [session.permissionLevel],
          data: payload
        }
      ]
    });
    const txid = tx.transaction_id || tx.resolved?.transaction?.id || tx.processed?.id || '';
    resultEl.innerHTML = `
      <div>Called <strong>${action.name}</strong> on <span class="mono">${token.contract}</span></div>
      <div class="helper-text mono small">${txid ? `Transaction: ${short(txid)}` : 'Sent for signing'}</div>
    `;
    showToast(`${action.name} sent to network.`);
  } catch (err) {
    console.error(err);
    const reason = err?.cause?.message || err?.message || 'Action failed.';
    resultEl.textContent = reason;
    showToast(reason, 'error');
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = `Call ${action.name}`;
  }
}

function renderActionCards() {
  el.actionsGrid.innerHTML = '';
  tokens.forEach((token) => {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="action-card-head">
        <div>
          <div class="eyebrow">${token.name}</div>
          <h3 style="margin:4px 0;">${token.contract}</h3>
        </div>
        <a class="pill" href="${token.explorer}" target="_blank" rel="noreferrer">Explorer</a>
      </div>
    `;
    const list = document.createElement('div');
    list.className = 'action-list';
    const actions = actionCatalog[token.contract] || [];
    actions.forEach((action) => {
      list.appendChild(buildActionForm(token, action));
    });
    card.appendChild(list);
    el.actionsGrid.appendChild(card);
  });
  prefillAutofillFields();
  toggleActionButtons();
}

function bindEvents() {
  el.connect.addEventListener('click', connectWallet);
  el.disconnect.addEventListener('click', disconnectWallet);
  if (el.walletClose) {
    el.walletClose.addEventListener('click', closeWalletModal);
  }
  if (el.walletModal) {
    el.walletModal.addEventListener('click', (evt) => {
      if (evt.target === el.walletModal) closeWalletModal();
    });
  }
  if (el.walletAnchor) {
    el.walletAnchor.addEventListener('click', () => connectWallet(anchorPlugin));
  }
  if (el.walletWebAuth) {
    el.walletWebAuth.addEventListener('click', () => connectWallet(webAuthPlugin));
  }
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
      showToast(`Restored session for ${session.actor}`);
    }
  } catch (err) {
    console.warn('No prior session to restore', err);
  }
}

init();
