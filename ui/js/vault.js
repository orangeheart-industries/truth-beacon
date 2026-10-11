import { appState } from './state.js';
import { escapeHtml, openModal } from './utils.js';
import { DOMPurify } from './dompurify.js';

function _buildVaultAltsHtml(bm) {
  if (!bm.authorized_alts || bm.authorized_alts.length === 0) return '';
  const altsTags = bm.authorized_alts.map(alt =>
    `<span class="vault-alt-tag" title="${escapeHtml(alt.note)}">Alt: ${escapeHtml(alt.label)} (${escapeHtml(alt.user_id.slice(-4))})</span>`
  ).join('');

  return `
    <div class="vault-alts-section">
      <div class="vault-alts-label">Approved Secondary Accounts:</div>
      <div class="vault-tags-row" style="margin-bottom: 0;">
        ${altsTags}
      </div>
    </div>
  `;
}

export function buildBenchmarkCardHtml(bm) {
  const rawDisplayName = bm.server_nickname || bm.canonical_username;
  const displayName = escapeHtml(rawDisplayName);
  const hasDistinctHandle = bm.server_nickname && bm.server_nickname !== bm.canonical_username;
  const safeCanonical = escapeHtml(bm.canonical_username);
  const safeRole = escapeHtml(bm.community_role);
  const tagsHtml = (bm.tags || []).map(t => `<span class="vault-tag-pill">${escapeHtml(t)}</span>`).join('');
  const altsHtml = _buildVaultAltsHtml(bm);

  return `
    <div class="vault-card" id="vault-${escapeHtml(bm.id)}">
      <div class="vault-card-banner"></div>
      <div class="vault-avatar-wrapper">
        <img src="${escapeHtml(bm.avatar_url || 'assets/logo.svg')}" alt="${safeCanonical}" onerror="this.onerror=null; this.src='assets/logo.svg'">
        <span class="vault-status-dot online" title="Status: Online & Protected"></span>
      </div>

      <div class="vault-card-body">
        <div class="vault-header-row">
          <div class="vault-user-info">
            <div class="vault-display-name" title="${displayName}">${displayName}</div>
            <div class="vault-user-meta">
              <span class="vault-handle">@${safeCanonical.toLowerCase()}</span>
              ${hasDistinctHandle ? `<span class="vault-meta-divider">•</span><span class="vault-account-name">${safeCanonical}</span>` : ''}
            </div>
          </div>
          <span class="vault-protected-badge" title="Active Protected Identity">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
            PROTECTED
          </span>
        </div>

        <div class="vault-role-line">
          <span>Role:</span>
          <span class="vault-role-badge">
            <span class="role-circle" style="background-color: var(--brand-blurple);"></span>
            ${safeRole}
          </span>
        </div>

        <div class="vault-tags-row">
          ${tagsHtml}
        </div>

        ${altsHtml}

        <div class="vault-shield-status">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Active Impersonation Shield</span>
        </div>
      </div>
    </div>
  `;
}

function _renderEmptyVault(vaultContainer) {
  const emptyMarkup = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 56px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-card);">
      <div style="width: 48px; height: 48px; margin: 0 auto 14px; border-radius: 50%; background: rgba(88, 101, 242, 0.12); border: 1px solid rgba(88, 101, 242, 0.25); display: flex; align-items: center; justify-content: center; color: var(--brand-blurple);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <h3 style="color: var(--text-header); font-weight: 700; font-size: 1.15rem; margin-bottom: 6px;">No Protected Benchmarks Yet</h3>
      <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 440px; margin: 0 auto 18px;">
        Add server leaders, moderators, or staff to create official ground-truth benchmarks that safeguard against imposter accounts.
      </p>
      <button class="btn btn-primary" id="btn-empty-add-bm" style="display: inline-flex; align-items: center; gap: 8px; margin: 0 auto;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Enroll First Leader</span>
      </button>
    </div>
  `;
  vaultContainer.innerHTML = DOMPurify.sanitize(emptyMarkup);
  const emptyBtn = document.getElementById('btn-empty-add-bm');
  const modalCreateBm = document.getElementById('modal-create-benchmark');
  emptyBtn?.addEventListener('click', () => {
    openModal(modalCreateBm);
  });
}

export function renderVaultGrid() {
  const vaultContainer = document.getElementById('vault-grid-container');
  const counterVault = document.getElementById('counter-vault');
  if (!vaultContainer) return;

  if (counterVault) {
    counterVault.textContent = `(${appState.benchmarks.length})`;
  }

  if (appState.benchmarks.length === 0) {
    _renderEmptyVault(vaultContainer);
    return;
  }

  const rawHtml = appState.benchmarks.map(buildBenchmarkCardHtml).join('');
  vaultContainer.innerHTML = DOMPurify.sanitize(rawHtml);
}
