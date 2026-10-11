//! Discord REST API Moderation Client & Guild Ban Executor.
//!
//! Enforces authoritative moderation actions (Ban & Purge) directly against Discord's REST API:
//! - Endpoint: `PUT /guilds/{guild_id}/bans/{user_id}`
//! - Body: `{"delete_message_seconds": 604800}` (7-day message prune)
//! - Header: `X-Audit-Log-Reason: {reason}`
//! - Verifies HTTP 204 No Content before permitting local status changes, preventing local status
//!   changes from masquerading as completed moderation when Discord rejects or fails.

use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

pub const DEFAULT_PURGE_SECONDS: u32 = 604_800; // 7 days (maximum prune window allowed by Discord API v10)
pub const DEFAULT_DISCORD_API_URL: &str = "https://discord.com/api/v10";

#[derive(Debug, Error)]
pub enum ModerationError {
    #[error("Missing or invalid bot token for guild '{0}'")]
    MissingToken(String),

    #[error("Discord API rate limited: retry after {0} seconds")]
    RateLimited(f64),

    #[error("Discord API 403 Forbidden: Missing BAN_MEMBERS permission or target role is higher than bot ({0})")]
    PermissionDenied(String),

    #[error("Discord API 404 Not Found: Guild '{guild_id}' or target user '{user_id}' does not exist on Discord")]
    NotFound { guild_id: String, user_id: String },

    #[error("Discord API 401 Unauthorized: Bot token is invalid or expired")]
    Unauthorized,

    #[error("Discord API moderation error (HTTP {status}): {body}")]
    DiscordApi { status: u16, body: String },

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Network error communicating with Discord: {0}")]
    Network(#[from] reqwest::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanRequestBody {
    #[serde(rename = "delete_message_seconds")]
    pub delete_message_seconds: u32,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "delete_message_days"
    )]
    pub delete_message_days: Option<u32>,
}

#[derive(Clone)]
pub struct DiscordModerationClient {
    client: reqwest::Client,
    api_base_url: String,
}

impl Default for DiscordModerationClient {
    fn default() -> Self {
        Self::new()
    }
}

impl DiscordModerationClient {
    pub fn new() -> Self {
        let base_url = std::env::var("DISCORD_API_BASE_URL")
            .or_else(|_| std::env::var("TRUTHBEACON_DISCORD_API_BASE_URL"))
            .unwrap_or_else(|_| DEFAULT_DISCORD_API_URL.to_string());
        Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            api_base_url: base_url,
        }
    }

    pub fn with_base_url(url: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            api_base_url: url.into(),
        }
    }

    /// Ban a suspect user from the guild and purge their messages (default 7 days).
    pub async fn ban_and_purge(
        &self,
        bot_token: &str,
        guild_id: &str,
        user_id: &str,
        delete_message_seconds: u32,
        reason: Option<&str>,
    ) -> Result<(), ModerationError> {
        let clean_token = bot_token
            .trim()
            .strip_prefix("Bot ")
            .unwrap_or(bot_token)
            .trim();
        if clean_token.is_empty() {
            return Err(ModerationError::MissingToken(guild_id.to_string()));
        }

        let clean_guild = guild_id.trim();
        let clean_user = user_id.trim();
        if clean_guild.is_empty() || clean_user.is_empty() {
            return Err(ModerationError::Validation(
                "Guild ID and User ID cannot be empty".to_string(),
            ));
        }

        // Apply rate limiter check for the ban route
        let route = format!("/guilds/{}/bans", clean_guild);
        let limiter = crate::gateway::rate_limiter::DiscordRateLimiter::new();
        if let Err(wait_dur) = limiter.try_acquire(&route) {
            return Err(ModerationError::RateLimited(wait_dur.as_secs_f64()));
        }

        let url = format!(
            "{}/guilds/{}/bans/{}",
            self.api_base_url, clean_guild, clean_user
        );

        let body = BanRequestBody {
            delete_message_seconds,
            delete_message_days: Some(delete_message_seconds / 86400),
        };

        let mut req = self
            .client
            .put(&url)
            .header(AUTHORIZATION, format!("Bot {}", clean_token))
            .header(CONTENT_TYPE, "application/json")
            .header(USER_AGENT, "TruthBeacon/0.1.0")
            .json(&body);

        if let Some(r) = reason {
            let clean_r = r.trim();
            if !clean_r.is_empty() {
                // Header must contain only visible ASCII characters (per HTTP spec)
                let safe_r: String = clean_r
                    .chars()
                    .filter(|c| c.is_ascii() && !c.is_ascii_control())
                    .take(512)
                    .collect();
                if let Ok(val) = HeaderValue::from_str(&safe_r) {
                    req = req.header("X-Audit-Log-Reason", val);
                }
            }
        }

        let res = req.send().await?;
        let status = res.status();

        if status.is_success() || status.as_u16() == 204 {
            log::info!(
                "[Discord Moderation] Successfully banned and purged user {} in guild {}",
                clean_user,
                clean_guild
            );
            Ok(())
        } else if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = res
                .headers()
                .get("Retry-After")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(5.0);
            limiter.handle_rate_limit_response(&route, retry_after, false);
            Err(ModerationError::RateLimited(retry_after))
        } else if status == reqwest::StatusCode::FORBIDDEN {
            let body_text = res.text().await.unwrap_or_default();
            Err(ModerationError::PermissionDenied(body_text))
        } else if status == reqwest::StatusCode::NOT_FOUND {
            Err(ModerationError::NotFound {
                guild_id: clean_guild.to_string(),
                user_id: clean_user.to_string(),
            })
        } else if status == reqwest::StatusCode::UNAUTHORIZED {
            Err(ModerationError::Unauthorized)
        } else {
            let body_text = res.text().await.unwrap_or_default();
            Err(ModerationError::DiscordApi {
                status: status.as_u16(),
                body: body_text,
            })
        }
    }
}

#[cfg(test)]
pub type MockBanHandler = fn(&str, &str, &str) -> Result<(), ModerationError>;

#[cfg(test)]
static TEST_MOCK_BAN_HANDLER: std::sync::RwLock<Option<MockBanHandler>> =
    std::sync::RwLock::new(None);

#[cfg(test)]
pub fn set_test_mock_ban_handler(handler: Option<MockBanHandler>) {
    let mut w = TEST_MOCK_BAN_HANDLER.write().unwrap();
    *w = handler;
}

/// Authoritative ban and purge helper:
/// Resolves token from `CredentialManager` for the given guild, and dispatches the ban.
pub async fn execute_discord_ban(
    guild_id: &str,
    user_id: &str,
    reason: Option<&str>,
) -> Result<(), ModerationError> {
    #[cfg(test)]
    {
        let reader = TEST_MOCK_BAN_HANDLER.read().unwrap();
        if let Some(mock) = *reader {
            return mock(guild_id, user_id, reason.unwrap_or(""));
        }
    }

    let token = crate::credentials::CredentialManager::get_token(guild_id)
        .or_else(|_| {
            crate::credentials::CredentialManager::list_registered_guilds()
                .ok()
                .and_then(|g| g.first().cloned())
                .map(|fg| crate::credentials::CredentialManager::get_token(&fg))
                .unwrap_or(Err(crate::credentials::CredentialError::TokenNotFound(
                    guild_id.to_string(),
                )))
        })
        .map_err(|_| ModerationError::MissingToken(guild_id.to_string()))?;

    let client = DiscordModerationClient::new();
    client
        .ban_and_purge(&token, guild_id, user_id, DEFAULT_PURGE_SECONDS, reason)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_discord_moderation_client_ban_and_purge_real_http() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            tokio::select! {
                _ = &mut shutdown_rx => {}
                res = listener.accept() => {
                    if let Ok((mut socket, _)) = res {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = [0u8; 4096];
                        let n = socket.read(&mut buf).await.unwrap_or(0);
                        let req_str = String::from_utf8_lossy(&buf[..n]);

                        // Verify method, path, headers and body
                        assert!(req_str.starts_with("PUT /guilds/guild_test_123/bans/user_suspect_456 "));
                        assert!(req_str.contains("authorization: Bot test_secret_token"));
                        assert!(req_str.contains("x-audit-log-reason: Malicious imposter phishing"));
                        assert!(req_str.contains("\"delete_message_seconds\":604800"));

                        let response = "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = socket.write_all(response.as_bytes()).await;
                        let _ = socket.shutdown().await;
                    }
                }
            }
        });

        let client = DiscordModerationClient::with_base_url(format!("http://{}", addr));
        let res = client
            .ban_and_purge(
                "Bot test_secret_token",
                "guild_test_123",
                "user_suspect_456",
                DEFAULT_PURGE_SECONDS,
                Some("Malicious imposter phishing"),
            )
            .await;

        let _ = shutdown_tx.send(());
        assert!(res.is_ok(), "Expected ban and purge to succeed: {:?}", res);
    }

    #[tokio::test]
    async fn test_discord_moderation_client_handles_403_forbidden() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            tokio::select! {
                _ = &mut shutdown_rx => {}
                res = listener.accept() => {
                    if let Ok((mut socket, _)) = res {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = [0u8; 2048];
                        let _ = socket.read(&mut buf).await;
                        let body = r#"{"code": 50013, "message": "Missing Permissions"}"#;
                        let response = format!(
                            "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(response.as_bytes()).await;
                        let _ = socket.shutdown().await;
                    }
                }
            }
        });

        let client = DiscordModerationClient::with_base_url(format!("http://{}", addr));
        let res = client
            .ban_and_purge(
                "Bot test_token",
                "guild_123",
                "user_456",
                DEFAULT_PURGE_SECONDS,
                None,
            )
            .await;

        let _ = shutdown_tx.send(());
        assert!(res.is_err());
        match res.unwrap_err() {
            ModerationError::PermissionDenied(msg) => {
                assert!(msg.contains("Missing Permissions"));
            }
            other => panic!("Expected PermissionDenied, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_discord_moderation_client_handles_401_unauthorized() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            tokio::select! {
                _ = &mut shutdown_rx => {}
                res = listener.accept() => {
                    if let Ok((mut socket, _)) = res {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = [0u8; 2048];
                        let _ = socket.read(&mut buf).await;
                        let body = r#"{"message": "401: Unauthorized", "code": 0}"#;
                        let response = format!(
                            "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(response.as_bytes()).await;
                        let _ = socket.shutdown().await;
                    }
                }
            }
        });

        let client = DiscordModerationClient::with_base_url(format!("http://{}", addr));
        let res = client
            .ban_and_purge(
                "Bot bad_token",
                "guild_123",
                "user_456",
                DEFAULT_PURGE_SECONDS,
                None,
            )
            .await;

        let _ = shutdown_tx.send(());
        assert!(res.is_err());
        match res.unwrap_err() {
            ModerationError::Unauthorized => {}
            other => panic!("Expected Unauthorized, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_discord_moderation_client_handles_429_rate_limited() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            tokio::select! {
                _ = &mut shutdown_rx => {}
                res = listener.accept() => {
                    if let Ok((mut socket, _)) = res {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = [0u8; 2048];
                        let _ = socket.read(&mut buf).await;
                        let body = r#"{"message": "You are being rate limited.", "retry_after": 2.5, "global": false}"#;
                        let response = format!(
                            "HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\nRetry-After: 2.5\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(response.as_bytes()).await;
                        let _ = socket.shutdown().await;
                    }
                }
            }
        });

        let client = DiscordModerationClient::with_base_url(format!("http://{}", addr));
        let res = client
            .ban_and_purge(
                "Bot test_token",
                "guild_123",
                "user_456",
                DEFAULT_PURGE_SECONDS,
                None,
            )
            .await;

        let _ = shutdown_tx.send(());
        assert!(res.is_err());
        match res.unwrap_err() {
            ModerationError::RateLimited(secs) => {
                assert!((secs - 2.5).abs() < 0.01);
            }
            other => panic!("Expected RateLimited, got {:?}", other),
        }
    }
}
