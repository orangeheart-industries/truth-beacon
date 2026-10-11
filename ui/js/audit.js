import { appState } from './state.js';
import { escapeHtml, formatTime } from './utils.js';
import { DOMPurify } from './dompurify.js';

function _resolveAuditBadge(action) {
  const actionLower = (action || '').toLowerCase();
  if (actionLower.includes('adjudicate') || actionLower.includes('ban')) {
    return { color: '#ffa1a4', bg: 'var(--discord-red-subtle)', text: 'Banned Imposter' };
  } else if (actionLower.includes('authorize') || actionLower.includes('whitelist')) {
    return { color: '#c7d2fe', bg: 'var(--brand-blurple-subtle)', text: 'Allowed Known Alt' };
  } else if (actionLower.includes('quarantine') || actionLower.includes('exclude')) {
    return { color: '#e9d5ff', bg: 'var(--discord-purple-subtle)', text: 'Restricted Account' };
  } else if (actionLower.includes('dismiss')) {
    return { color: 'var(--text-secondary)', bg: 'rgba(255, 255, 255, 0.05)', text: 'Ignored Alert (Safe)' };
  } else if (actionLower.includes('benchmark')) {
    return { color: 'var(--oh-orange-400)', bg: 'var(--oh-orange-subtle)', text: 'Protected Leader Added' };
  } else if (actionLower.includes('circuit_breaker_tripped')) {
    return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', text: 'Safety Pause Tripped' };
  } else if (actionLower.includes('circuit_breaker_reset')) {
    return { color: '#34d399', bg: 'var(--discord-green-subtle)', text: 'Safety Pause Reset' };
  }
  return { color: 'var(--text-secondary)', bg: 'var(--bg-secondary)', text: action || 'Activity Logged' };
}

export function buildAuditRowHtml(aud) {
  const badge = _resolveAuditBadge(aud.action);
  const suspectName = aud.metadata?.suspect_username;
  const safeSuspect = escapeHtml(suspectName);
  const safeTargetId = escapeHtml(aud.target_user_id || '');
  const targetDisplay = suspectName
    ? `<span style="font-weight: 600; color: var(--text-primary);">@${safeSuspect}</span> <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);">(${safeTargetId})</span>`
    : (safeTargetId || 'System');

  return `
    <tr style="border-bottom: 1px solid var(--border-subtle);">
      <td style="padding: 14px 20px; color: var(--text-muted); font-size: 0.82rem;" class="tabular-nums">${formatTime(aud.timestamp)}</td>
      <td style="padding: 14px 20px;">
        <span style="font-weight: 700; font-size: 0.78rem; color: ${badge.color}; background: ${badge.bg}; padding: 4px 10px; border-radius: var(--radius-xs); border: 1px solid rgba(255, 255, 255, 0.08); display: inline-block;">
          ${escapeHtml(badge.text)}
        </span>
      </td>
      <td style="padding: 14px 20px; font-size: 0.84rem; color: var(--text-secondary);">${targetDisplay}</td>
      <td style="padding: 14px 20px; font-size: 0.84rem; color: var(--text-muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(aud.reason || 'Adjudicated')}</td>
      <td style="padding: 14px 20px; font-size: 0.80rem; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(aud.operator_id || 'LocalSteward')}</td>
    </tr>
  `;
}

export function renderAuditTable() {
  const auditTableBody = document.getElementById('audit-table-body');
  if (!auditTableBody) return;

  if (!appState.auditLogs || appState.auditLogs.length === 0) {
    const emptyMarkup = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 0.9rem;">
          No activity recorded in local audit ledger yet.
        </td>
      </tr>
    `;
    auditTableBody.innerHTML = DOMPurify.sanitize(emptyMarkup);
    return;
  }

  const rawHtml = appState.auditLogs.map(buildAuditRowHtml).join('');
  auditTableBody.innerHTML = DOMPurify.sanitize(rawHtml);
}
