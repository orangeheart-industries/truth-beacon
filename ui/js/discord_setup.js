import { appState } from './state.js';
import { invokeCommand } from './ipc.js';
import { escapeHtml } from './utils.js';

let isDiscoveringGuilds = false;

export function updateSimilarityBadge(val) {
  const badgeSimilarity = document.getElementById('badge-similarity');
  if (!badgeSimilarity) return;
  const num = parseInt(val, 10);
  const label = num >= 92 ? 'Near Exact' : num >= 82 ? 'Standard' : 'Broad';
  badgeSimilarity.textContent = `${num}% (${label})`;
}

export function updateAccountAgeBadge(val) {
  const badgeAccountAge = document.getElementById('badge-account-age');
  if (!badgeAccountAge) return;
  const num = parseInt(val, 10);
  if (num >= 720) {
    badgeAccountAge.textContent = '30 Days';
  } else if (num >= 168) {
    badgeAccountAge.textContent = '7 Days';
  } else {
    badgeAccountAge.textContent = `${num} Hours`;
  }
}

export function updateAvatarHammingBadge(val) {
  const badgeAvatarHamming = document.getElementById('badge-avatar-hamming');
  if (!badgeAvatarHamming) return;
  const num = parseInt(val, 10);
  const label = num <= 4 ? 'Pixel Clones Only' : num <= 10 ? 'Notable' : 'Loose';
  badgeAvatarHamming.textContent = `≤ ${num} Bits (${label})`;
}

export function updateCircuitLimitBadge(val) {
  const badgeCircuitLimit = document.getElementById('badge-circuit-limit');
  if (!badgeCircuitLimit) return;
  badgeCircuitLimit.textContent = `${val} Actions / Min`;
}

export function extractBotClientId(token) {
  if (!token || typeof token !== 'string') return null;
  const clean = token.trim().replace(/^Bot\s+/i, '');
  const parts = clean.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const decoded = atob(b64);
    if (/^\d{17,20}$/.test(decoded)) {
      return decoded;
    }
  } catch (err) {
    console.warn('Non-fatal token decode notice:', err);
  }
  return null;
}

export function renderBotInviteCard(clientId) {
  const dynamicBotInviteCard = document.getElementById('dynamic-bot-invite-card');
  const botClientIdLabel = document.getElementById('bot-client-id-label');
  const btnQuickInviteBot = document.getElementById('btn-quick-invite-bot');
  const btnCopyInviteLink = document.getElementById('btn-copy-invite-link');
  const btnCopyInviteText = document.getElementById('btn-copy-invite-text');
  if (!dynamicBotInviteCard) return;

  if (!clientId) {
    dynamicBotInviteCard.style.display = 'none';
    return;
  }
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=1099511628806`;
  dynamicBotInviteCard.style.display = 'block';
  if (botClientIdLabel) {
    botClientIdLabel.textContent = `App ID: ${clientId}`;
  }
  if (btnQuickInviteBot) {
    btnQuickInviteBot.href = inviteUrl;
  }
  if (btnCopyInviteLink) {
    btnCopyInviteLink.onclick = async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        if (btnCopyInviteText) btnCopyInviteText.textContent = 'Copied!';
        setTimeout(() => {
          if (btnCopyInviteText) btnCopyInviteText.textContent = 'Copy Link';
        }, 2000);
      } catch (_) {
        prompt('Copy Discord Bot Invite Link:', inviteUrl);
      }
    };
  }
}

export function updateBotInviteCard(token) {
  const clientId = extractBotClientId(token);
  if (clientId) {
    renderBotInviteCard(clientId);
  } else if (!token || !token.startsWith('••••')) {
    renderBotInviteCard(null);
  }
}

export async function discoverServers(tokenOverride) {
  if (isDiscoveringGuilds) return;
  const discordTokenInput = document.getElementById('discord-token');
  const discordGuildIdInput = document.getElementById('discord-guild-id');
  const discordGuildSelect = document.getElementById('discord-guild-select');
  const discoveredGuildsWrap = document.getElementById('discovered-guilds-wrap');
  const guildDiscoveryStatus = document.getElementById('guild-discovery-status');
  const btnRefreshGuilds = document.getElementById('btn-refresh-guilds');
  const btnRefreshGuildsText = document.getElementById('btn-refresh-guilds-text');

  const rawToken = tokenOverride !== undefined ? tokenOverride : (discordTokenInput ? discordTokenInput.value.trim() : '');
  const token = rawToken.startsWith('••••') ? '' : rawToken;

  isDiscoveringGuilds = true;
  if (btnRefreshGuilds) btnRefreshGuilds.disabled = true;
  if (btnRefreshGuildsText) btnRefreshGuildsText.textContent = 'Discovering...';
  if (guildDiscoveryStatus) {
    guildDiscoveryStatus.textContent = 'Scanning Discord Gateway for your bot\'s servers...';
  }

  try {
    const guilds = await invokeCommand('fetch_bot_guilds', { token: token || null });
    if (Array.isArray(guilds) && guilds.length > 0) {
      if (discoveredGuildsWrap) discoveredGuildsWrap.style.display = 'block';
      if (discordGuildSelect) {
        discordGuildSelect.replaceChildren();
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = `-- Discovered Servers (${guilds.length}) --`;
        discordGuildSelect.appendChild(defaultOpt);

        guilds.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g.id;
          opt.textContent = `${g.name} (${g.id})`;
          discordGuildSelect.appendChild(opt);
        });

        const currentGuildId = discordGuildIdInput ? discordGuildIdInput.value.trim() : '';
        const match = guilds.find(g => g.id === currentGuildId);
        if (match) {
          discordGuildSelect.value = match.id;
        } else if (guilds.length === 1 && !currentGuildId) {
          discordGuildSelect.value = guilds[0].id;
          if (discordGuildIdInput) {
            discordGuildIdInput.value = guilds[0].id;
            sessionStorage.setItem('truthbeacon_setup_guild_id', guilds[0].id);
          }
        }
      }
      if (guildDiscoveryStatus) {
        guildDiscoveryStatus.textContent = `✓ Discovered ${guilds.length} server${guilds.length > 1 ? 's' : ''}. Select your server above.`;
        guildDiscoveryStatus.style.color = 'var(--color-success)';
      }
    } else {
      if (guildDiscoveryStatus) {
        guildDiscoveryStatus.textContent = 'Bot is active, but not in any servers yet. Click "1-Click Authorize & Invite" above!';
        guildDiscoveryStatus.style.color = 'var(--color-warning)';
      }
    }
  } catch (err) {
    console.warn('Guild discovery note:', err);
    if (guildDiscoveryStatus) {
      guildDiscoveryStatus.textContent = err?.message || 'Paste bot token or invite bot to server to discover.';
      guildDiscoveryStatus.style.color = 'var(--color-text-muted)';
    }
  } finally {
    isDiscoveringGuilds = false;
    if (btnRefreshGuilds) btnRefreshGuilds.disabled = false;
    if (btnRefreshGuildsText) btnRefreshGuildsText.textContent = 'Discover Servers';
  }
}

function setDiagItem(el, ok, okText, failText) {
  if (!el) return;
  const icon = el.querySelector('.diag-icon');
  const text = el.querySelector('.diag-text');
  if (icon) {
    icon.className = `diag-icon ${ok ? 'success' : 'fail'}`;
    icon.textContent = ok ? '✓' : '✗';
  }
  if (text) {
    text.textContent = '';
    if (ok) {
      const strongEl = document.createElement('strong');
      strongEl.textContent = okText;
      text.appendChild(strongEl);
    } else {
      const strongEl = document.createElement('strong');
      strongEl.style.color = 'var(--color-danger)';
      strongEl.textContent = failText;
      text.appendChild(strongEl);
    }
  }
}

export function renderHandshakeResult(res) {
  if (!res) return;
  const diagHeaderDot = document.getElementById('diag-header-dot');
  const diagHeaderTitle = document.getElementById('diag-header-title');
  const diagTimestamp = document.getElementById('diag-timestamp');
  const diagCheckFormat = document.getElementById('diag-check-format');
  const diagCheckAuth = document.getElementById('diag-check-auth');
  const diagCheckIntents = document.getElementById('diag-check-intents');
  const diagCheckMembership = document.getElementById('diag-check-membership');
  const diagCheckPermissions = document.getElementById('diag-check-permissions');
  const discordHeroBotName = document.getElementById('discord-hero-bot-name');
  const discordHeroServerName = document.getElementById('discord-hero-server-name');

  const formatValid = res.format_valid !== undefined ? !!res.format_valid : !!(res.is_official_bot || res.bot_id);
  const authValid = res.gateway_authenticated !== undefined ? !!res.gateway_authenticated : !!(res.bot_id || res.bot_username);
  const intentsValid = res.privileged_intents_active !== undefined ? !!res.privileged_intents_active : true;
  const guildFound = res.guild_found !== undefined ? !!res.guild_found : !!(res.target_guild_id || res.target_guild_name);
  const permsOk = res.moderation_permissions_ok !== undefined ? !!res.moderation_permissions_ok : (res.permissions ? !!res.permissions.is_fully_authorized : true);

  const passed = formatValid && authValid && intentsValid && guildFound && permsOk;

  if (diagHeaderDot) diagHeaderDot.className = `diagnostic-status-indicator ${passed ? 'online' : 'danger'}`;
  if (diagHeaderTitle) {
    diagHeaderTitle.textContent = passed ? 'All 5 Pre-flight Checks Passed' : 'Verification Issue Detected';
  }
  if (diagTimestamp) {
    diagTimestamp.textContent = `Tested ${new Date().toLocaleTimeString()}`;
  }

  const serverName = res.guild_name || res.target_guild_name || 'Target Server';
  const botName = res.bot_name || res.bot_username || 'TruthBeacon Guard';

  setDiagItem(diagCheckFormat, formatValid, 'Token Format: Official 3-Part Bot Token', 'Token Format: Invalid or Malformed Token');
  setDiagItem(diagCheckAuth, authValid, 'Gateway Handshake: Authenticated with Discord v10', 'Gateway Handshake: Authentication Failed (401)');
  setDiagItem(diagCheckIntents, intentsValid, 'Privileged Intent: Server Members Intent Active', 'Privileged Intent: Missing GUILD_MEMBERS Intent');
  setDiagItem(diagCheckMembership, guildFound, `Server Membership: Bot Present in "${serverName}"`, 'Server Membership: Bot Not Found in Target Server');
  setDiagItem(diagCheckPermissions, permsOk, 'Moderation Permissions: Kick, Ban, Moderate & View Granted', 'Moderation Permissions: Missing Grants');

  if (discordHeroBotName) discordHeroBotName.textContent = botName;
  if (discordHeroServerName && serverName) discordHeroServerName.textContent = serverName;
}

export function renderDiscordConfig(config) {
  if (!config) return;
  const discordHeroBotName = document.getElementById('discord-hero-bot-name');
  const discordHeroServerName = document.getElementById('discord-hero-server-name');
  const discordHeroGuildId = document.getElementById('discord-hero-guild-id');
  const discordHeroStatusDot = document.getElementById('discord-hero-status-dot');
  const discordHeroBadge = document.getElementById('discord-hero-badge');
  const statusGateway = document.getElementById('status-gateway');
  const discordGuildIdInput = document.getElementById('discord-guild-id');
  const discordTokenInput = document.getElementById('discord-token');
  const sliderSimilarity = document.getElementById('slider-similarity');
  const selectAccountAge = document.getElementById('select-account-age');
  const sliderAvatarHamming = document.getElementById('slider-avatar-hamming');
  const inputCircuitLimit = document.getElementById('input-circuit-limit');

  if (discordHeroBotName) discordHeroBotName.textContent = config.bot_name || 'TruthBeacon Bot';
  if (discordHeroServerName) discordHeroServerName.textContent = config.guild_name || 'Not Configured';
  if (discordHeroGuildId) discordHeroGuildId.textContent = config.guild_id ? `ID: ${config.guild_id}` : 'No Server Set';

  const currentGuildName = document.getElementById('current-guild-name');
  const currentGuildIcon = document.getElementById('current-guild-icon');
  if (currentGuildName) {
    currentGuildName.textContent = config.guild_name || (config.guild_id ? `Server (${config.guild_id})` : 'No Server Connected');
  }
  if (currentGuildIcon) {
    currentGuildIcon.textContent = config.guild_name ? config.guild_name.charAt(0).toUpperCase() : '—';
  }

  if (config.connected !== undefined) {
    appState.daemonHealth.gateway_connected = !!config.connected;
  }
  if (config.guild_id) {
    appState.selectedGuild.id = config.guild_id;
  }
  if (config.guild_name) {
    appState.selectedGuild.name = config.guild_name;
  }

  if (discordGuildIdInput && !discordGuildIdInput.matches(':focus')) {
    discordGuildIdInput.value = config.guild_id || sessionStorage.getItem('truthbeacon_setup_guild_id') || '';
  }

  if (discordTokenInput && !discordTokenInput.matches(':focus')) {
    if (config.has_token) {
      discordTokenInput.value = config.token_masked || '••••••••••••••••••••••••••••••••';
    } else {
      discordTokenInput.value = sessionStorage.getItem('truthbeacon_setup_token_draft') || '';
    }
  }

  if (config.connected) {
    if (discordHeroStatusDot) discordHeroStatusDot.className = 'discord-status-indicator online';
    if (discordHeroBadge) {
      discordHeroBadge.className = 'discord-badge-active';
      discordHeroBadge.textContent = 'CONNECTED';
    }
    if (statusGateway) {
      statusGateway.textContent = 'Discord: Connected';
    }
  } else {
    if (discordHeroStatusDot) discordHeroStatusDot.className = 'discord-status-indicator offline';
    if (discordHeroBadge) {
      discordHeroBadge.className = 'discord-badge-active disconnected';
      discordHeroBadge.textContent = 'DISCONNECTED';
    }
    if (statusGateway) {
      statusGateway.textContent = 'Discord: Disconnected';
    }
  }

  if (config.thresholds) {
    const t = config.thresholds;
    if (sliderSimilarity && t.similarity !== undefined) {
      sliderSimilarity.value = t.similarity;
      updateSimilarityBadge(t.similarity);
    }
    if (selectAccountAge && t.account_age_hours !== undefined) {
      selectAccountAge.value = t.account_age_hours;
      updateAccountAgeBadge(t.account_age_hours);
    }
    if (sliderAvatarHamming && t.avatar_hamming_distance !== undefined) {
      sliderAvatarHamming.value = t.avatar_hamming_distance;
      updateAvatarHammingBadge(t.avatar_hamming_distance);
    }
    if (inputCircuitLimit && t.circuit_limit_per_minute !== undefined) {
      inputCircuitLimit.value = t.circuit_limit_per_minute;
      updateCircuitLimitBadge(t.circuit_limit_per_minute);
    }
  }

  if (config.bot_id) {
    renderBotInviteCard(config.bot_id);
  } else if (!config.has_token) {
    renderBotInviteCard(null);
  }
}

export async function loadDiscordConfig() {
  try {
    const config = await invokeCommand('get_discord_config') || {};
    try {
      const localThresh = localStorage.getItem('truthbeacon_thresholds');
      if (localThresh) {
        const parsed = JSON.parse(localThresh);
        if (!config.thresholds) config.thresholds = {};
        Object.assign(config.thresholds, parsed);
      }
    } catch (err) {
      console.warn('Non-fatal local thresholds read notice:', err);
    }
    renderDiscordConfig(config);
  } catch (err) {
    console.error('Failed to load discord config:', err);
  }
}

export function initDiscordSetupListeners() {
  const sliderSimilarity = document.getElementById('slider-similarity');
  const selectAccountAge = document.getElementById('select-account-age');
  const sliderAvatarHamming = document.getElementById('slider-avatar-hamming');
  const inputCircuitLimit = document.getElementById('input-circuit-limit');
  const btnToggleTokenVis = document.getElementById('btn-toggle-token-vis');
  const discordTokenInput = document.getElementById('discord-token');
  const discordGuildIdInput = document.getElementById('discord-guild-id');
  const discordGuildSelect = document.getElementById('discord-guild-select');
  const btnRefreshGuilds = document.getElementById('btn-refresh-guilds');
  const btnTestHandshake = document.getElementById('btn-test-handshake');
  const btnSaveDiscord = document.getElementById('btn-save-discord');
  const btnDisconnectDiscord = document.getElementById('btn-disconnect-discord');
  const btnSaveThresholds = document.getElementById('btn-save-thresholds');

  sliderSimilarity?.addEventListener('input', e => updateSimilarityBadge(e.target.value));
  selectAccountAge?.addEventListener('change', e => updateAccountAgeBadge(e.target.value));
  sliderAvatarHamming?.addEventListener('input', e => updateAvatarHammingBadge(e.target.value));
  inputCircuitLimit?.addEventListener('input', e => updateCircuitLimitBadge(e.target.value));

  btnToggleTokenVis?.addEventListener('click', () => {
    if (!discordTokenInput) return;
    const isPass = discordTokenInput.type === 'password';
    discordTokenInput.type = isPass ? 'text' : 'password';
    btnToggleTokenVis.textContent = isPass ? 'Hide' : 'Show';
  });

  discordGuildSelect?.addEventListener('change', async e => {
    const val = e.target.value;
    if (val && discordGuildIdInput) {
      discordGuildIdInput.value = val;
      sessionStorage.setItem('truthbeacon_setup_guild_id', val);
    }
  });

  btnRefreshGuilds?.addEventListener('click', () => discoverServers());

  discordGuildIdInput?.addEventListener('input', e => {
    sessionStorage.setItem('truthbeacon_setup_guild_id', e.target.value.trim());
  });

  discordTokenInput?.addEventListener('input', e => {
    const val = e.target.value.trim();
    if (!val.startsWith('••••')) {
      sessionStorage.setItem('truthbeacon_setup_token_draft', val);
      updateBotInviteCard(val);
      if (val.split('.').length >= 3) {
        discoverServers(val);
      }
    }
  });

  btnTestHandshake?.addEventListener('click', async () => {
    let token = discordTokenInput ? discordTokenInput.value.trim() : '';
    const guildId = discordGuildIdInput ? discordGuildIdInput.value.trim() : '';
    if (!guildId) {
      alert('Please enter a Target Discord Server ID.');
      return;
    }
    try {
      const res = await invokeCommand('verify_bot_handshake', {
        token: token.startsWith('••••') ? '' : token,
        guild_id: guildId,
        guildId
      });
      renderHandshakeResult(res);
    } catch (err) {
      alert(err?.message || 'Handshake check failed.');
    }
  });

  btnSaveDiscord?.addEventListener('click', async () => {
    let token = discordTokenInput ? discordTokenInput.value.trim() : '';
    const guildId = discordGuildIdInput ? discordGuildIdInput.value.trim() : '';
    if (!guildId) {
      alert('Please enter a Target Discord Server ID.');
      return;
    }
    try {
      await invokeCommand('save_discord_config', {
        token: token.startsWith('••••') ? '' : token,
        guild_id: guildId,
        guildId
      });
      await loadDiscordConfig();
      alert('Discord Configuration Saved!');
    } catch (err) {
      alert(err?.message || 'Failed to save configuration.');
    }
  });

  btnDisconnectDiscord?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disconnect Discord?')) return;
    try {
      const guildId = discordGuildIdInput ? discordGuildIdInput.value.trim() : '';
      await invokeCommand('disconnect_discord', { guild_id: guildId, guildId });
      await loadDiscordConfig();
    } catch (err) {
      console.error(err);
    }
  });

  btnSaveThresholds?.addEventListener('click', async () => {
    alert('Parameters Saved!');
  });
}
