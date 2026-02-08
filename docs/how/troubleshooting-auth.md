# Troubleshooting Authentication

Common issues and solutions when using GitHub OAuth with trex.

## "Access Denied" / 403 Forbidden

**Cause**: Your GitHub username is not in the allowlist.

**Fix**: Add your username to `~/.config/trex/allowed_users.json`:

```json
{
  "version": 1,
  "users": ["your-github-username"]
}
```

The change takes effect immediately (no restart needed).

## "Invalid or Expired State Parameter"

**Cause**: The CSRF state token expired (10-minute window) or was already used.

**Fix**: Click "Login with GitHub" again to start a fresh OAuth flow.

## Token Expired / Logged Out Unexpectedly

**Cause**: The access token (15 min) expired and the refresh token (7 days) also expired or failed to renew.

**Fix**: Click "Login with GitHub" to re-authenticate. The frontend normally refreshes tokens silently every 12 minutes.

## "Configuration Error" on Startup

**Cause**: Missing required environment variables when `TREX_AUTH_ENABLED=true`.

**Required variables**:
- `TREX_GITHUB_CLIENT_ID`
- `TREX_GITHUB_CLIENT_SECRET`
- `TREX_GITHUB_CALLBACK_URL`
- `TREX_JWT_SECRET`

## Can't See Other Users' Sessions

**This is by design.** When auth is enabled, each user only sees their own sessions. This is the session isolation feature.

## Disabling Authentication (Rollback)

If something goes wrong:

```bash
unset TREX_AUTH_ENABLED
# or
export TREX_AUTH_ENABLED=false
```

Restart trex. It will revert to localhost-only mode with no authentication.

## OAuth Callback URL Mismatch

**Cause**: The callback URL in your environment doesn't match the one configured in GitHub.

**Fix**: Ensure `TREX_GITHUB_CALLBACK_URL` matches exactly what's set in your GitHub OAuth App settings (Settings > Developer settings > OAuth Apps > your app).

## WebSocket Connection Fails After Login

**Cause**: Usually a cookie issue. WebSocket connections in browsers automatically include cookies for same-origin requests.

**Fix**:
1. Verify you're accessing trex from the same origin as the OAuth callback URL
2. Check browser DevTools > Application > Cookies for `trex_access_token`
3. Try logging out and back in
