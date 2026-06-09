/* ═══════════════════════════════════════════════════════
   ADFORGE v3.0 — UI Enhancement Layer
   ═══════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ─── Toast Notification System ───
  window.showToast = function(title, msg, type, duration) {
    type = type || 'info';
    duration = duration || (type === 'success' ? 3000 : type === 'error' ? 6000 : 4000);
    var icons = {success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<span class="toast-icon">' + (icons[type]||icons.info) + '</span>'
      + '<div class="toast-body"><div class="toast-title">' + title + '</div>'
      + '<div class="toast-msg">' + msg + '</div></div>';
    t.addEventListener('click', function() { dismissToast(t); });
    var c = getToastContainer();
    while (c.children.length >= 5) c.firstChild.remove();
    c.appendChild(t);
    if (duration > 0) setTimeout(function() { dismissToast(t); }, duration);
  };

  function getToastContainer() {
    var c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function dismissToast(t) {
    if (t._dismissing) return;
    t._dismissing = true;
    t.style.opacity = '0';
    t.style.transform = 'translateX(40px)';
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
  }

  // ─── Confirm Dialog ───
  window.confirmAction = function(title, message, confirmText, callback) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal-box" style="max-width:420px">'
      + '<div class="confirm-dialog">'
      + '<div class="confirm-icon">⚠️</div>'
      + '<div class="confirm-title">' + (title || 'Confirm Action') + '</div>'
      + '<div class="confirm-msg">' + (message || 'Are you sure?') + '</div>'
      + '<div class="modal-actions" style="justify-content:center">'
      + '<button class="btn btn-outline btn-cancel">Cancel</button>'
      + '<button class="btn btn-danger btn-confirm">' + (confirmText || 'Confirm') + '</button>'
      + '</div></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.btn-cancel').addEventListener('click', function() {
      overlay.remove(); if (callback) callback(false);
    });
    overlay.querySelector('.btn-confirm').addEventListener('click', function() {
      overlay.remove(); if (callback) callback(true);
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { overlay.remove(); if (callback) callback(false); }
    });
    // Close on Escape
    var escHandler = function(e) { if (e.key === 'Escape') { overlay.remove(); if (callback) callback(false); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
  };

  // ─── Loading State Manager ───
  window.showLoading = function(msg) {
    var existing = document.getElementById('globalLoading');
    if (existing) existing.style.display = 'flex';
    else {
      var el = document.createElement('div');
      el.id = 'globalLoading';
      el.className = 'loading-overlay';
      el.innerHTML = '<div style="text-align:center"><div class="loading-spinner"></div><div class="loading-text">' + (msg || 'Loading...') + '</div></div>';
      document.body.appendChild(el);
    }
  };

  window.hideLoading = function() {
    var el = document.getElementById('globalLoading');
    if (el) el.style.display = 'none';
  };

  // ─── Auto-init on DOM ready ───
  document.addEventListener('DOMContentLoaded', function() {
    // Navigation loading state
    var loader = document.getElementById('pageLoading');
    if (loader) setTimeout(function() { loader.style.display = 'none'; }, 100);

    document.querySelectorAll('a:not([target="_blank"]):not(.no-loader)').forEach(function(link) {
      link.addEventListener('click', function(e) {
        if (this.href && this.href.indexOf(window.location.origin) === 0 && !e.ctrlKey && !e.metaKey) {
          var l = document.getElementById('pageLoading');
          if (l) l.style.display = 'flex';
        }
      });
    });

    // Form validation enhancement
    document.querySelectorAll('form').forEach(function(form) {
      form.addEventListener('submit', function(e) {
        var firstError = null;
        this.querySelectorAll('[required]').forEach(function(input) {
          if (!input.value.trim()) {
            input.classList.add('error');
            if (!firstError) firstError = input;
          } else {
            input.classList.remove('error');
          }
        });
        if (firstError) {
          e.preventDefault();
          firstError.focus();
          showToast('Validation Error', 'Please fill in all required fields', 'error');
        }
      });
    });

    // Auto-dismiss alerts
    document.querySelectorAll('.alert-success, .alert-info').forEach(function(el) {
      setTimeout(function() {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px)';
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
      }, 5000);
    });

    // Data attribute auto-refresh
    var autoRefresh = document.getElementById('autoRefresh');
    if (autoRefresh) {
      var interval = parseInt(autoRefresh.getAttribute('data-interval') || '30000');
      var url = autoRefresh.getAttribute('data-url') || window.location.href;
      setInterval(function() {
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function(r) { return r.text(); })
          .then(function(html) {
            var container = document.getElementById('refreshContainer');
            if (container) {
              var parser = new DOMParser();
              var doc = parser.parseFromString(html, 'text/html');
              var newContent = doc.getElementById('refreshContainer');
              if (newContent) container.innerHTML = newContent.innerHTML;
            }
          })
          .catch(function() { /* silent fail for auto-refresh */ });
      }, interval);
    }
  });

  // ─── Utility: format currency ───
  window.formatRupiah = function(num) {
    if (num === null || num === undefined) return 'Rp0';
    return 'Rp' + Number(num).toLocaleString('id-ID', {minimumFractionDigits: 0, maximumFractionDigits: 0});
  };

  // ─── Utility: api fetch wrapper ───
  window.api = function(method, url, data) {
    var opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    };
    if (data) opts.body = JSON.stringify(data);
    return fetch(url, opts).then(function(r) { return r.json(); });
  };

})();
