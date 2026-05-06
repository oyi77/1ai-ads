import { metaAccounts } from '../lib/meta-accounts.js';
import { api } from '../lib/api.js';

// Store selected account in localStorage
function selectAccount(accountId) {
  localStorage.setItem('adforge_selected_ad_account', accountId);
  window.dispatchEvent(new CustomEvent('ad-account-selected', { detail: { accountId } }));
}

function getSelectedAccount() {
  return localStorage.getItem('adforge_selected_ad_account');
}

export function renderAdAccountSelector() {
  const selectedAccount = getSelectedAccount();

  return `
    <div class="ad-account-selector">
      <select id="ad-account-select" class="ad-account-select" onchange="handleAdAccountChange(this.value)">
        <option value="" disabled ${!selectedAccount ? 'selected' : ''}>Select Ad Account</option>
        <option value="all" ${selectedAccount === 'all' ? 'selected' : ''}>All Accounts (Dashboard)</option>
      </select>
      <button id="connect-meta-btn" class="btn-primary" onclick="connectMetaAccount()">Connect Meta Account</button>
      <button id="refresh-accounts-btn" class="btn-secondary" onclick="refreshAdAccounts()">🔄 Refresh</button>
    </div>
  `;
}

window.connectMetaAccount = () => {
  // Get fresh OAuth URL
  api.get('/auth/facebook/login')
    .then(result => {
      if (result.data.fb_url) {
        window.open(result.data.fb_url, '_blank');
      }
    })
    .catch(err => {
      alert('Failed to get login URL: ' + err.message);
    });
};

window.refreshAdAccounts = () => {
  metaAccounts.fetchAccounts()
    .then(data => {
      const select = document.getElementById('ad-account-select');
      select.innerHTML = '<option value="" disabled>Select Account</option><option value="all">All Accounts</option>';
      
      if (data.accounts && data.accounts.length > 0) {
        data.accounts.forEach(account => {
          const option = document.createElement('option');
          option.value = account.id;
          option.textContent = `${account.name} (${account.businessName}) - ${account.currency}`;
          if (account.id === getSelectedAccount()) {
            option.selected = true;
          }
          select.appendChild(option);
        });
        
        if (!document.querySelector('#ad-account-select option[selected]')) {
          select.selectedIndex = 1;
          selectAccount(data.accounts[0].id);
        }
        
        alert(`Loaded ${data.accounts.length} ad accounts!`);
      } else {
        select.innerHTML = '<option value="no-accounts" disabled>No Ad Accounts found. Connect your Meta account first via "Connect Meta Account".</option>';
        select.disabled = true;
        alert('No ad accounts found. Please connect your Meta/Facebook account first.');
      }
    })
    .catch(err => {
      console.error('Failed to fetch ad accounts:', err);
      alert('Failed to load ad accounts: ' + err.message);
    });
};

window.handleAdAccountChange = (accountId) => {
  selectAccount(accountId);
  window.dispatchEvent(new CustomEvent('ad-account-change', { detail: { accountId } }));
};

// Auto-fetch accounts on page load if user is authenticated
function autoFetchAccounts() {
  const select = document.getElementById('ad-account-select');
  if (select && !select.disabled) {
    select.disabled = true;
    select.innerHTML = '<option value="loading">Loading your ad accounts...</option>';
    
    metaAccounts.fetchAccounts()
      .then(data => {
        select.disabled = false;
        select.innerHTML = '<option value="" disabled>Select Ad Account</option><option value="all">All Accounts (Dashboard)</option>';
        
        if (data.accounts && data.accounts.length > 0) {
          data.accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = `${account.name} (${account.businessName}) - ${account.currency}`;
            if (account.id === getSelectedAccount()) {
              option.selected = true;
            }
            select.appendChild(option);
          });
          
          // Auto-select first account if none selected
          if (!document.querySelector('#ad-account-select option[selected]')) {
            select.selectedIndex = 1;
            selectAccount(data.accounts[0].id);
          }
          
          console.log('Loaded', data.accounts.length, 'ad accounts');
        } else {
          select.innerHTML = '<option value="no-accounts" disabled>No Ad Accounts found. Connect your Meta account first via "Connect Meta Account".</option>';
          select.disabled = true;
        }
      })
      .catch(err => {
        select.disabled = false;
        select.innerHTML = '<option value="error" disabled>Failed to load accounts. Click "Refresh" to try again.</option>';
        console.error('Auto-fetch accounts failed:', err);
      });
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(autoFetchAccounts, 500);
  });
} else {
  setTimeout(autoFetchAccounts, 500);
}
