//! Temp Mail client.
//!
//! Thin wrapper around the RapidAPI "Temporary Mailbox" service
//! (`temp-email14.p.rapidapi.com`) that exposes temporary inboxes to the rest
//! of the crate. Intended for provider adapters that need to receive
//! verification emails when provisioning new accounts.
//!
//! Flow: `new_mail()` creates a mailbox and returns an `email` plus an access
//! `token`; that token authorizes `mails()` (which also needs the `email`)
//! and `read()`. `mails()` returns per-message tokens, and `read()` fetches a
//! full message by its token.
//!
//! The RapidAPI key is read from the `RAPIDAPI_KEY` env var, falling back to a
//! compiled-in default. Calls go out over direct egress by default; pass a
//! proxy URL (e.g. a Tor SOCKS port) if a provider adapter needs to hide the
//! gateway's source address. Note the plan is capped at ~200 emails/day.

use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

const TEMP_MAIL_API: &str = "https://temp-email14.p.rapidapi.com";
const TEMP_MAIL_HOST: &str = "temp-email14.p.rapidapi.com";
// The provider mounts every endpoint under a `/preview` prefix (confirmed for
// `/mails` via the RapidAPI curl; assumed identical for `/newmail` and
// `/read`). Change here if the other endpoints turn out not to be prefixed.
const API_PREFIX: &str = "/preview";
const RAPIDAPI_KEY_ENV: &str = "RAPIDAPI_KEY";
const AUTH_HEADER: &str = "Authorization";

/// Compiled-in default RapidAPI key. The temp-mail plan is free (no billing
/// attached), so the key is safe to ship in source. `RAPIDAPI_KEY` still
/// overrides it if a rotation is ever needed.
const DEFAULT_RAPIDAPI_KEY: &str = "b58ebe6e15mshe15d9a067c9dd35p1223bbjsn4c48ca28b93e";

/// A freshly created temporary mailbox.
///
/// `token` is the access token that authorizes `mails()` and `read()` for this
/// mailbox; `email` is the inbox address and must also be passed to `mails()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TempMailAccount {
    pub email: String,
    pub token: String,
}

/// Sender/recipient address block returned by the read endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailAddress {
    pub address: String,
    #[serde(default)]
    pub name: String,
}

/// A single email returned by the read endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mail {
    pub id: String,
    #[serde(default)]
    pub seen: bool,
    pub from: MailAddress,
    #[serde(default)]
    pub to: Vec<MailAddress>,
    #[serde(default)]
    pub cc: Vec<MailAddress>,
    #[serde(default)]
    pub bcc: Vec<MailAddress>,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub html: Vec<String>,
    #[serde(default)]
    pub date: String,
}

/// Reusable HTTP client bound to the configured RapidAPI key.
#[derive(Clone)]
pub struct TempMailClient {
    http: Client,
    api_key: String,
}

impl TempMailClient {
    /// Build a client from the `RAPIDAPI_KEY` env var, falling back to the
    /// compiled-in default key. Always returns `Some` unless the resolved key
    /// is empty.
    pub fn from_env(proxy_url: Option<&str>) -> Result<Option<Self>> {
        let api_key = match load_key() {
            Some(key) => key,
            None => return Ok(None),
        };
        Ok(Some(Self {
            http: build_client(proxy_url)?,
            api_key,
        }))
    }

    /// Create a brand new temporary mailbox.
    pub async fn new_mail(&self) -> Result<TempMailAccount> {
        let response = self
            .http
            .get(format!("{}{}/newmail", TEMP_MAIL_API, API_PREFIX))
            .header("X-RapidAPI-Key", &self.api_key)
            .header("X-RapidAPI-Host", TEMP_MAIL_HOST)
            .send()
            .await
            .context("Temp Mail newmail request failed")?;

        let data = decode_response(response, "newmail").await?;

        // The newmail endpoint reports success via `status` (not `success`).
        if !data
            .get("status")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            anyhow::bail!("Temp Mail newmail reported failure: {}", data);
        }

        let newmail = data
            .get("newmail")
            .ok_or_else(|| anyhow!("Temp Mail newmail response missing newmail field"))?;
        let email = newmail
            .get("email")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Temp Mail newmail response missing email"))?
            .to_string();
        let token = newmail
            .get("token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Temp Mail newmail response missing token"))?
            .trim()
            .to_string();

        Ok(TempMailAccount { email, token })
    }

    /// List the per-message tokens for the mailbox bound to `account`.
    ///
    /// The upstream API returns an array of opaque token strings (not full
    /// message objects); pass each token to [`read`] to fetch the message.
    pub async fn mails(&self, account: &TempMailAccount) -> Result<Vec<String>> {
        let response = self
            .http
            .get(format!("{}{}/mails", TEMP_MAIL_API, API_PREFIX))
            .header("X-RapidAPI-Key", &self.api_key)
            .header("X-RapidAPI-Host", TEMP_MAIL_HOST)
            .header(AUTH_HEADER, &account.token)
            .header("Content-Type", "application/json")
            .json(&json!({ "email": account.email }))
            .send()
            .await
            .context("Temp Mail mails request failed")?;

        let data = decode_response(response, "mails").await?;

        if !data
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            anyhow::bail!("Temp Mail mails reported failure: {}", data);
        }

        let mails = data
            .get("mails")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        Ok(mails)
    }

    /// Read a single email by its message token. Requires the mailbox's
    /// access token (`account.token`).
    pub async fn read(&self, mail_token: &str, account: &TempMailAccount) -> Result<Mail> {
        let response = self
            .http
            .get(format!(
                "{}{}/read/{}",
                TEMP_MAIL_API, API_PREFIX, mail_token
            ))
            .header("X-RapidAPI-Key", &self.api_key)
            .header("X-RapidAPI-Host", TEMP_MAIL_HOST)
            .header(AUTH_HEADER, &account.token)
            .send()
            .await
            .context("Temp Mail read request failed")?;

        let data = decode_response(response, "read").await?;

        if !data
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            anyhow::bail!("Temp Mail read reported failure: {}", data);
        }

        let mail = data
            .get("mail")
            .ok_or_else(|| anyhow!("Temp Mail read response missing mail field"))?;
        serde_json::from_value(mail.clone()).context("Temp Mail read payload did not match Mail")
    }

    /// Convenience helper: poll a mailbox until a message arrives or the
    /// deadline elapses, then return the first received email. Useful for
    /// provider adapters that block on a single verification message.
    pub async fn await_first_mail(
        &self,
        account: &TempMailAccount,
        poll_interval: Duration,
        timeout: Duration,
    ) -> Result<Mail> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let mail_tokens = self.mails(account).await?;
            if let Some(token) = mail_tokens.first() {
                return self.read(token, account).await;
            }
            if tokio::time::Instant::now() >= deadline {
                anyhow::bail!(
                    "Timed out waiting for mail to {} after {:?}",
                    account.email,
                    timeout
                );
            }
            tokio::time::sleep(poll_interval).await;
        }
    }
}

/// Send the request and parse the JSON body, surfacing HTTP failures with the
/// endpoint name for context. Returns the parsed `Value` on success.
async fn decode_response(response: reqwest::Response, endpoint: &str) -> Result<serde_json::Value> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("Temp Mail {} returned {}: {}", endpoint, status, body);
    }
    response
        .json::<serde_json::Value>()
        .await
        .with_context(|| format!("Temp Mail {} JSON parse failed", endpoint))
}

fn build_client(proxy_url: Option<&str>) -> Result<Client> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("leech-rs")
        .no_proxy();
    if let Some(url) = proxy_url {
        builder = builder.proxy(reqwest::Proxy::all(url)?);
    }
    Ok(builder.build()?)
}

fn load_key() -> Option<String> {
    let key = std::env::var(RAPIDAPI_KEY_ENV)
        .ok()
        .filter(|k| !k.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_RAPIDAPI_KEY.to_string());
    let key = key.trim().to_string();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_documented_read_payload() {
        let raw = serde_json::json!({
            "id": "token123",
            "seen": true,
            "from": { "address": "sender@example.com", "name": "Sender Name" },
            "to": [{ "address": "useremail@yourdomain.com", "name": "" }],
            "cc": [],
            "bcc": [],
            "subject": "Hello",
            "text": "This is a test email",
            "html": ["<p>This is a test email</p>"],
            "date": "2023-12-24T14:01:24+00:00"
        });
        let mail: Mail = serde_json::from_value(raw).unwrap();
        assert_eq!(mail.id, "token123");
        assert_eq!(mail.from.address, "sender@example.com");
        assert_eq!(mail.to.len(), 1);
        assert_eq!(mail.html.len(), 1);
    }

    #[test]
    fn parses_mails_token_list() {
        let raw = serde_json::json!({
            "success": true,
            "mails": ["token123", "token456"],
            "size": 2048,
            "expired": false
        });
        // Mirrors the extraction logic in `mails`.
        let mails: Vec<String> = raw
            .get("mails")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        assert_eq!(mails, vec!["token123".to_string(), "token456".to_string()]);
    }

    #[test]
    fn load_key_falls_back_to_default_when_unset() {
        std::env::remove_var(RAPIDAPI_KEY_ENV);
        let key = load_key().expect("default key should be used when env var is unset");
        assert_eq!(key, DEFAULT_RAPIDAPI_KEY);
    }
}
