import { INITIAL_BENCHMARKS, INITIAL_INCIDENTS, INITIAL_AUDIT_LOGS } from './mock_data.js';

let mockBenchmarks = [...INITIAL_BENCHMARKS];
let mockIncidents = [...INITIAL_INCIDENTS];
let mockAuditLogs = [...INITIAL_AUDIT_LOGS];
let mockCircuitBreakerTripped = false;

const STORAGE_KEY_GATEWAY_CONFIG = 'tb_local_gateway_settings';
const DEMO_BOT_ID = ["tb", "bot", "demo", "475"].join("_");

function loadMockDiscordConfig() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(STORAGE_KEY_GATEWAY_CONFIG) : null;
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Non-fatal gateway storage read notice:', err);
  }
  return {
    has_token: false,
    guild_id: "",
    registered_guilds: [],
    string_similarity_threshold: 0.85,
    new_account_age_hours_threshold: 72,
    avatar_hamming_threshold: 10,
    circuit_limit_per_minute: 5,
    privileged_intent_declared: true,
    bot_name: "TruthBeacon Guard",
    guild_name: "",
    connected: false,
    token_masked: "",
    token: ""
  };
}

let mockDiscordConfig = loadMockDiscordConfig();

function saveMockDiscordConfig(cfg) {
  mockDiscordConfig = { ...mockDiscordConfig, ...cfg };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_GATEWAY_CONFIG, JSON.stringify(mockDiscordConfig));
    }
  } catch (err) {
    console.warn('Non-fatal gateway storage write notice:', err);
  }
}

export const isTauriEnvironment = () => {
  return typeof window !== "undefined" && (window.__TAURI_INTERNALS__ !== undefined || window.__TAURI__ !== undefined);
};

function _getMockSystemStatus() {
  return {
    daemon_healthy: true,
    gateway_connected: !!mockDiscordConfig.connected,
    circuit_breaker_tripped: mockCircuitBreakerTripped,
    db_path: "/Users/local/.truthbeacon/truthbeacon.local.db",
    pending_incidents_count: mockIncidents.filter(i => i.status === 'pending').length,
    benchmark_count: mockBenchmarks.length
  };
}

function _getMockHealthDiagnostics() {
  return {
    resident_memory_bytes: 18450000,
    resident_memory_mb: 17.6,
    memory_budget_bytes: 31457280,
    memory_budget_adhered: true,
    database_path: "/Users/local/.truthbeacon/truthbeacon.local.db",
    database_healthy: true,
    pending_incidents_count: mockIncidents.filter(i => i.status === 'pending').length,
    benchmark_count: mockBenchmarks.length,
    active_gateway_connections: mockDiscordConfig.connected ? 1 : 0,
    registered_guilds_count: mockDiscordConfig.guild_id ? 1 : 0,
    gateway_connected: !!mockDiscordConfig.connected,
    circuit_breaker_status: mockCircuitBreakerTripped ? "Open" : "Closed",
    circuit_breaker_tripped: mockCircuitBreakerTripped,
    os_name: "macos"
  };
}

function _resetCircuitBreaker() {
  mockCircuitBreakerTripped = false;
  mockAuditLogs.unshift({
    id: `aud_${Date.now()}`,
    timestamp: Date.now(),
    action: "circuit_breaker_reset",
    guild_id: "global",
    operator_id: "LocalSteward",
    target_user_id: null,
    incident_id: null,
    reason: "Manual operator reset via console or system tray",
    metadata: null
  });
  return true;
}

function _runSandboxSimulation(args) {
  const { candidate_username, target_benchmark_name } = args;
  const isHomoglyph = candidate_username.includes('\u043E') || candidate_username.includes('\u0428') || candidate_username.includes('\u200B');
  const score = isHomoglyph ? 0.98 : (candidate_username.toLowerCase() === target_benchmark_name.toLowerCase() ? 1.0 : 0.45);
  return {
    candidate_input: candidate_username,
    candidate_normalized: candidate_username.toLowerCase(),
    target_normalized: target_benchmark_name.toLowerCase(),
    similarity_score: score,
    jaro_winkler: score,
    damerau_distance: isHomoglyph ? 1 : 4,
    homoglyph_detected: isHomoglyph,
    recommended_tier: isHomoglyph || score > 0.9 ? "critical" : (score > 0.8 ? "notable" : "standard")
  };
}

const mockSystemHandlers = {
  get_system_status: () => _getMockSystemStatus(),
  get_health_diagnostics: () => _getMockHealthDiagnostics(),
  list_audit_logs: () => [...mockAuditLogs],
  reset_circuit_breaker: () => _resetCircuitBreaker(),
  run_sandbox_simulation: (args) => _runSandboxSimulation(args),
  eradicate_local_data: () => {
    mockBenchmarks = [];
    mockIncidents = [];
    mockAuditLogs = [];
    return true;
  },
  check_for_updates: () => ({
    should_update: false,
    current_version: "0.3.1",
    latest_version: null,
    release_notes: null,
    release_date: null
  }),
  install_update: () => true
};

async function _handleMockSystem(cmd, args) {
  const handler = mockSystemHandlers[cmd];
  return handler ? await handler(args) : undefined;
}

function _createBenchmark(args) {
  const input = args.input || {};
  if (!input.user_id?.trim()) {
    throw { code: "VALIDATION_FAILED", message: "Validation failed: Snowflake user ID cannot be empty", details: null };
  }
  if (!input.canonical_username?.trim()) {
    throw { code: "VALIDATION_FAILED", message: "Validation failed: Canonical username cannot be empty", details: null };
  }
  const now = Date.now();
  const newBm = {
    id: `bm_${now}`,
    guild_id: input.guild_id || "guild_default",
    user_id: input.user_id,
    canonical_username: input.canonical_username,
    server_nickname: input.server_nickname || null,
    community_role: input.community_role || "Staff",
    avatar_url: input.avatar_url || null,
    avatar_perceptual_hash: null,
    is_active: true,
    tags: input.tags || [],
    created_at: Math.floor(now / 1000),
    updated_at: Math.floor(now / 1000)
  };
  mockBenchmarks.push(newBm);
  mockAuditLogs.unshift({
    id: `aud_${now}`,
    timestamp: now,
    action: "create_benchmark",
    guild_id: newBm.guild_id,
    operator_id: "LocalSteward",
    target_user_id: newBm.user_id,
    incident_id: null,
    reason: `Created benchmark for @${newBm.canonical_username}`,
    metadata: { role: newBm.community_role }
  });
  return newBm;
}

const mockBenchmarkHandlers = {
  list_benchmarks: () => [...mockBenchmarks],
  create_benchmark: (args) => _createBenchmark(args)
};

async function _handleMockBenchmarks(cmd, args) {
  const handler = mockBenchmarkHandlers[cmd];
  return handler ? await handler(args) : undefined;
}

function _resolveIncidentRecord(args) {
  const { incident_id, status, resolution_notes, operator_id, target_benchmark_id } = args;
  const inc = mockIncidents.find(i => i.id === incident_id);
  if (!inc) {
    throw new Error(`Incident '${incident_id}' not found`);
  }
  if (inc.status !== 'pending') {
    throw new Error(`Incident '${incident_id}' has already been resolved with status '${inc.status}'`);
  }
  if (status === 'banned') {
    if (!mockDiscordConfig.has_token && !mockDiscordConfig.connected) {
      throw new Error("Discord API error: Bot is not connected or missing token; cannot execute remote Ban & Purge on Discord");
    }
  }

  const now = Date.now();
  inc.status = status;
  inc.resolution_notes = resolution_notes;
  inc.resolved_at = Math.floor(now / 1000);

  if (status === 'whitelisted') {
    const targetId = target_benchmark_id || inc?.discrepancy?.matched_benchmark_id;
    const bm = mockBenchmarks.find(b => b.id === targetId);
    if (bm && inc?.discrepancy?.suspect_user_id) {
      const altTag = `Whitelisted Alt: ${inc.discrepancy.suspect_user_id}`;
      if (!bm.tags.includes(altTag)) bm.tags.push(altTag);
      if (!bm.tags.includes("Authorized Alt")) bm.tags.push("Authorized Alt");
    }
  }

  const auditAction = status === 'banned' ? 'ban_and_purge'
    : (status === 'whitelisted' ? 'whitelist_alternate'
    : (status === 'excluded' ? 'exclude_user' : 'dismiss'));

  mockAuditLogs.unshift({
    id: `aud_${now}`,
    timestamp: now,
    action: auditAction,
    guild_id: inc?.guild_id || "guild_production_9921",
    operator_id: operator_id || "LocalSteward",
    target_user_id: inc?.discrepancy?.suspect_user_id || "user_unknown",
    incident_id,
    reason: resolution_notes || `Adjudicated with status: ${status}`,
    metadata: {
      suspect_username: inc?.discrepancy?.suspect_username,
      status,
      target_benchmark_id
    }
  });

  return true;
}

async function _executeNotificationAction(args) {
  const { incident_id, action } = args;
  if (action === 'Inspect') {
    return true;
  } else if (action === 'Dismiss') {
    return await invokeCommand('resolve_incident', {
      incident_id,
      status: 'dismissed',
      resolution_notes: 'Dismissed via desktop notification toast action button',
      operator_id: 'NotificationToast'
    });
  } else if (action === 'Ban & Purge') {
    return await invokeCommand('resolve_incident', {
      incident_id,
      status: 'banned',
      resolution_notes: 'Banned and purged via desktop notification toast action button',
      operator_id: 'NotificationToast'
    });
  }
  return true;
}

const mockIncidentHandlers = {
  list_incidents: () => [...mockIncidents],
  resolve_incident: (args) => _resolveIncidentRecord(args),
  dispatch_desktop_notification: (args) => {
    console.info("[TruthBeacon IPC] Dispatched OS notification:", args.payload);
    return true;
  },
  execute_notification_action: (args) => _executeNotificationAction(args)
};

async function _handleMockIncidents(cmd, args) {
  const handler = mockIncidentHandlers[cmd];
  return handler ? await handler(args) : undefined;
}

function _getDiscordConfigResult() {
  return {
    has_token: !!mockDiscordConfig.has_token,
    guild_id: mockDiscordConfig.guild_id || "",
    registered_guilds: mockDiscordConfig.registered_guilds || [],
    string_similarity_threshold: mockDiscordConfig.string_similarity_threshold ?? 0.85,
    new_account_age_hours_threshold: mockDiscordConfig.new_account_age_hours_threshold ?? 72,
    avatar_hamming_threshold: mockDiscordConfig.avatar_hamming_threshold ?? 10,
    privileged_intent_declared: true,
    bot_name: mockDiscordConfig.bot_name || "TruthBeacon Guard",
    bot_id: mockDiscordConfig.has_token ? (mockDiscordConfig.bot_id || DEMO_BOT_ID) : null,
    guild_name: mockDiscordConfig.guild_name || (mockDiscordConfig.guild_id ? `Server (${mockDiscordConfig.guild_id})` : ""),
    connected: !!mockDiscordConfig.connected,
    token_masked: mockDiscordConfig.has_token ? (mockDiscordConfig.token_masked || '••••••••••••••••••••••••••••••••') : '',
    thresholds: {
      similarity: Math.round((mockDiscordConfig.string_similarity_threshold ?? 0.85) * 100),
      account_age_hours: mockDiscordConfig.new_account_age_hours_threshold ?? 72,
      avatar_hamming_distance: mockDiscordConfig.avatar_hamming_threshold ?? 10,
      circuit_limit_per_minute: mockDiscordConfig.circuit_limit_per_minute ?? 5
    }
  };
}

function _fetchBotGuilds(args) {
  let token = args.token;
  if ((!token || token.startsWith('••••')) && mockDiscordConfig.token) {
    token = mockDiscordConfig.token;
  }
  if (!token && !mockDiscordConfig.has_token) {
    throw { code: "VALIDATION_FAILED", message: "Bot token is required to discover server guilds." };
  }
  const currentGid = mockDiscordConfig.guild_id || ["tb", "guild", "primary", "444"].join("_");
  const currentName = mockDiscordConfig.guild_name || "Primary Community Server";
  return [
    {
      id: currentGid,
      name: currentName,
      icon: null,
      permissions: "1099511628806"
    },
    {
      id: ["tb", "guild", "secondary", "678"].join("_"),
      name: "Operations & Staff Server",
      icon: null,
      permissions: "1099511628806"
    }
  ];
}

function _verifyBotHandshake(args) {
  let { token, guild_id, guildId } = args;
  const targetGid = (guildId || guild_id)?.trim() || mockDiscordConfig.guild_id || "";
  if ((!token || token.startsWith('••••')) && mockDiscordConfig.token) {
    token = mockDiscordConfig.token;
  }
  if (!token || token.length < 15) {
    throw { code: "VALIDATION_FAILED", message: "Invalid bot token format: Discord Bot tokens must contain 3 segments." };
  }
  const guildName = targetGid ? `Server (${targetGid})` : "Primary Community Server";
  return {
    bot_id: DEMO_BOT_ID,
    bot_name: "TruthBeacon Guard",
    bot_username: "TruthBeacon Guard",
    bot_discriminator: "0",
    bot_avatar: null,
    is_official_bot: true,
    target_guild_id: targetGid,
    target_guild_name: guildName,
    guild_name: guildName,
    format_valid: true,
    gateway_authenticated: true,
    privileged_intents_active: true,
    guild_found: !!targetGid,
    moderation_permissions_ok: true,
    permissions: {
      is_administrator: false,
      has_kick_members: true,
      has_ban_members: true,
      has_moderate_members: true,
      has_view_channel: true,
      is_fully_authorized: true,
      missing_permissions: []
    },
    verified_at: Math.floor(Date.now() / 1000)
  };
}

function _saveDiscordConfig(args) {
  const { guild_id, guildId, token, thresholds } = args;
  const targetGuild = (guildId || guild_id)?.trim() || mockDiscordConfig.guild_id;
  if (!targetGuild) {
    throw { code: "VALIDATION_FAILED", message: "Server Guild ID cannot be empty" };
  }

  let activeToken = token?.trim();
  if (!activeToken || activeToken.startsWith('••••')) {
    activeToken = mockDiscordConfig.token;
  }
  if (!activeToken) {
    throw { code: "VALIDATION_FAILED", message: "Bot token cannot be empty" };
  }

  const guildName = `Server (${targetGuild})`;
  const registered = [...(mockDiscordConfig.registered_guilds || [])];
  const existingIdx = registered.indexOf(targetGuild);
  if (existingIdx !== -1) {
    registered.splice(existingIdx, 1);
  }
  registered.unshift(targetGuild);

  saveMockDiscordConfig({
    has_token: true,
    guild_id: targetGuild,
    registered_guilds: registered,
    token: activeToken,
    token_masked: '••••••••••••••••••••••••••••••••',
    guild_name: guildName,
    bot_name: "TruthBeacon Guard",
    connected: true,
    string_similarity_threshold: thresholds?.similarity ? (thresholds.similarity / 100) : mockDiscordConfig.string_similarity_threshold,
    new_account_age_hours_threshold: thresholds?.account_age_hours ?? mockDiscordConfig.new_account_age_hours_threshold,
    avatar_hamming_threshold: thresholds?.avatar_hamming_distance ?? mockDiscordConfig.avatar_hamming_threshold,
    circuit_limit_per_minute: thresholds?.circuit_limit_per_minute ?? mockDiscordConfig.circuit_limit_per_minute ?? 5
  });

  return {
    bot_id: DEMO_BOT_ID,
    bot_name: "TruthBeacon Guard",
    bot_username: "TruthBeacon Guard",
    bot_discriminator: "0",
    bot_avatar: null,
    is_official_bot: true,
    target_guild_id: targetGuild,
    target_guild_name: guildName,
    guild_name: guildName,
    format_valid: true,
    gateway_authenticated: true,
    privileged_intents_active: true,
    guild_found: true,
    moderation_permissions_ok: true,
    permissions: {
      is_administrator: false,
      has_kick_members: true,
      has_ban_members: true,
      has_moderate_members: true,
      has_view_channel: true,
      is_fully_authorized: true,
      missing_permissions: []
    },
    verified_at: Math.floor(Date.now() / 1000)
  };
}

function _disconnectDiscord() {
  saveMockDiscordConfig({
    has_token: false,
    guild_id: "",
    registered_guilds: [],
    token: "",
    token_masked: "",
    guild_name: "",
    connected: false
  });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY_GATEWAY_CONFIG);
    }
  } catch (err) {
    console.warn('Non-fatal gateway storage removal notice:', err);
  }
  return true;
}

const mockDiscordHandlers = {
  get_discord_config: () => _getDiscordConfigResult(),
  fetch_bot_guilds: (args) => _fetchBotGuilds(args),
  verify_bot_handshake: (args) => _verifyBotHandshake(args),
  save_discord_config: (args) => _saveDiscordConfig(args),
  disconnect_discord: () => _disconnectDiscord()
};

async function _handleMockDiscord(cmd, args) {
  const handler = mockDiscordHandlers[cmd];
  return handler ? await handler(args) : undefined;
}

export async function invokeCommand(cmd, args = {}) {
  const invoker = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (isTauriEnvironment() && invoker) {
    try {
      const tauriArgs = {};
      for (const [k, v] of Object.entries(args)) {
        tauriArgs[k] = v;
        const camelKey = k.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
        tauriArgs[camelKey] = v;
      }
      return await invoker(cmd, tauriArgs);
    } catch (err) {
      console.warn(`[TruthBeacon IPC] Failed invoking ${cmd}:`, err);
      throw err;
    }
  }

  // Simulated IPC latency for mock environment
  await new Promise(r => setTimeout(r, 15));

  const handled =
    (await _handleMockIncidents(cmd, args)) ??
    (await _handleMockBenchmarks(cmd, args)) ??
    (await _handleMockDiscord(cmd, args)) ??
    (await _handleMockSystem(cmd, args));

  if (handled !== undefined) return handled;
  console.warn(`[TruthBeacon Mock IPC] Unhandled command: ${cmd}`);
  return null;
}
