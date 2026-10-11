/**
 * Utility functions for TruthBeacon UI: escaping, formatting, and modal management.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatTime(timestamp) {
  if (!timestamp) return 'recently';
  const timeMs = timestamp > 1e11 ? timestamp : timestamp * 1000;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
  if (elapsedSec < 60) return 'just now';
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60) return `${elapsedMin}m ago`;
  const elapsedHr = Math.floor(elapsedMin / 60);
  if (elapsedHr < 24) return `${elapsedHr}h ago`;
  const elapsedDays = Math.floor(elapsedHr / 24);
  return `${elapsedDays}d ago`;
}

export function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 60);
  }
}

export function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
}

export function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
}
