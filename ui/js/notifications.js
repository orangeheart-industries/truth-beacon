import { appState } from './state.js';
import { invokeCommand } from './ipc.js';
import { escapeHtml } from './utils.js';

const notifiedIncidentIds = new Set();

export function closeToastWithAnimation(toastEl) {
  if (!toastEl) return;
  if (toastEl._dismissTimer) clearTimeout(toastEl._dismissTimer);
  toastEl.classList.add('hiding');
  setTimeout(() => {
    if (toastEl.parentNode) toastEl.remove();
  }, 220);
}

export function inspectIncidentCard(incidentId) {
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  navTabs.forEach(t => t.classList.remove('active'));
  tabPanes.forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="triage"]')?.classList.add('active');
  document.getElementById('pane-triage')?.classList.add('active');
  appState.setTab('triage');

  requestAnimationFrame(() => {
    const card = document.getElementById(`card-${incidentId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('card-inspected-highlight');
      void card.offsetWidth;
      card.classList.add('card-inspected-highlight');
      setTimeout(() => card.classList.remove('card-inspected-highlight'), 3000);
    }
  });
}

export function showDesktopNotificationToast(payload, forceShow = false) {
  const toastContainer = document.getElementById('desktop-toast-container');
  if (!toastContainer) return;

  const incidentId = payload.incident_id || payload.id;
  if (!forceShow && notifiedIncidentIds.has(incidentId)) {
    return;
  }
  notifiedIncidentIds.add(incidentId);

  const rawTier = (payload.risk_tier || payload.discrepancy?.risk_tier || '').toLowerCase();
  const isCritical = rawTier === 'critical';
  const isElevated = rawTier === 'elevated';

  if (!isCritical && !isElevated && !forceShow) {
    return;
  }

  const tierClass = isCritical ? 'risk-critical' : 'risk-elevated';
  const tierBadge = isCritical ? 'Critical' : 'Elevated';
  const suspectName = payload.suspect_username || payload.discrepancy?.suspect_username || 'Unknown_Suspect';
  const suspectId = payload.suspect_user_id || payload.discrepancy?.suspect_user_id || 'user_demo_101';
  const targetName = payload.matched_benchmark_name || payload.discrepancy?.matched_benchmark_name || 'Protected Leader';

  let similarityPct = 95;
  if (payload.similarity_score !== undefined) {
    similarityPct = Math.round(payload.similarity_score * 100);
  } else if (payload.discrepancy?.string_similarity_score !== undefined) {
    similarityPct = Math.round(payload.discrepancy.string_similarity_score * 100);
  }

  const reason = payload.reason || payload.discrepancy?.normalized_diff || 'Lookalike impersonation candidate detected';

  const existingToast = document.getElementById(`toast-${incidentId}`);
  if (existingToast) existingToast.remove();

  const toastEl = document.createElement('div');
  toastEl.className = `desktop-toast ${tierClass}`;
  toastEl.id = `toast-${incidentId}`;
  toastEl.setAttribute('role', 'alert');
  const safeSuspect = escapeHtml(suspectName);
  const safeTarget = escapeHtml(targetName);
  const safeReason = escapeHtml(reason);
  const safeIncidentId = escapeHtml(incidentId);

  toastEl.innerHTML = `
    <div class="toast-header">
      <div class="toast-brand-row">
        <img src="assets/truthbeacon_emblem.png" class="toast-brand-icon" alt="TruthBeacon">
        <span class="toast-brand-title">TruthBeacon Alert</span>
      </div>
      <div class="toast-header-right">
        <span class="toast-risk-badge ${isCritical ? 'critical' : 'elevated'}">${escapeHtml(tierBadge)}</span>
        <button class="toast-close-btn" data-action="close" title="Dismiss notification" aria-label="Close notification">&times;</button>
      </div>
    </div>
    <div class="toast-body">
      <div class="toast-comparison-strip">
        <span class="toast-suspect-name" title="Suspect Imposter: @${safeSuspect}">@${safeSuspect}</span>
        <span class="toast-vs-tag">VS</span>
        <span class="toast-target-name" title="Official Leader: @${safeTarget}">@${safeTarget}</span>
      </div>
      <div class="toast-meta-line">
        <span class="toast-meta-pill">${similarityPct}% Match</span>
        ${safeReason}
      </div>
    </div>
    <div class="toast-actions-row">
      <button class="btn-toast btn-toast-inspect" data-action="inspect" data-incident-id="${safeIncidentId}" title="Inspect in alerts queue">
        Inspect
      </button>
      <button class="btn-toast btn-toast-dismiss" data-action="dismiss" data-incident-id="${safeIncidentId}" title="Dismiss as benign coincidence [D]">
        <kbd>D</kbd> Dismiss
      </button>
      <button class="btn-toast btn-toast-ban" data-action="ban" data-incident-id="${safeIncidentId}" title="Ban imposter from server [B]">
        <kbd>B</kbd> Ban & Purge
      </button>
    </div>
    <div class="toast-progress-track">
      <div class="toast-progress-bar"></div>
    </div>
  `;

  toastContainer.appendChild(toastEl);

  invokeCommand('dispatch_desktop_notification', {
    payload: {
      incident_id: incidentId,
      risk_tier: isCritical ? 'Critical' : 'Elevated',
      suspect_username: suspectName,
      suspect_user_id: suspectId,
      matched_benchmark_name: targetName,
      similarity_score: similarityPct / 100,
      reason,
      actions: ['Inspect', 'Dismiss', 'Ban & Purge']
    }
  }).catch(() => {});

  toastEl._dismissTimer = setTimeout(() => {
    closeToastWithAnimation(toastEl);
  }, 12000);
}

export function initNotificationListeners() {
  const toastContainer = document.getElementById('desktop-toast-container');
  toastContainer?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const incidentId = btn.getAttribute('data-incident-id');
    const toastEl = btn.closest('.desktop-toast');

    if (action === 'close') {
      closeToastWithAnimation(toastEl);
    } else if (action === 'inspect') {
      closeToastWithAnimation(toastEl);
      inspectIncidentCard(incidentId);
      invokeCommand('execute_notification_action', {
        incident_id: incidentId,
        action: 'Inspect'
      }).catch(() => {});
    } else if (action === 'dismiss') {
      try {
        await appState.resolveIncident(incidentId, 'dismiss');
        closeToastWithAnimation(toastEl);
      } catch (err) {
        alert(`Dismiss failed: ${err.message || err}`);
      }
    } else if (action === 'ban') {
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = 'Purging...';
      try {
        await appState.resolveIncident(incidentId, 'ban');
        closeToastWithAnimation(toastEl);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = oldText;
        alert(`Ban & Purge failed on Discord: ${err.message || err}`);
      }
    }
  });

  if (typeof window !== 'undefined' && window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen('truthbeacon://inspect-incident', event => {
      if (event.payload?.incident_id) {
        inspectIncidentCard(event.payload.incident_id);
      }
    });

    window.__TAURI__.event.listen('truthbeacon://native-notification', event => {
      if (event.payload) {
        showDesktopNotificationToast(event.payload);
      }
    });

    window.__TAURI__.event.listen('truthbeacon://incident-resolved', event => {
      if (event.payload?.incident_id) {
        const incId = event.payload.incident_id;
        const action = event.payload.action;
        const inc = appState.incidents.find(i => i.id === incId);
        if (inc && inc.status === 'pending') {
          inc.status = action === 'ban' ? 'banned' : 'dismissed';
          appState.notify();
        }
      }
    });
  }
}
