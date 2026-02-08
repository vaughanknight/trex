# Authentication

trex uses GitHub OAuth 2.0 for authentication when remote access is needed.

## Feature Flag

All authentication behavior is gated behind `TREX_AUTH_ENABLED=true`. When disabled (default):
- Server binds to `127.0.0.1:3000` (localhost only)
- All endpoints are open
- No login UI is shown

When enabled:
- Server binds to `0.0.0.0:3000` (network accessible)
- API endpoints require a valid JWT
- Login with GitHub button appears in the sidebar

## OAuth Flow

1. User clicks "Login with GitHub" in the sidebar
2. Browser redirects to GitHub authorization page
3. User authorizes the trex OAuth App
4. GitHub redirects back to `/auth/callback` with an authorization code
5. Backend exchanges the code for a GitHub access token
6. Backend fetches user info from GitHub API
7. Backend checks the username against the allowlist
8. If allowed, backend issues JWT tokens as httpOnly cookies
9. Browser redirects to `/` — user is now authenticated

## JWT Tokens

Two tokens are issued as httpOnly cookies (not accessible to JavaScript):

| Token | Cookie Name | TTL | Purpose |
|-------|-------------|-----|---------|
| Access Token | `trex_access_token` | 15 minutes | Authorizes API/WebSocket requests |
| Refresh Token | `trex_refresh_token` | 7 days | Used to get new access tokens |

The frontend automatically refreshes the access token every 12 minutes. If refresh fails, the user is prompted to log in again.

## Session Isolation

When auth is enabled, each terminal session is tagged with its creator's GitHub username. Users can only see and interact with their own sessions through:
- WebSocket messages (filtered by session owner)
- REST API `/api/sessions` (filtered by authenticated user)
- Session deletion (ownership checked)

## Security Model

- **Tokens in httpOnly cookies**: Not accessible to JavaScript, mitigating XSS attacks
- **SameSite flags**: `Lax` for access token, `Strict` for refresh token
- **CSRF protection**: OAuth state parameter with 10-minute TTL, single-use
- **Allowlist**: Only pre-approved GitHub usernames can authenticate
- **Hot reload**: Allowlist changes take effect immediately without restart

## Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/auth/enabled` | GET | No | Returns `{"enabled": true/false}` |
| `/api/auth/me` | GET | Yes | Returns authenticated user info |
| `/auth/github` | GET | No | Initiates GitHub OAuth flow |
| `/auth/callback` | GET | No | GitHub OAuth callback |
| `/auth/logout` | POST | No | Clears auth cookies |
| `/auth/refresh` | POST | No | Refreshes access token |

## Rollback

To disable authentication:

1. Set `TREX_AUTH_ENABLED=false` (or unset it)
2. Restart trex

The server immediately reverts to localhost-only binding with no auth required.
