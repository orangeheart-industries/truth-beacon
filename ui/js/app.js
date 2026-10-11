/**
 * TruthBeacon Main UI Coordinator
 * Modularized architecture integrating triage, vault, audit, setup, and notification services.
 */

import { appState } from './state.js';
import { invokeCommand } from './ipc.js';
import { renderTriageCards } from './triage.js';
import { renderVaultGrid } from './vault.js';
import { renderAuditTable } from './audit.js';
import { initNotificationListeners } from './notifications.js';
import { loadDiscordConfig, initDiscordSetupListeners } from './discord_setup.js';
import { initModals, openAuthorizedAltModal } from './modals.js';
import { closeAllModals } from './utils.js';

export function switchTab(targetTab) {
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === targetTab));
  tabPanes.forEach(p => p.classList.toggle('active', p.id === `pane-${targetTab}`));
  appState.setTab(targetTab);
}

function updateView() {
  const circuitStatusText = document.getElementById('circuit-status-text');
  const statusGateway = document.getElementById('status-gateway');
  const cb = appState.daemonHealth.circuit_breaker;

  if (circuitStatusText) {
    if (cb.tripped) {
      circuitStatusText.textContent = `Protection: Safety Pause (${cb.remaining_cooldown}s)`;
    } else {
      circuitStatusText.textContent = 'Protection: Active';
    }
  }

  if (statusGateway) {
    statusGateway.textContent = appState.daemonHealth.gateway_connected
      ? 'Discord: Connected'
      : 'Discord: Disconnected';
  }

  renderTriageCards();
  renderVaultGrid();
  renderAuditTable();
}

function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      if (targetTab) switchTab(targetTab);
    });
  });

  document.getElementById('status-gateway')?.addEventListener('click', () => {
    switchTab('discord');
  });

  document.getElementById('btn-reset-circuit')?.addEventListener('click', () => {
    appState.resetCircuitBreaker();
  });
}

function initTriageActionDelegation() {
  const triageContainer = document.getElementById('triage-cards-container');
  triageContainer?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!id) return;

    if (action === 'open-alt-modal') {
      openAuthorizedAltModal(id);
      return;
    }

    if (action === 'ban' || action === 'exclude' || action === 'dismiss') {
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = action === 'ban' ? 'Purging...' : 'Resolving...';
      try {
        await appState.resolveIncident(id, action);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = oldText;
        alert(`Moderation action failed: ${err.message || err}`);
      }
    }
  });
}

function initKeyboardShortcuts() {
  window.addEventListener('keydown', async e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      return;
    }

    if (e.key === 'Escape') {
      closeAllModals();
      return;
    }

    const pendingIncidents = appState.incidents.filter(i => i.status === 'pending');
    if (pendingIncidents.length === 0) return;
    const firstInc = pendingIncidents[0];

    const key = e.key.toUpperCase();
    if (key === 'B') {
      e.preventDefault();
      try {
        await appState.resolveIncident(firstInc.id, 'ban');
      } catch (err) {
        alert(`Ban & Purge failed on Discord: ${err.message || err}`);
      }
    } else if (key === 'W') {
      e.preventDefault();
      openAuthorizedAltModal(firstInc.id);
    } else if (key === 'E') {
      e.preventDefault();
      try {
        await appState.resolveIncident(firstInc.id, 'exclude');
      } catch (err) {
        alert(`Action failed: ${err.message || err}`);
      }
    } else if (key === 'D') {
      e.preventDefault();
      try {
        await appState.resolveIncident(firstInc.id, 'dismiss');
      } catch (err) {
        alert(`Dismiss failed: ${err.message || err}`);
      }
    }
  });
}

async function syncLiveDiagnostics() {
  try {
    const diag = await invokeCommand('get_health_diagnostics');
    if (diag) {
      const footerMem = document.getElementById('footer-memory-stat');
      if (footerMem && typeof diag.resident_memory_mb === 'number') {
        footerMem.textContent = `RAM: ${diag.resident_memory_mb.toFixed(1)} MB • 100% Local SQLite`;
      }
      appState.daemonHealth.gateway_connected = !!diag.gateway_connected;
      appState.daemonHealth.circuit_breaker.tripped = !!diag.circuit_breaker_tripped;
      updateView();
    }
  } catch (_) {}
}

function initApp() {
  initNavigation();
  initTriageActionDelegation();
  initModals();
  initNotificationListeners();
  initDiscordSetupListeners();
  initKeyboardShortcuts();

  appState.subscribe(updateView);
  updateView();
  loadDiscordConfig();

  (async () => {
    await appState.hydrate();
    syncLiveDiagnostics();
  })();

  setInterval(syncLiveDiagnostics, 5000);
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
