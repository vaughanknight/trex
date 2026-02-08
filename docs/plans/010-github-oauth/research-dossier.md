# Research Report: GitHub OAuth Support for Remote Access

**Generated**: 2026-02-09
**Research Query**: "GitHub OAuth support so you log in, with a list of supported GitHub users by username for secure remote access"
**Mode**: Plan-Associated
**Location**: `docs/plans/010-github-oauth/research-dossier.md`
**FlowSpace**: Not Available (used standard tools)
**Findings**: 68 total from 7 parallel subagents

## Executive Summary

### What It Does
trex is a browser-based terminal application with a Go WebSocket server and React/Zustand frontend. Currently runs localhost-only with NO authentication. Adding GitHub OAuth would enable:
1. Secure remote access over the network
2. User allowlist based on GitHub usernames
3. Per-session or per-connection authentication state

### Business Purpose
Enable multiple users to securely access terminal sessions on a shared machine by authenticating via their GitHub accounts. Only GitHub users on an approved list can connect and create sessions.

### Key Insights
1. **No authentication exists today** - All endpoints are completely open (CheckOrigin accepts all origins)
2. **Architecture is ready** - sessionId routing, mutex-protected writes, and per-session context patterns exist
3. **Dual distribution impacts OAuth** - Web mode has browser-native OAuth; Electron needs custom handling

### Quick Stats
- **Backend Components**: 4 Go packages (cmd, server, terminal, static)
- **Frontend Components**: 12+ stores/hooks, 20+ components
- **Dependencies**: Minimal (gorilla/websocket, creack/pty) - need to add oauth2 libraries
- **Test Coverage**: High with fakes-only policy (ADR-0004)
- **Prior Learnings**: 8 relevant discoveries from previous implementations

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `/api/health` | HTTP GET | server.go:35 | Health check (no auth) |
| `/api/sessions` | HTTP GET | server.go:36 | List sessions (no auth) |
| `/api/sessions/:id` | HTTP DELETE | server.go:37 | Close session (no auth) |
| `/ws` | WebSocket | server.go:38 | Terminal I/O (no auth) |
| `/` | Static | server.go:39 | Serve frontend |

### WebSocket Connection Flow
```
1. Frontend calls connect() lazily (on first session creation)
2. WebSocket URL: ws://${host}/ws (no auth headers)
3. CheckOrigin returns true unconditionally
4. Connection handler created with sessionId map
5. Messages routed by sessionId field
```

### Current Security Model
- **Localhost-only binding**: `127.0.0.1:3000` (hardcoded)
- **No authentication**: All endpoints open
- **Permissive CORS**: CheckOrigin accepts all origins
- **Constitution defers auth to v2+**: Explicit design decision

---

## Architecture for OAuth Integration

### Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐     │
│  │  useAuthStore │   │useCentralWS   │   │  Components   │     │
│  │  (NEW)        │◄──│  + auth token │◄──│  LoginButton  │     │
│  └───────────────┘   └───────────────┘   └───────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket + auth token
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐     │
│  │ OAuth Routes  │   │ Auth Middleware│   │ User Allowlist│     │
│  │ /auth/github  │──►│ validateToken │──►│ checkAllowed  │     │
│  │ /auth/callback│   └───────────────┘   └───────────────┘     │
│  └───────────────┘           │                                  │
│                              ▼                                  │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐     │
│  │ handleTerminal│   │ SessionRegistry│   │ Terminal PTY  │     │
│  │ + user context│──►│ + owner field │──►│ (existing)    │     │
│  └───────────────┘   └───────────────┘   └───────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### OAuth Flow Design

```
1. User visits app → sees login button (not authenticated)
2. Click "Login with GitHub" → redirect to GitHub OAuth
3. GitHub prompts for authorization → user approves
4. Redirect back to /auth/callback?code=xxx
5. Backend exchanges code for access token
6. Backend fetches GitHub username via API
7. Backend checks username against allowlist
8. If allowed: issue session JWT, redirect to app
9. Frontend stores JWT, includes in WebSocket connection
10. Backend validates JWT on WebSocket upgrade
11. User can now create/manage terminal sessions
```

---

## Dependencies & Integration

### New Backend Dependencies Required

| Package | Purpose | Version |
|---------|---------|---------|
| `golang.org/x/oauth2` | OAuth 2.0 client | Latest |
| `golang.org/x/oauth2/github` | GitHub provider | Latest |
| `github.com/golang-jwt/jwt/v5` | JWT signing/validation | v5.x |

### New Frontend Dependencies Required

| Package | Purpose | Version |
|---------|---------|---------|
| None required | Native fetch API for OAuth | N/A |

### Configuration Requirements

```yaml
# Environment variables needed:
TREX_GITHUB_CLIENT_ID: "..."       # GitHub OAuth App Client ID
TREX_GITHUB_CLIENT_SECRET: "..."   # GitHub OAuth App Client Secret
TREX_OAUTH_CALLBACK_URL: "..."     # e.g., http://localhost:3000/auth/callback
TREX_JWT_SECRET: "..."             # Secret for signing session JWTs
TREX_ALLOWED_USERS: "user1,user2"  # Comma-separated GitHub usernames
TREX_BIND_ADDRESS: "0.0.0.0:3000"  # Allow network binding (vs 127.0.0.1)
```

---

## Quality & Testing

### Testing Strategy (Per ADR-0004: Fakes Only)

1. **FakeOAuthProvider** - In-memory OAuth server for unit tests
2. **FakeGitHubAPI** - Simulates GitHub user info API
3. **FakeJWT** - Predictable token generation for tests
4. **Integration tests** - Real OAuth with GitHub test app (CI secret)

### Test Scenarios

| Scenario | Type | Description |
|----------|------|-------------|
| Happy path login | Integration | Full OAuth flow with allowed user |
| Denied user | Unit | User not in allowlist |
| Expired token | Unit | JWT past expiration |
| Invalid token | Unit | Malformed/tampered JWT |
| Token refresh | Unit | Refresh flow if implemented |
| WebSocket auth | Integration | JWT validated on upgrade |

---

## Prior Learnings Applied

### PL-01: sessionId Routing Architecture
**Relevance**: OAuth state can be routed per-session or per-connection using existing sessionId infrastructure.
**Action**: Store OAuth user context at connection level, not session level.

### PL-02: Mutex-Protected WebSocket Writes
**Relevance**: OAuth token validation messages must use writeMu.
**Action**: Apply existing mutex pattern to auth-related WebSocket messages.

### PL-03: Context Cancellation for Cleanup
**Relevance**: OAuth state should be cleaned up when connection closes.
**Action**: Tie auth validation goroutines to connection context.

### PL-05: Array Selector Memory Pattern
**Relevance**: User profile in Zustand must not cause re-renders.
**Action**: Use primitive selectors for username, avatarUrl, etc.

### PL-06: Don't Capture Dynamic State in Refs
**Relevance**: Auth status must be reactive, not frozen at mount.
**Action**: Keep authToken in Zustand state, not useRef.

### PL-07: Conservative Defaults with Graceful Degradation
**Relevance**: GitHub API failures need fallback handling.
**Action**: Show clear error states, timeout after 5 seconds.

---

## Modification Considerations

### ✅ Safe to Modify
- Add new `/auth/*` routes in server.go
- Create new `useAuthStore` Zustand store
- Add login UI components

### ⚠️ Modify with Caution
- WebSocket upgrader CheckOrigin function
- Server binding address (127.0.0.1 → configurable)
- Frontend WebSocket connection (add token)

### 🚫 Danger Zones
- Terminal PTY creation logic
- Session registry core operations
- Existing message protocol (extend, don't change)

---

## Critical Discoveries

### 🚨 Critical Finding 01: No Authentication Infrastructure
**Impact**: Critical
**What**: All endpoints completely open, no middleware pattern exists
**Required Action**: Add authentication middleware layer before any routes

### 🚨 Critical Finding 02: Hardcoded Localhost Binding
**Impact**: Critical
**What**: Server binds to 127.0.0.1:3000 only
**Required Action**: Make binding address configurable for network access

### 🚨 Critical Finding 03: Dual Distribution OAuth Difference
**Impact**: High
**What**: Web mode uses browser OAuth, Electron needs custom handling
**Required Action**: Plan separate OAuth flows or use local HTTP server in Electron

### 🚨 Critical Finding 04: Constitution Defers Auth to v2+
**Impact**: High
**What**: v1 design explicitly says "localhost-only, no auth"
**Required Action**: This may need constitution amendment or be considered v2 work

---

## Recommendations

### Implementation Phases

1. **Phase 1: Configuration & Environment** (CS-2)
   - Add environment variable support to backend
   - Make server binding address configurable
   - Add GitHub OAuth app configuration

2. **Phase 2: OAuth Routes** (CS-3)
   - Add `/auth/github` (initiate OAuth)
   - Add `/auth/callback` (handle callback)
   - Add `/auth/logout` (clear session)
   - Add `/auth/user` (get current user)

3. **Phase 3: User Allowlist** (CS-2)
   - Load allowed usernames from config
   - Validate GitHub username against list
   - Reject unauthorized users

4. **Phase 4: Auth Middleware** (CS-3)
   - Create JWT validation middleware
   - Wrap protected routes
   - Add user context to requests

5. **Phase 5: WebSocket Authentication** (CS-3)
   - Validate JWT on WebSocket upgrade
   - Store user context in connection handler
   - Add owner field to sessions

6. **Phase 6: Frontend Auth Store** (CS-2)
   - Create `useAuthStore` with token, user
   - Add login/logout UI
   - Include token in WebSocket connection

7. **Phase 7: Testing** (CS-3)
   - FakeOAuthProvider implementation
   - Unit tests for all auth flows
   - Integration tests with real GitHub

### Complexity Estimate: CS-4
- Multi-component integration (frontend + backend)
- External service integration (GitHub API)
- Security-critical implementation
- New infrastructure (JWT, OAuth)

---

## External Research Opportunities

### Research Opportunity 1: GitHub OAuth Best Practices 2026

**Why Needed**: Ensure implementation follows current security standards for OAuth 2.0/PKCE.

**Ready-to-use prompt:**
```
/deepresearch "GitHub OAuth 2.0 implementation best practices for 2026:
- Should we use Authorization Code flow with PKCE or without?
- What are the current recommendations for token storage (httpOnly cookies vs localStorage)?
- How should we handle token refresh for long-lived terminal sessions?
- What are the security headers required for OAuth callback endpoints?
- Are there new GitHub OAuth scopes we should be aware of?"
```

### Research Opportunity 2: Electron OAuth Patterns

**Why Needed**: Electron doesn't have browser-native OAuth redirect handling.

**Ready-to-use prompt:**
```
/deepresearch "Electron OAuth implementation patterns 2026:
- How do Electron apps handle OAuth callbacks (deep links vs local server)?
- What is the recommended approach for system browser vs in-app browser?
- How to share OAuth state between Electron and embedded web content?
- Are there security considerations specific to Electron OAuth?"
```

---

## Next Steps

1. **Create GitHub Issue** for tracking
2. **Create feature branch** `feature/010-github-oauth`
3. Optionally run `/deepresearch` prompts above
4. Run `/plan-1b-specify "GitHub OAuth Support"` to create specification

---

**Research Complete**: 2026-02-09
**Report Location**: `docs/plans/010-github-oauth/research-dossier.md`
