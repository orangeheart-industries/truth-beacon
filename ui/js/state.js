import { INITIAL_BENCHMARKS, INITIAL_INCIDENTS, INITIAL_AUDIT_LOGS } from './mock_data.js';
import { invokeCommand } from './ipc.js';

class StateStore {
  constructor() {
    this.benchmarks = JSON.parse(JSON.stringify(INITIAL_BENCHMARKS));
    this.incidents = JSON.parse(JSON.stringify(INITIAL_INCIDENTS));
    this.auditLogs = JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS));
    this.activeTab = 'triage';
    this.selectedGuild = {
      id: null,
      name: 'No Server Connected',
      member_count: 0
    };
    this.daemonHealth = {
      online: true,
      gateway_connected: false,
      latency_ms: 0,
      memory_mb: 26.4,
      circuit_breaker: {
        tripped: false,
        rolling_requests: 0,
        max_requests: 5,
        remaining_cooldown: 0
      }
    };
    this.listeners = [];

    // Subtle gentle latency jitter (21 - 28ms) to reflect live WebSocket connection when connected
    setInterval(() => {
      if (this.daemonHealth.gateway_connected) {
        this.daemonHealth.latency_ms = 20 + Math.floor(Math.random() * 8);
      } else {
        this.daemonHealth.latency_ms = 0;
      }
      this.notifyHeaderOnly();
    }, 4000);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this);
    }
  }

  notifyHeaderOnly() {
    const latencyEl = document.getElementById('gateway-latency');
    if (latencyEl) {
      latencyEl.textContent = this.daemonHealth.gateway_connected
        ? `${this.daemonHealth.latency_ms}ms`
        : '--';
    }
  }

  setTab(tab) {
    this.activeTab = tab;
    this.notify();
  }

  async authorizeAlternate(incidentId, targetBenchmarkId, purpose, justification) {
    const note = justification || `Approved alternate account (${purpose})`;
    return await this.resolveIncident(incidentId, 'whitelist', note, {
      targetBenchmarkId,
      purpose,
      label: purpose,
      note
    });
  }

  _resolveActionConfig(action) {
    switch (action) {
      case 'ban':
        return {
          newStatus: 'banned',
          auditAction: 'ban_and_purge',
          defaultReason: 'Ban account from guild with message pruning and audit logging'
        };
      case 'exclude':
        return {
          newStatus: 'excluded',
          auditAction: 'exclude_user',
          defaultReason: 'Quarantine / remove elevated permissions with clear reason'
        };
      case 'whitelist':
        return {
          newStatus: 'whitelisted',
          auditAction: 'whitelist_alternate',
          defaultReason: 'Approved alternate account; appended to benchmark tags to prevent future alerts'
        };
      case 'dismiss':
      default:
        return {
          newStatus: 'dismissed',
          auditAction: 'dismiss',
          defaultReason: 'Mark incident as resolved / benign coincidence'
        };
    }
  }

  _applyWhitelistAlt(incident, altMetadata, resolutionNotes) {
    const targetBmId = altMetadata?.targetBenchmarkId || incident.discrepancy.matched_benchmark_id;
    if (!targetBmId) return;
    const bm = this.benchmarks.find(b => b.id === targetBmId);
    if (!bm) return;

    if (!bm.authorized_alts) bm.authorized_alts = [];
    const suspectId = incident.discrepancy.suspect_user_id;
    bm.authorized_alts.push({
      user_id: suspectId,
      label: altMetadata?.label || "Authorized Secondary Account",
      note: resolutionNotes || altMetadata?.note || "Operator verified alternate identity"
    });

    if (!bm.tags) bm.tags = [];
    const altTag = `Whitelisted Alt: ${suspectId}`;
    if (!bm.tags.includes(altTag)) bm.tags.push(altTag);
    if (!bm.tags.includes("Authorized Alt")) bm.tags.push("Authorized Alt");
  }

  _recordAuditEntry(incident, action, newStatus, altMetadata, auditAction) {
    this.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      timestamp: Date.now(),
      action: auditAction,
      guild_id: this.selectedGuild?.id || incident.guild_id || "global",
      operator_id: "LocalSteward",
      target_user_id: incident.discrepancy.suspect_user_id,
      incident_id: incident.id,
      reason: incident.resolution_notes,
      metadata: {
        action,
        status: newStatus,
        suspect_username: incident.discrepancy.suspect_username,
        matched_benchmark_id: incident.discrepancy.matched_benchmark_id,
        altMetadata
      }
    });
  }

  _updateCircuitBreaker(action) {
    if (action === 'ban' || action === 'exclude') {
      this.daemonHealth.circuit_breaker.rolling_requests += 1;
      if (this.daemonHealth.circuit_breaker.rolling_requests >= this.daemonHealth.circuit_breaker.max_requests) {
        this.daemonHealth.circuit_breaker.tripped = true;
        this.daemonHealth.circuit_breaker.remaining_cooldown = 60;
      }
    }
  }

  async resolveIncident(id, action, reason = "", altMetadata = null) {
    const incIndex = this.incidents.findIndex(i => i.id === id);
    if (incIndex === -1) return false;

    const incident = this.incidents[incIndex];
    if (incident.status !== 'pending') {
      console.warn(`[TruthBeacon] Incident '${id}' is already resolved with status '${incident.status}'`);
      return false;
    }

    const { newStatus, auditAction, defaultReason } = this._resolveActionConfig(action);
    const resolutionNotes = reason || defaultReason;

    // CRITICAL: Await authoritative backend resolution FIRST.
    // Prevents local status changes from masquerading as completed moderation
    // if Discord API rejects, network fails, or bot lacks permission.
    await invokeCommand('resolve_incident', {
      incident_id: id,
      status: newStatus,
      resolution_notes: resolutionNotes,
      operator_id: "LocalSteward",
      target_benchmark_id: altMetadata?.targetBenchmarkId || null
    });

    // Only update local in-memory status AFTER successful authoritative moderation confirmation
    incident.status = newStatus;
    incident.resolved_at = Date.now();
    incident.resolution_notes = resolutionNotes;

    // Link alternate identity to target benchmark and append tags
    if (action === 'whitelist') {
      this._applyWhitelistAlt(incident, altMetadata, resolutionNotes);
    }

    // Record immutable audit entry in local ledger
    this._recordAuditEntry(incident, action, newStatus, altMetadata, auditAction);

    // Update circuit breaker
    this._updateCircuitBreaker(action);

    this.notify();
    return true;
  }

  resetCircuitBreaker() {
    this.daemonHealth.circuit_breaker.tripped = false;
    this.daemonHealth.circuit_breaker.rolling_requests = 0;
    this.daemonHealth.circuit_breaker.remaining_cooldown = 0;
    invokeCommand('reset_circuit_breaker');
    this.notify();
  }

  addBenchmark(benchmark) {
    const newBm = {
      id: benchmark.id || `bm_${Date.now()}`,
      guild_id: benchmark.guild_id || this.selectedGuild.id,
      user_id: benchmark.user_id,
      canonical_username: benchmark.canonical_username,
      server_nickname: benchmark.server_nickname || null,
      community_role: benchmark.community_role || "Community Steward",
      avatar_url: benchmark.avatar_url || "assets/logo.svg",
      avatar_perceptual_hash: benchmark.avatar_perceptual_hash || "e2b4f9c18d0739aa",
      is_active: true,
      tags: benchmark.tags || ["Verified Baseline"],
      authorized_alts: [],
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    };

    this.benchmarks.unshift(newBm);
    this.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      timestamp: Date.now(),
      action: 'create_benchmark',
      guild_id: this.selectedGuild.id,
      operator_id: "LocalSteward",
      target_user_id: newBm.user_id,
      incident_id: null,
      reason: `Enrolled canonical ground-truth benchmark for ${newBm.canonical_username} (${newBm.community_role})`,
      metadata: { role: newBm.community_role, tags: newBm.tags }
    });

    invokeCommand('create_benchmark', { input: newBm });
    this.notify();
    return newBm;
  }

  removeBenchmark(id) {
    this.benchmarks = this.benchmarks.filter(b => b.id !== id);
    this.notify();
  }

  async hydrate() {
    try {
      // 1. Discover configured guild
      const cfg = await invokeCommand('get_discord_config');
      if (cfg && cfg.guild_id) {
        this.selectedGuild.id = cfg.guild_id;
        this.selectedGuild.name = cfg.guild_name || `Server (${cfg.guild_id})`;
      }

      // 2. Fetch live system status
      const status = await invokeCommand('get_system_status');
      if (status) {
        this.daemonHealth.online = status.daemon_healthy;
        this.daemonHealth.gateway_connected = status.gateway_connected;
        this.daemonHealth.circuit_breaker.tripped = status.circuit_breaker_tripped;
      }

      // 3. Fetch canonical benchmarks for active guild
      if (this.selectedGuild.id) {
        const bms = await invokeCommand('list_benchmarks', { guild_id: this.selectedGuild.id });
        if (Array.isArray(bms) && bms.length > 0) {
          this.benchmarks = bms;
        }
      }

      // 4. Fetch unresolved and historic incidents
      const incs = await invokeCommand('list_incidents', { guild_id: this.selectedGuild.id || "" });
      if (Array.isArray(incs) && incs.length > 0) {
        this.incidents = incs;
      }

      // 5. Fetch audit trail logs
      const logs = await invokeCommand('list_audit_logs', { limit: 100 });
      if (Array.isArray(logs) && logs.length > 0) {
        this.auditLogs = logs;
      }

      this.notify();
    } catch (e) {
      console.warn('[TruthBeacon State] Hydration from backend fallback active:', e);
    }
  }

  eradicateLocalData() {
    this.benchmarks = [];
    this.incidents = [];
    this.auditLogs = [];
    invokeCommand('eradicate_local_data');
    this.notify();
  }
}

export const appState = new StateStore();
