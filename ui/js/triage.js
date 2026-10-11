import { appState } from './state.js';
import { escapeHtml, formatTime } from './utils.js';
import { DOMPurify } from './dompurify.js';

function _buildOfficialSideHtml(benchmark, safeCanonical, safeNickname, safeRole) {
  return `
    <div class="profile-side official-side">
      <div class="side-header">
        <span class="side-indicator-dot official"></span>
        <span>Official Protected Member</span>
      </div>
      <div class="profile-main-box">
        <div class="avatar-container">
          <img src="${escapeHtml(benchmark.avatar_url || 'assets/logo.svg')}" alt="${safeCanonical}" onerror="this.onerror=null; this.src='assets/logo.svg'">
          <span class="status-verified-check" title="Verified Server Leader">✓</span>
        </div>
        <div class="profile-identity">
          <div class="profile-display-name" title="${safeNickname}">${safeNickname}</div>
          <div class="profile-handle-sub" title="Canonical Username: @${safeCanonical}">
            <span class="handle-prefix">User:</span>
            <span class="full-username-val">@${safeCanonical}</span>
          </div>
          <div class="profile-role-tag">
            <span class="role-dot"></span>
            ${safeRole}
          </div>
        </div>
      </div>
    </div>
  `;
}

function _buildSuspectSideHtml(d, safeSuspect, safeSuspectNick, renderedSuspectName, isCritical) {
  return `
    <div class="profile-side suspect-side ${isCritical ? '' : 'elevated'}">
      <div class="side-header">
        <span class="side-indicator-dot ${isCritical ? 'suspect' : 'suspect-elevated'}"></span>
        <span>Flagged New Account</span>
      </div>
      <div class="profile-main-box">
        <div class="avatar-container">
          <img src="${escapeHtml(d.suspect_avatar_url || 'assets/logo.svg')}" alt="${safeSuspect}" onerror="this.onerror=null; this.src='assets/logo.svg'">
          <span class="status-alert-mark ${isCritical ? '' : 'elevated'}" title="Flagged Imposter Account">!</span>
        </div>
        <div class="profile-identity">
          <div class="profile-display-name" title="${safeSuspectNick || safeSuspect}">${safeSuspectNick || renderedSuspectName}</div>
          <div class="profile-handle-sub" title="Imposter Username: @${safeSuspect}">
            <span class="handle-prefix">User:</span>
            <span class="full-username-val suspect">@${renderedSuspectName}</span>
          </div>
          <div class="profile-age-tag ${isCritical ? '' : 'elevated'}">
            Joined ${d.suspect_account_age_hours}h ago
          </div>
        </div>
      </div>
    </div>
  `;
}

function _buildThreatStripHtml(safeCanonical, renderedSuspectName, safeSuspect, similarityPct) {
  return `
    <div class="username-threat-bar" aria-label="Exact Username Threat Comparison">
      <div class="threat-user-box real-box" title="Full Real Canonical Username: @${safeCanonical}">
        <div class="threat-user-label">
          <span class="threat-label-dot real"></span>
          <span>Real Username</span>
        </div>
        <div class="threat-user-value">@${safeCanonical}</div>
      </div>
      <div class="threat-vs-divider">
        <span class="threat-vs-text">VS</span>
        <span class="threat-vs-metric">${similarityPct}% match</span>
      </div>
      <div class="threat-user-box imposter-box" title="Full Imposter Username: @${safeSuspect}">
        <div class="threat-user-label">
          <span class="threat-label-dot imposter"></span>
          <span>Imposter Username</span>
        </div>
        <div class="threat-user-value imposter">@${renderedSuspectName}</div>
      </div>
    </div>
  `;
}

function _renderSuspectMarkedName(d, safeSuspect, rawSuspect) {
  if (d.homoglyph_detected && d.homoglyph_char) {
    const safeChar = escapeHtml(d.homoglyph_char);
    return safeSuspect.replace(
      safeChar,
      `<mark class="homoglyph-mark" title="Lookalike letter substitution">${safeChar}</mark>`
    );
  }
  if (rawSuspect.endsWith('_')) {
    return `${escapeHtml(rawSuspect.slice(0, -1))}<mark class="homoglyph-mark" title="Extra underscore added">_</mark>`;
  }
  return safeSuspect;
}

function _buildCardHeaderHtml(isCritical, incTimestamp, d, similarityPct) {
  const riskChipClass = isCritical ? 'risk-critical' : 'risk-elevated';
  const riskText = isCritical ? 'High Risk Imposter' : 'Possible Lookalike';
  const isMatchingPhoto = d.avatar_hamming_distance !== null && d.avatar_hamming_distance <= 5;
  const isMatchingName = Boolean(d.homoglyph_detected || (d.string_similarity_score !== undefined && d.string_similarity_score >= 0.75) || !isMatchingPhoto);

  return `
    <div class="card-header-bar">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span class="risk-chip ${riskChipClass}">
          <span class="risk-icon-dot"></span>
          ${riskText}
        </span>
        <span class="incident-time">Flagged ${formatTime(incTimestamp)}</span>
      </div>
      <div class="flagged-reasons-group">
        ${isMatchingPhoto ? `<span class="reason-pill reason-photo" title="Matching Profile Photo (Hamming: ${d.avatar_hamming_distance})">Photo</span>` : ''}
        ${isMatchingName ? `<span class="reason-pill reason-name" title="Matching Name (${similarityPct}% similarity)">Name</span>` : ''}
      </div>
    </div>
  `;
}

function _buildCardActionsHtml(safeIncId) {
  return `
    <div class="card-actions-bar">
      <div class="action-buttons-group">
        <button class="btn btn-dismiss" data-action="dismiss" data-id="${safeIncId}" title="Ignore this alert as harmless">
          <kbd>D</kbd> Ignore Alert (Safe)
        </button>
        <button class="btn btn-whitelist" data-action="open-alt-modal" data-id="${safeIncId}" title="Allow this account as an approved alternate">
          <kbd>W</kbd> Allow Known Alt...
        </button>
        <button class="btn btn-exclude" data-action="exclude" data-id="${safeIncId}" title="Mute or restrict this account temporarily">
          <kbd>E</kbd> Restrict Account
        </button>
        <button class="btn btn-adjudicate" data-action="ban" data-id="${safeIncId}" title="Ban this imposter from the server">
          <kbd>B</kbd> Ban Imposter
        </button>
      </div>
    </div>
  `;
}

export function buildTriageCardHtml(inc) {
  const d = inc.discrepancy;
  const benchmark = appState.benchmarks.find(b => b.id === d.matched_benchmark_id) || {
    canonical_username: d.matched_benchmark_name,
    server_nickname: "Official Member",
    community_role: "Protected Leader",
    avatar_url: d.suspect_avatar_url,
    user_id: d.matched_benchmark_id || ""
  };

  const isCritical = d.risk_tier === 'critical';
  const rawSuspect = d.suspect_username || '';
  const safeSuspect = escapeHtml(rawSuspect);
  const renderedSuspectName = _renderSuspectMarkedName(d, safeSuspect, rawSuspect);
  const similarityPct = Math.round(d.string_similarity_score * 100);

  const safeCanonical = escapeHtml(benchmark.canonical_username);
  const safeNickname = escapeHtml(benchmark.server_nickname || benchmark.canonical_username);
  const safeRole = escapeHtml(benchmark.community_role);
  const safeSuspectNick = escapeHtml(d.suspect_nickname || '');
  const safeIncId = escapeHtml(inc.id);

  return `
    <article class="inspection-card ${isCritical ? '' : 'risk-elevated-card'}" id="card-${safeIncId}" data-incident-id="${safeIncId}">
      ${_buildCardHeaderHtml(isCritical, inc.timestamp, d, similarityPct)}
      <div class="comparison-container">
        ${_buildOfficialSideHtml(benchmark, safeCanonical, safeNickname, safeRole)}
        <div class="comparison-connector">
          <div class="match-score-badge">${similarityPct}% Match</div>
          <div class="match-vs-pill">VS</div>
        </div>
        ${_buildSuspectSideHtml(d, safeSuspect, safeSuspectNick, renderedSuspectName, isCritical)}
      </div>
      ${_buildThreatStripHtml(safeCanonical, renderedSuspectName, safeSuspect, similarityPct)}
      ${_buildCardActionsHtml(safeIncId)}
    </article>
  `;
}

export function renderTriageCards() {
  const triageContainer = document.getElementById('triage-cards-container');
  const counterIncidents = document.getElementById('counter-incidents');
  if (!triageContainer) return;

  const pendingIncidents = appState.incidents.filter(i => i.status === 'pending');
  if (counterIncidents) {
    counterIncidents.textContent = pendingIncidents.length;
    if (pendingIncidents.length === 0) {
      counterIncidents.classList.add('tab-counter-zero');
    } else {
      counterIncidents.classList.remove('tab-counter-zero');
    }
  }

  if (pendingIncidents.length === 0) {
    const emptyMarkup = `
      <div style="text-align: center; padding: 56px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-card);">
        <div style="width: 48px; height: 48px; margin: 0 auto 14px; border-radius: 50%; background: var(--discord-green-subtle); border: 1px solid var(--discord-green-border); display: flex; align-items: center; justify-content: center; color: var(--discord-green);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 style="color: var(--text-header); font-weight: 700; font-size: 1.15rem; margin-bottom: 6px;">All Clear! No Imposter Alerts</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 440px; margin: 0 auto;">
          Zero unresolved imposter alerts detected. All protected community leaders and staff are safe.
        </p>
      </div>
    `;
    triageContainer.innerHTML = DOMPurify.sanitize(emptyMarkup);
    return;
  }

  const rawHtml = pendingIncidents.map(buildTriageCardHtml).join('');
  triageContainer.innerHTML = DOMPurify.sanitize(rawHtml);
}
