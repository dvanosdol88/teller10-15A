const STORE_KEY = 'teller:enrollment';
const MAX_TRANSACTIONS = 10;

const toastEl = document.getElementById('toast');

let runtimeConfig = null;

async function fetchRuntimeConfig() {
  try {
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      return { enabled: false, apiBaseUrl: '/api' };
    }
    const resp = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (resp && resp.ok) {
      const cfg = await resp.json().catch(() => ({}));
      const applicationId = typeof cfg.applicationId === 'string' ? cfg.applicationId.trim() : '';
      const environment = typeof cfg.environment === 'string' ? cfg.environment : 'development';
      const apiBaseUrl = typeof cfg.apiBaseUrl === 'string' && cfg.apiBaseUrl ? cfg.apiBaseUrl : '/api';
      if (!applicationId) {
        throw new Error('Runtime configuration is missing applicationId.');
      }
      runtimeConfig = { applicationId, environment, apiBaseUrl };
      window.__tellerRuntimeConfig = runtimeConfig;
      return runtimeConfig;
    }
  } catch (error) {
    console.warn('Failed to load runtime config, will use mock data', error);
  }
  return null;
}

function showToast(message, variant = 'info') {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.dataset.variant = variant;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3200);
}

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('hidden', hidden);
}

function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return '—';
  }
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount}`;
  }
}

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  } catch {
    return '—';
  }
}

function formatTimeAgo(ts) {
  if (!ts) return '—';
  try {
    const now = new Date();
    const then = new Date(ts);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return formatTimestamp(ts);
  } catch {
    return formatTimestamp(ts);
  }
}

function formatAmount(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';
  const formatted = formatCurrency(Math.abs(Number(amount)), currency);
  return Number(amount) >= 0 ? `+${formatted}` : `-${formatted}`;
}

function getStoredEnrollment() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse stored enrollment', error);
    return null;
  }
}

function storeEnrollment(enrollment) {
  localStorage.setItem(STORE_KEY, JSON.stringify(enrollment));
}

function clearEnrollment() {
  localStorage.removeItem(STORE_KEY);
}

async function apiRequest(path, { method = 'GET', body, headers = {}, params } = {}) {
  const token = window.__tellerAccessToken;
  if (!token) throw new Error('Missing access token');
  const baseUrl = runtimeConfig?.apiBaseUrl || '/api';
  const finalHeaders = {
    Authorization: `Bearer ${token}`,
    ...headers,
  };
  const options = { method, headers: finalHeaders };
  if (body !== undefined) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!('Content-Type' in finalHeaders)) {
      options.headers['Content-Type'] = 'application/json';
    }
  }
  if (params) { options.params = params; }
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = await response.text();
    }
    const error = new Error(`Request failed: ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

const MOCK_ACCOUNTS = [
  { id: 'acc_checking', name: 'Checking', institution: 'Demo Bank', last_four: '1234', currency: 'USD' },
  { id: 'acc_savings', name: 'Savings', institution: 'Demo Bank', last_four: '9876', currency: 'USD' }
];

const MOCK_BALANCES = {
  acc_checking: { available: 1250.25, ledger: 1300.25, currency: 'USD', cached_at: new Date().toISOString() },
  acc_savings: { available: 8200.00, ledger: 8200.00, currency: 'USD', cached_at: new Date().toISOString() }
};

const MOCK_TRANSACTIONS = {
  acc_checking: [
    { description: 'Coffee Shop', amount: -3.75, date: '2025-10-08' },
    { description: 'Payroll', amount: 2500.00, date: '2025-10-01' },
  ],
  acc_savings: []
};

class Dashboard {
  constructor(config) {
    this.config = config;
    this.grid = document.getElementById('accounts-grid');
    this.emptyState = document.getElementById('empty-state');
    this.statusEnvironment = document.getElementById('env-value');
    this.statusUser = document.getElementById('user-value');
    this.statusToken = document.getElementById('token-value');
    this.template = document.getElementById('account-card-template');
    this.cards = new Map();
  }

  init() {
    if (this.statusEnvironment) {
      this.statusEnvironment.textContent = this.config?.environment || 'development';
    }
    const enrollment = getStoredEnrollment();
    if (enrollment?.accessToken) {
      this.onConnected(enrollment);
      this.bootstrap();
    } else {
      setHidden(this.emptyState, false);
    }
    this.setupConnect();
  }

  setupConnect() {
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    
    if (!this.config || !this.config.applicationId) {
      console.warn('No runtime configuration available, using mock data mode');
      connectBtn?.setAttribute('disabled', 'true');
      return;
    }

    const { applicationId, environment } = this.config;
    if (!applicationId || !environment) {
      console.error('Runtime configuration is missing required Teller Connect values.');
      connectBtn?.setAttribute('disabled', 'true');
      return;
    }

    const connector = window.TellerConnect.setup({
      applicationId,
      environment,
      institution: 'td_bank',
      onSuccess: async (enrollment) => {
        try {
          window.__tellerAccessToken = enrollment.accessToken;
          storeEnrollment(enrollment);
          this.onConnected(enrollment);

          const enrollmentResponse = await apiRequest('/enrollments', {
            method: 'POST',
            body: { enrollment },
          });

          this.renderAccounts(enrollmentResponse?.accounts ?? []);
          
          showToast('Enrollment saved and cache primed.');
        } catch (error) {
          console.error(error);
          showToast('Unable to store enrollment. Please try again.', 'error');
        }
      },
      onExit: () => {
        console.log('Teller Connect widget closed');
        showToast('Connection cancelled');
      },
    });

    connectBtn?.removeAttribute('disabled');
    connectBtn?.addEventListener('click', () => connector.open());
    disconnectBtn?.addEventListener('click', () => {
      clearEnrollment();
      window.__tellerAccessToken = undefined;
      this.reset();
      if (this.statusEnvironment) {
        this.statusEnvironment.textContent = this.config.environment;
      }
      setHidden(this.emptyState, false);
      connectBtn?.focus();
      if (disconnectBtn) disconnectBtn.hidden = true;
      showToast('Disconnected. Connect again to load data.');
    });
  }

  async bootstrap() {
    try {
      const data = await apiRequest('/db/accounts');
      this.renderAccounts(data?.accounts ?? []);
    } catch (error) {
      if (error.status === 401) {
        this.reset();
        clearEnrollment();
        showToast('Session expired. Please reconnect.', 'error');
      } else {
        console.error('Failed to load accounts', error);
        showToast('Unable to load cached accounts.', 'error');
      }
    }
  }

  renderAccounts(accounts) {
    if (this.grid) {
      this.grid.innerHTML = '';
    }
    this.cards.clear();

    if (!accounts || accounts.length === 0) {
      setHidden(this.emptyState, false);
      return;
    }

    setHidden(this.emptyState, true);
    accounts.forEach((account) => this.renderCard(account));
  }
  
  onConnected(enrollment) {
    window.__tellerAccessToken = enrollment.accessToken;
    if (this.statusUser) {
      this.statusUser.textContent = enrollment.user?.id ?? 'Connected';
    }
    if (this.statusToken) {
      this.statusToken.textContent = enrollment.accessToken ?? '—';
    }
    if (this.statusEnvironment) {
      this.statusEnvironment.textContent = this.config?.environment || 'development';
    }
    const disconnect = document.getElementById('disconnect-btn');
    if (disconnect) disconnect.hidden = false;
    setHidden(this.emptyState, true);
  }

  reset() {
    if (this.statusUser) {
      this.statusUser.textContent = '—';
    }
    if (this.statusToken) {
      this.statusToken.textContent = '—';
    }
    if (this.grid) {
      this.grid.innerHTML = '';
    }
    this.cards.clear();
  }

  renderCard(account) {
    if (!this.template) return;
    const node = this.template.content.firstElementChild.cloneNode(true);
    node.dataset.accountId = account.id;

    const flipButtons = node.querySelectorAll('.flip-btn');
    flipButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        node.classList.toggle('is-flipped');
      });
    });

    const refreshBtn = node.querySelector('.refresh-btn');
    refreshBtn.addEventListener('click', async () => {
      try {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing…';
        await Promise.all([
          apiRequest(`/accounts/${account.id}/balances`),
          apiRequest(`/accounts/${account.id}/transactions`, { params: { count: MAX_TRANSACTIONS } }),
        ]);
        await this.populateCard(account.id);
        showToast('Live data cached.');
      } catch (error) {
        console.error('Refresh failed', error);
        if (error.status === 401) {
          clearEnrollment();
          this.reset();
          showToast('Session expired. Please reconnect.', 'error');
        } else {
          showToast('Unable to refresh account.', 'error');
        }
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
      }
    });

    const toggleBtns = node.querySelectorAll('.toggle-btn');
    const viewPanels = node.querySelectorAll('.view-panel');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.view === targetView));
        viewPanels.forEach(panel => {
          if (panel.classList.contains(targetView)) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });

    if (this.grid) {
      this.grid.appendChild(node);
    }
    this.cards.set(account.id, node);
    this.populateCard(account.id, account);
  }

  async populateCard(accountId, accountSummary) {
    const card = this.cards.get(accountId);
    if (!card) return;
    const currency = accountSummary?.currency ?? 'USD';
    
    const nameEls = card.querySelectorAll('.account-name');
    nameEls.forEach((el) => (el.textContent = accountSummary?.name ?? 'Account'));
    const subtitle = [accountSummary?.institution, accountSummary?.last_four ? `•••• ${accountSummary.last_four}` : null]
      .filter(Boolean)
      .join(' · ');
    card.querySelectorAll('.account-subtitle').forEach((el) => (el.textContent = subtitle));

    try {
      const balance = await apiRequest(`/db/accounts/${accountId}/balances`);
      const balanceData = balance?.balance ?? {};
      const cachedAt = balance?.cached_at ?? null;
      card.querySelector('.balance-available').textContent = formatCurrency(balanceData.available, currency);
      card.querySelector('.balance-ledger').textContent = formatCurrency(balanceData.ledger, currency);
      card.querySelector('.balance-cached').textContent = `Cached: ${formatTimestamp(cachedAt)}`;
    } catch (error) {
      console.warn('No cached balance yet', error);
      card.querySelector('.balance-cached').textContent = 'Cached: Never';
    }

    try {
      const transactions = await apiRequest(`/db/accounts/${accountId}/transactions`, {
        params: { limit: MAX_TRANSACTIONS },
      });
      const list = card.querySelector('.transactions-list');
      list.innerHTML = '';
      const txs = transactions?.transactions ?? [];
      if (!txs.length) {
        setHidden(card.querySelector('.transactions-empty'), false);
      } else {
        setHidden(card.querySelector('.transactions-empty'), true);
        txs.forEach((tx) => {
          const li = document.createElement('li');
          const details = document.createElement('div');
          details.className = 'details';
          const description = document.createElement('span');
          description.className = 'description';
          description.textContent = tx.description || 'Transaction';
          const date = document.createElement('span');
          date.className = 'date';
          date.textContent = tx.date ? new Date(tx.date).toLocaleDateString() : '';
          details.append(description, date);
          const amount = document.createElement('span');
          amount.className = 'amount';
          amount.textContent = formatAmount(tx.amount, currency);
          li.append(details, amount);
          list.appendChild(li);
        });
      }
      const cached = transactions?.cached_at ? formatTimestamp(transactions.cached_at) : 'Never';
      card.querySelector('.transactions-cached').textContent = `Cached: ${cached}`;
    } catch (error) {
      console.warn('No cached transactions yet', error);
      const empty = card.querySelector('.transactions-empty');
      empty.textContent = 'Unable to load transactions.';
      setHidden(empty, false);
    }

    try {
      const manualData = await apiRequest(`/db/accounts/${accountId}/manual-data`);
      const rentRollValue = card.querySelector('.rent-roll-value');
      const manualDataUpdated = card.querySelector('.manual-data-updated');
      
      if (manualData.rent_roll !== null && manualData.rent_roll !== undefined) {
        rentRollValue.textContent = formatCurrency(manualData.rent_roll, currency);
      } else {
        rentRollValue.textContent = '—';
      }
      
      if (manualData.updated_at) {
        manualDataUpdated.textContent = `Last updated: ${formatTimeAgo(manualData.updated_at)}`;
      } else {
        manualDataUpdated.textContent = '—';
      }

      const editBtn = card.querySelector('.edit-manual-data-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => openManualDataModal(accountId, manualData.rent_roll, currency));
      }
    } catch (error) {
      console.warn('No manual data available', error);
    }
  }
}

function openManualDataModal(accountId, currentValue, currency) {
  const modal = document.getElementById('manual-data-modal');
  const input = document.getElementById('rent-roll-input');
  const saveBtn = modal.querySelector('.modal-save');
  const cancelBtn = modal.querySelector('.modal-cancel');
  const clearBtn = modal.querySelector('.modal-clear');
  const closeBtn = modal.querySelector('.modal-close');
  const overlay = modal.querySelector('.modal-overlay');

  input.value = currentValue !== null ? currentValue : '';
  modal.classList.remove('hidden');

  const close = () => {
    modal.classList.add('hidden');
    input.value = '';
  };

  const save = async (valueToSave) => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await apiRequest(`/db/accounts/${accountId}/manual-data`, {
        method: 'PUT',
        body: { rent_roll: valueToSave }
      });
      showToast('Manual data saved successfully');
      close();
      window.location.reload();
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };

  const saveHandler = () => {
    const value = input.value.trim();
    if (value === '') {
      showToast('Please enter a value or use Clear');
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      showToast('Please enter a valid non-negative number');
      return;
    }
    save(numValue);
  };

  const clearHandler = () => {
    if (confirm('Clear rent roll value?')) {
      save(null);
    }
  };

  saveBtn.addEventListener('click', saveHandler);
  clearBtn.addEventListener('click', clearHandler);
  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveHandler();
  });
}

(async function bootstrap() {
  patchFetchForParams();
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.setAttribute('disabled', 'true');
  }
  try {
    const config = await fetchRuntimeConfig();
    if (config) {
      const dashboard = new Dashboard(config);
      dashboard.init();
    } else {
      console.log('Running in visual-only mode with mock data');
      if (connectBtn) {
        connectBtn.textContent = 'Connect (disabled in visual mode)';
      }
      setHidden(document.getElementById('empty-state'), false);
    }
  } catch (error) {
    console.error('Failed to bootstrap dashboard', error);
    showToast('Unable to load configuration. Please try again later.', 'error');
  }
})();

function patchFetchForParams() {
  const originalFetch = window.fetch;
  window.fetch = (input, init = {}) => {
    if (init && init.params) {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
      Object.entries(init.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      });
      delete init.params;
      return originalFetch(url.toString(), init);
    }
    return originalFetch(input, init);
  };
}
