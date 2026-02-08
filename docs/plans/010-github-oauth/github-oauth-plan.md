# GitHub OAuth Support Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-09
**Spec**: [./github-oauth-spec.md](./github-oauth-spec.md)
**Status**: READY
**Mode**: Full
**Complexity**: CS-4 (Large)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [ADR Ledger](#adr-ledger)
5. [Testing Philosophy](#testing-philosophy)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Configuration & Environment](#phase-1-configuration--environment)
   - [Phase 2: Backend OAuth Routes](#phase-2-backend-oauth-routes)
   - [Phase 3: User Allowlist with Hot Reload](#phase-3-user-allowlist-with-hot-reload)
   - [Phase 4: Auth Middleware & JWT](#phase-4-auth-middleware--jwt)
   - [Phase 5: WebSocket Authentication](#phase-5-websocket-authentication)
   - [Phase 6: Frontend Auth Store & UI](#phase-6-frontend-auth-store--ui)
   - [Phase 7: Documentation](#phase-7-documentation)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Complexity Tracking](#complexity-tracking)
9. [Progress Tracking](#progress-tracking)
10. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: trex currently runs localhost-only with no authentication. Users cannot securely access terminal sessions from remote machines, and there's no way to control who can connect.

**Solution**: Add GitHub OAuth authentication with username allowlist, enabling:
- Secure remote access over network with JWT-based session management
- GitHub identity verification (no new passwords)
- Fine-grained access via username allowlist with hot reload
- Session isolation (users only see their own sessions)
- Feature flag (`TREX_AUTH_ENABLED`) for gradual rollout and instant rollback

**Expected Outcomes**:
- Machine owners can enable remote access with confidence
- Only approved GitHub users can access the system
- Each user's sessions are isolated from other users
- Token refresh provides seamless experience during long terminal sessions

**Success Metrics**:
- AC-01 through AC-10 from spec all pass
- Integration tests pass with real GitHub OAuth
- Rollback completes in <30 seconds (set flag, restart)

---

## Technical Context

### Current System State

| Component | Current State | OAuth Impact |
|-----------|--------------|--------------|
| Server binding | Hardcoded `127.0.0.1:3000` | Must be configurable |
| Authentication | None (all endpoints open) | Add middleware layer |
| WebSocket CheckOrigin | `return true` (accepts all) | Conditional validation |
| Session ownership | None (global list) | Add Owner field |
| Frontend auth | None | New useAuthStore |

### Integration Requirements

- **GitHub OAuth API**: Authorization Code flow with PKCE
- **golang.org/x/oauth2**: OAuth 2.0 client for Go
- **github.com/golang-jwt/jwt/v5**: JWT signing/validation
- **github.com/fsnotify/fsnotify**: File watcher for allowlist hot reload

### Constraints

- Feature flag must gate ALL auth behavior (R-06)
- httpOnly cookies for token storage (R-04)
- Session isolation by owner (R-03)
- Atomic allowlist reload with file watcher (R-09)

### Assumptions

- GitHub OAuth App created manually by machine owner
- Environment variables for OAuth configuration
- Config file at `~/.config/trex/allowed_users.json` for allowlist
- Constitution amendment done (v1.3.0)

---

## Critical Research Findings

### From Implementation Strategy Research

| # | Impact | Finding | Action | Affects Phases |
|---|--------|---------|--------|----------------|
| I-01 | Critical | Connection handler pattern enables user context injection | Add `authUser` field to `connectionHandler` | 4, 5 |
| I-02 | High | Message protocol extension point exists | Add `"auth_required"` message type | 2, 4 |
| I-03 | High | Lazy WebSocket requires token before `createSession()` | Inject token via URL param or header | 5, 6 |
| I-04 | Critical | Session registry needs Owner field + filtering | Add `ListByOwner(username)` method | 4, 5 |
| I-05 | High | Zustand pattern shows exact shape for useAuthStore | Follow settings.ts pattern, NO persistence for tokens | 6 |
| I-06 | Medium | Mutex patterns extend cleanly to auth | No new mutexes needed; auth is per-connection | 4 |
| I-07 | Medium | Context cleanup matches OAuth requirements | Tie refresh goroutines to connection context | 4, 5 |
| I-08 | High | Tests require both fakes AND real GitHub | FakeOAuthProvider for unit, real GitHub for integration | 7 |
| I-09 | Critical | Hot reload requires file watcher + atomic updates | Use fsnotify + RWMutex pattern | 3 |
| I-10 | High | JWT validation maintains backward compatibility | Check flag before enforcing auth | 3, 4 |

### From Risk & Mitigation Research

| # | Risk Level | Finding | Mitigation | Affects Phases |
|---|------------|---------|------------|----------------|
| R-01 | Critical | Open WebSocket upgrader | Conditional origin validation when auth enabled | 5 |
| R-02 | Critical | Hardcoded localhost binding | Configurable with feature flag guard | 1 |
| R-03 | High | Session isolation bypass via sessionId | Per-connection user context + ownership validation | 4, 5 |
| R-04 | Critical | Token storage XSS vulnerability | httpOnly cookies + WSS enforcement | 2, 6 |
| R-05 | High | Session registry concurrent access | Lazy migration + Owner field with filter | 4 |
| R-06 | High | Feature flag inconsistency | Centralized auth middleware for ALL routes | 4 |
| R-07 | High | CSRF state parameter attacks | Strong state generation + TTL storage | 2 |
| R-08 | Medium | Token expiration interrupts sessions | Dual-token system + silent refresh | 2, 6 |
| R-09 | High | Allowlist hot reload race conditions | Atomic RWMutex + graceful degradation | 3 |
| R-10 | Medium | Incomplete rollback cleanup | Startup validation + clean shutdown | All |

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | All (Testing) | Fakes-only policy - FakeOAuthProvider, FakeGitHubAPI, FakeJWT |
| ADR-0006 | Accepted | 1, 3 | XDG paths - allowlist at `~/.config/trex/allowed_users.json` |

**Recommended New ADRs** (to be created in Phase 1):
- ADR-0008: OAuth Token Storage Mechanism (httpOnly cookies vs localStorage)
- ADR-0009: Electron OAuth Callback Pattern (deep links vs local server)

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: Security-critical OAuth feature requires comprehensive test coverage before implementation. Token handling, CSRF protection, and session management must be thoroughly tested.

**Focus Areas**:
- OAuth flow (authorization, callback, token exchange)
- JWT validation and expiration handling
- Allowlist enforcement with hot reload
- WebSocket authentication
- Refresh token silent renewal
- Session isolation (user can only see/close own sessions)

### Test-Driven Development

All phases follow strict TDD:
1. **RED**: Write failing tests first
2. **GREEN**: Implement minimal code to pass
3. **REFACTOR**: Clean up while tests still pass

### Mock Usage (Per ADR-0004: Fakes Only)

- **FakeOAuthProvider**: In-memory OAuth server for unit tests
- **FakeGitHubAPI**: Simulates GitHub user info endpoint
- **FakeJWT**: Predictable token generation
- **Integration tests**: Real GitHub OAuth with test app (CI secret)

### Test Documentation

Every promoted test includes:
```go
// Test Doc:
// - Why: [business/security reason]
// - Contract: [what invariant this asserts]
// - Usage Notes: [how to call, gotchas]
// - Quality Contribution: [what failures it catches]
// - Worked Example: [inputs/outputs summary]
```

---

## Implementation Phases

### Phase 1: Configuration & Environment

**Objective**: Add configurable server binding and environment variable support for OAuth settings.

**Deliverables**:
- Configurable bind address (`TREX_BIND_ADDRESS`)
- Feature flag (`TREX_AUTH_ENABLED`)
- OAuth environment variables loading
- Startup validation

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Network exposure without auth | Medium | Critical | Feature flag guards binding to 0.0.0.0 only when auth enabled |
| Missing env vars at startup | Low | High | Fail-fast startup validation |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for config loading | 2 | Tests cover: env vars, defaults, validation | - | Create `internal/config/config_test.go` |
| 1.2 | [ ] | Write tests for feature flag behavior | 2 | Tests cover: binding differs based on flag | - | Test localhost vs network binding |
| 1.3 | [ ] | Create config package | 2 | Config struct loads from env | - | `/backend/internal/config/config.go` |
| 1.4 | [ ] | Implement configurable bind address | 2 | Server uses config.BindAddress | - | Modify `cmd/trex/main.go` |
| 1.5 | [ ] | Add startup validation | 2 | Missing required vars → fail-fast | - | Per R-02 mitigation |
| 1.6 | [ ] | Add TREX_AUTH_ENABLED flag | 1 | Flag parsed and accessible | - | Default: false |

### Test Examples (Write First!)

```go
func TestConfig_LoadFromEnv(t *testing.T) {
    // Test Doc:
    // - Why: Ensure OAuth config is correctly loaded from environment
    // - Contract: All TREX_* env vars map to config fields
    // - Usage Notes: Set env vars before calling Load()
    // - Quality Contribution: Prevents misconfiguration causing auth failures
    // - Worked Example: TREX_BIND_ADDRESS=0.0.0.0:3000 → BindAddress="0.0.0.0:3000"

    t.Setenv("TREX_BIND_ADDRESS", "0.0.0.0:3000")
    t.Setenv("TREX_AUTH_ENABLED", "true")
    t.Setenv("TREX_GITHUB_CLIENT_ID", "test-id")

    cfg, err := config.Load()

    assert.NoError(t, err)
    assert.Equal(t, "0.0.0.0:3000", cfg.BindAddress)
    assert.True(t, cfg.AuthEnabled)
    assert.Equal(t, "test-id", cfg.GitHubClientID)
}

func TestConfig_DefaultsToLocalhostWhenAuthDisabled(t *testing.T) {
    // Test Doc:
    // - Why: Security - network binding only allowed with auth
    // - Contract: AuthEnabled=false → BindAddress=127.0.0.1:3000
    // - Quality Contribution: Prevents accidental network exposure

    t.Setenv("TREX_AUTH_ENABLED", "false")

    cfg, err := config.Load()

    assert.NoError(t, err)
    assert.Equal(t, "127.0.0.1:3000", cfg.BindAddress)
}
```

### Non-Happy-Path Coverage
- [ ] Missing GITHUB_CLIENT_ID when auth enabled → startup error
- [ ] Invalid bind address format → startup error
- [ ] Auth enabled without CLIENT_SECRET → startup error

### Acceptance Criteria
- [ ] All tests passing (6 tests minimum)
- [ ] Server starts with localhost binding when auth disabled
- [ ] Server allows network binding when auth enabled
- [ ] Missing required env vars produce clear error messages

---

### Phase 2: Backend OAuth Routes

**Objective**: Implement GitHub OAuth authorization flow with secure token handling.

**Deliverables**:
- `/auth/github` endpoint (initiate OAuth)
- `/auth/callback` endpoint (handle GitHub callback)
- `/auth/logout` endpoint (clear session)
- `/auth/refresh` endpoint (token refresh)
- `/api/auth/enabled` endpoint (feature flag status)
- CSRF state parameter protection

**Dependencies**: Phase 1 complete (config available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSRF attack on callback | Medium | High | Strong state parameter + TTL (R-07) |
| Token interception | Medium | High | httpOnly cookies (R-04) |
| GitHub API rate limits | Low | Medium | Cache user info |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Create FakeOAuthProvider | 2 | Simulates GitHub OAuth flow | - | `internal/auth/fake_provider_test.go` |
| 2.2 | [ ] | Write tests for /auth/github | 2 | Tests: redirect URL, state param | - | |
| 2.3 | [ ] | Write tests for /auth/callback | 3 | Tests: code exchange, token issue, state validation | - | |
| 2.4 | [ ] | Write tests for /auth/logout | 1 | Tests: cookie cleared | - | |
| 2.5 | [ ] | Write tests for /auth/refresh | 2 | Tests: refresh token validation, new access token | - | |
| 2.6 | [ ] | Implement state storage | 2 | In-memory with TTL (10 min expiry) | - | Per R-07 |
| 2.7 | [ ] | Implement OAuth routes | 3 | All tests pass | - | `internal/auth/handlers.go` |
| 2.8 | [ ] | Add httpOnly cookie setting | 2 | Cookies set with Secure, SameSite, HttpOnly | - | Per R-04 |
| 2.9 | [ ] | Register routes in server.go | 1 | Routes accessible | - | |
| 2.10 | [ ] | Add /api/auth/enabled endpoint | 1 | Returns {enabled: bool} | - | For frontend flag check |

### Test Examples (Write First!)

```go
func TestOAuth_InitiateFlow(t *testing.T) {
    // Test Doc:
    // - Why: Verify OAuth flow starts correctly with state protection
    // - Contract: GET /auth/github → redirect to GitHub with state param
    // - Usage Notes: State is stored server-side for validation
    // - Quality Contribution: Prevents CSRF attacks on OAuth

    handler := NewOAuthHandler(fakeConfig, fakeStateStore)
    req := httptest.NewRequest("GET", "/auth/github", nil)
    rec := httptest.NewRecorder()

    handler.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusFound, rec.Code)
    location := rec.Header().Get("Location")
    assert.Contains(t, location, "github.com/login/oauth/authorize")
    assert.Contains(t, location, "state=")
}

func TestOAuth_CallbackValidatesState(t *testing.T) {
    // Test Doc:
    // - Why: CSRF protection via state parameter
    // - Contract: Invalid state → 400 Bad Request

    handler := NewOAuthHandler(fakeConfig, fakeStateStore)
    req := httptest.NewRequest("GET", "/auth/callback?code=xxx&state=invalid", nil)
    rec := httptest.NewRecorder()

    handler.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusBadRequest, rec.Code)
}
```

### Non-Happy-Path Coverage
- [ ] Invalid state parameter → 400 error
- [ ] Expired state (>10 min) → 400 error
- [ ] GitHub API error → 502 error with message
- [ ] User not in allowlist → 403 error

### Acceptance Criteria
- [ ] All tests passing (15+ tests)
- [ ] OAuth flow works end-to-end with FakeOAuthProvider
- [ ] httpOnly cookies set correctly
- [ ] State parameter protects against CSRF

---

### Phase 3: User Allowlist with Hot Reload

**Objective**: Implement username allowlist with file-based storage and hot reload.

**Deliverables**:
- Allowlist manager with RWMutex
- File watcher for hot reload
- XDG-compliant path (`~/.config/trex/allowed_users.json`)
- Graceful degradation on file errors

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition on reload | Medium | High | Atomic RWMutex swap (R-09) |
| File parse error | Low | Medium | Keep old list on parse failure |
| File not found | Low | Low | Start with empty list, log warning |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for allowlist loading | 2 | Tests: load, parse, isAllowed | - | |
| 3.2 | [ ] | Write tests for hot reload | 2 | Tests: file change triggers reload | - | |
| 3.3 | [ ] | Write tests for graceful degradation | 2 | Tests: parse error keeps old list | - | |
| 3.4 | [ ] | Implement AllowlistManager | 2 | Load, IsAllowed, Reload methods | - | `internal/auth/allowlist.go` |
| 3.5 | [ ] | Add fsnotify file watcher | 2 | File changes trigger Reload() | - | |
| 3.6 | [ ] | Integrate with auth handlers | 1 | Callback checks allowlist | - | |

### Test Examples (Write First!)

```go
func TestAllowlist_IsAllowed(t *testing.T) {
    // Test Doc:
    // - Why: Core authorization logic
    // - Contract: Username in list → allowed, not in list → denied

    al := NewAllowlistManager()
    al.SetUsers([]string{"alice", "bob"})

    assert.True(t, al.IsAllowed("alice"))
    assert.True(t, al.IsAllowed("bob"))
    assert.False(t, al.IsAllowed("charlie"))
}

func TestAllowlist_HotReload(t *testing.T) {
    // Test Doc:
    // - Why: Admin can add/remove users without restart
    // - Contract: File change → users list updates atomically

    tmpFile := createTempAllowlist(t, []string{"alice"})
    al, _ := NewAllowlistFromFile(tmpFile)

    assert.True(t, al.IsAllowed("alice"))
    assert.False(t, al.IsAllowed("bob"))

    // Simulate file update
    updateAllowlist(t, tmpFile, []string{"alice", "bob"})
    al.Reload()

    assert.True(t, al.IsAllowed("bob"))
}
```

### Non-Happy-Path Coverage
- [ ] File not found → empty allowlist, log warning
- [ ] Invalid JSON → keep old list, log error
- [ ] Concurrent read during reload → no race condition

### Acceptance Criteria
- [ ] All tests passing
- [ ] Allowlist loads from XDG path
- [ ] Hot reload works without restart
- [ ] Parse errors don't crash server

---

### Phase 4: Auth Middleware & JWT

**Objective**: Create centralized authentication middleware for all protected endpoints.

**Deliverables**:
- JWT validation middleware
- User context injection
- Protected route wrapper
- Token expiration handling

**Dependencies**: Phase 2, 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Inconsistent auth checks | Medium | High | Single middleware for all routes (R-06) |
| Token validation bypass | Low | Critical | Fail-closed design |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Create FakeJWT generator | 2 | Predictable tokens for tests | - | |
| 4.2 | [ ] | Write tests for JWT validation | 3 | Tests: valid, expired, tampered, missing | - | |
| 4.3 | [ ] | Write tests for middleware | 2 | Tests: protected vs public routes | - | |
| 4.4 | [ ] | Implement JWT service | 3 | Sign, validate, extract claims | - | `internal/auth/jwt.go` |
| 4.5 | [ ] | Implement auth middleware | 2 | Wrap routes, inject user context | - | |
| 4.6 | [ ] | Apply middleware to routes | 2 | /api/sessions protected, /auth/* public | - | |
| 4.7 | [ ] | Add Owner field to Session struct | 1 | Session.Owner tracks creator | - | |
| 4.8 | [ ] | Add ListByOwner to registry | 2 | Filter sessions by username | - | Per I-04 |

### Test Examples (Write First!)

```go
func TestMiddleware_RejectsInvalidToken(t *testing.T) {
    // Test Doc:
    // - Why: Security - prevent unauthorized access
    // - Contract: Invalid/missing token → 401 Unauthorized

    middleware := AuthMiddleware(true)
    handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    req := httptest.NewRequest("GET", "/api/sessions", nil)
    rec := httptest.NewRecorder()

    handler.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_PassesWhenAuthDisabled(t *testing.T) {
    // Test Doc:
    // - Why: Feature flag controls auth enforcement
    // - Contract: Auth disabled → all requests pass

    middleware := AuthMiddleware(false)
    handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    req := httptest.NewRequest("GET", "/api/sessions", nil)
    rec := httptest.NewRecorder()

    handler.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusOK, rec.Code)
}
```

### Non-Happy-Path Coverage
- [ ] Expired token → 401 with "token expired" message
- [ ] Tampered token → 401 with "invalid token" message
- [ ] Missing Authorization header → 401
- [ ] Invalid bearer format → 401

### Acceptance Criteria
- [ ] All tests passing
- [ ] Middleware applied to all protected routes
- [ ] Public routes (/auth/*, /api/health) accessible without token
- [ ] User context available in request

---

### Phase 5: WebSocket Authentication

**Objective**: Secure WebSocket upgrade with JWT validation and session isolation.

**Deliverables**:
- JWT validation in handleTerminal
- User context in connectionHandler
- Session ownership enforcement
- Conditional CheckOrigin

**Dependencies**: Phase 4 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebSocket bypass | Medium | Critical | Validate before upgrade (R-01) |
| Session access across users | Medium | High | Filter by owner (R-03) |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for WebSocket auth | 3 | Tests: valid token upgrades, invalid rejected | - | |
| 5.2 | [ ] | Write tests for session isolation | 3 | Tests: user A can't see user B's sessions | - | |
| 5.3 | [ ] | Add authUser to connectionHandler | 1 | Field stores authenticated username | - | Per I-01 |
| 5.4 | [ ] | Implement conditional CheckOrigin | 2 | Strict when auth enabled | - | Per R-01 |
| 5.5 | [ ] | Validate JWT before WebSocket upgrade | 2 | Extract from cookie/header | - | |
| 5.6 | [ ] | Set session Owner on create | 1 | handleCreate sets session.Owner | - | |
| 5.7 | [ ] | Filter sessions by authUser | 2 | Messages only route to owned sessions | - | Per R-03 |
| 5.8 | [ ] | Update /api/sessions to filter | 1 | REST endpoint respects ownership | - | |

### Test Examples (Write First!)

```go
func TestWebSocket_RejectsWithoutAuth(t *testing.T) {
    // Test Doc:
    // - Why: WebSocket must be protected like REST endpoints
    // - Contract: No token → upgrade rejected with 401

    srv := httptest.NewServer(server.New(authEnabledConfig))
    defer srv.Close()

    wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
    _, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)

    assert.Error(t, err)
    assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestWebSocket_SessionIsolation(t *testing.T) {
    // Test Doc:
    // - Why: Users must only access their own sessions
    // - Contract: User A can't send to User B's session

    connA := connectAsUser(t, "alice")
    connB := connectAsUser(t, "bob")

    // Alice creates session
    sessionID := createSession(t, connA)

    // Bob tries to send to Alice's session
    err := sendInput(connB, sessionID, "echo hello")

    assert.Error(t, err)
    assert.Contains(t, err.Error(), "access denied")
}
```

### Non-Happy-Path Coverage
- [ ] Missing token in upgrade request → 401
- [ ] Expired token → 401
- [ ] Valid token, user not in allowlist → 403
- [ ] Access other user's session → error message

### Acceptance Criteria
- [ ] All tests passing
- [ ] WebSocket requires valid token when auth enabled
- [ ] Each user only sees their own sessions
- [ ] Session creation records owner

---

### Phase 6: Frontend Auth Store & UI

**Objective**: Create frontend authentication state management and login UI.

**Deliverables**:
- useAuthStore with selectors
- Login/logout UI components
- Token refresh mechanism
- WebSocket token injection

**Dependencies**: Phase 2-5 complete (backend ready)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token exposure to XSS | Low | Critical | Don't store in localStorage (R-04) |
| Flash of login screen | Medium | Low | Check auth status on mount |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Write tests for useAuthStore | 2 | Tests: setUser, logout, token selectors | - | |
| 6.2 | [ ] | Write tests for token refresh | 2 | Tests: refresh before expiry | - | |
| 6.3 | [ ] | Create useAuthStore | 2 | State + actions, NO persistence for tokens | - | Per I-05 |
| 6.4 | [ ] | Create LoginButton component | 2 | Redirects to /auth/github | - | |
| 6.5 | [ ] | Create UserMenu component | 2 | Shows username, avatar, logout | - | |
| 6.6 | [ ] | Implement silent token refresh | 3 | Refresh before expiry | - | Per R-08 |
| 6.7 | [ ] | Modify useCentralWebSocket | 2 | Include token in connection | - | Per I-03 |
| 6.8 | [ ] | Add auth check on app mount | 2 | Check /api/auth/enabled, show login if needed | - | |
| 6.9 | [ ] | Handle logout flow | 1 | Clear state, disconnect WebSocket | - | |

### Test Examples (Write First!)

```typescript
describe('useAuthStore', () => {
    it('should store user info after login', () => {
        /**
         * Test Doc:
         * - Why: User state needed for UI display
         * - Contract: setUser stores username and avatar
         * - Quality Contribution: Ensures user info available after OAuth
         */
        const { result } = renderHook(() => useAuthStore())

        act(() => {
            result.current.setUser({ username: 'alice', avatarUrl: 'https://...' })
        })

        expect(result.current.user?.username).toBe('alice')
    })

    it('should clear state on logout', () => {
        /**
         * Test Doc:
         * - Why: Security - logout must clear all auth state
         * - Contract: logout() → user=null, token cleared
         */
        const { result } = renderHook(() => useAuthStore())

        act(() => {
            result.current.setUser({ username: 'alice', avatarUrl: 'https://...' })
            result.current.logout()
        })

        expect(result.current.user).toBeNull()
    })
})
```

### Non-Happy-Path Coverage
- [ ] Auth check fails → show login button
- [ ] Refresh fails → prompt re-login
- [ ] WebSocket disconnects on logout

### Acceptance Criteria
- [ ] All tests passing
- [ ] Login redirects to GitHub OAuth
- [ ] User info displayed after login
- [ ] Token refreshes silently
- [ ] Logout clears state and disconnects

---

### Phase 7: Documentation

**Objective**: Create user-facing documentation for OAuth setup and troubleshooting.

**Deliverables**:
- README.md auth section (quick start)
- `docs/how/authentication.md` (detailed flow)
- `docs/how/oauth-setup.md` (GitHub app creation)
- `docs/how/troubleshooting-auth.md` (common issues)

**Dependencies**: All implementation phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Docs out of sync | Medium | Medium | Update docs with code changes |
| Unclear setup steps | Low | Medium | Test on fresh install |

### Discovery & Placement Decision

**Existing docs/how/ structure**: Check during implementation

**Decision**: Create new `docs/how/` files per Documentation Strategy in spec

### Tasks (Lightweight Approach for Documentation)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 7.1 | [ ] | Survey existing docs/how/ | 1 | Document existing structure | - | |
| 7.2 | [ ] | Update README.md | 2 | Auth quick-start section added | - | |
| 7.3 | [ ] | Create docs/how/authentication.md | 2 | OAuth flow, security model documented | - | |
| 7.4 | [ ] | Create docs/how/oauth-setup.md | 2 | Step-by-step GitHub app creation | - | |
| 7.5 | [ ] | Create docs/how/troubleshooting-auth.md | 2 | Common issues + solutions | - | |
| 7.6 | [ ] | Test setup on fresh environment | 1 | Docs work end-to-end | - | |

### Content Outlines

**README.md section**:
- Enable authentication (set TREX_AUTH_ENABLED=true)
- Configure GitHub OAuth App
- Set environment variables
- Configure allowlist

**docs/how/authentication.md**:
- OAuth 2.0 flow diagram
- JWT token lifecycle
- Session isolation model
- Security considerations

**docs/how/oauth-setup.md**:
- Create GitHub OAuth App
- Configure redirect URL
- Copy Client ID and Secret
- Set environment variables

**docs/how/troubleshooting-auth.md**:
- "Access Denied" - check allowlist
- "Invalid state" - try again (CSRF protection)
- "Token expired" - refresh or re-login
- Rollback procedure

### Acceptance Criteria
- [ ] README updated with quick-start
- [ ] All docs/how/ files complete
- [ ] Instructions tested on fresh install
- [ ] Screenshots where helpful

---

## Cross-Cutting Concerns

### Security Considerations

| Concern | Implementation |
|---------|----------------|
| CSRF Protection | State parameter in OAuth, SameSite cookies |
| XSS Prevention | httpOnly cookies, no localStorage tokens |
| Token Security | Short-lived access, refresh tokens, Secure flag |
| Origin Validation | Conditional CheckOrigin when auth enabled |
| Session Isolation | Owner field, filter by user |

### Observability

| Metric | Location |
|--------|----------|
| OAuth login success/failure | `/auth/callback` handler |
| Token refresh count | `/auth/refresh` handler |
| Auth middleware rejections | Middleware (401 count) |
| WebSocket auth failures | handleTerminal |

### Feature Flag Behavior

| TREX_AUTH_ENABLED | Behavior |
|-------------------|----------|
| false (default) | Localhost binding, all endpoints open, no auth UI |
| true | Network binding, all protected endpoints require JWT, login UI shown |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| OAuth Routes | 3 | Medium | S=1,I=2,D=0,N=1,F=2,T=1 | External GitHub API, security-critical | FakeOAuthProvider for testing |
| WebSocket Auth | 3 | Medium | S=1,I=1,D=1,N=1,F=2,T=1 | Session isolation adds complexity | Strict TDD, ownership validation |
| Allowlist Hot Reload | 2 | Small | S=1,I=0,D=1,N=1,F=1,T=1 | File watcher adds infrastructure | fsnotify well-maintained |
| Frontend Auth Store | 2 | Small | S=1,I=0,D=1,N=0,F=1,T=1 | Follows existing Zustand patterns | Reuse settings.ts pattern |
| **Overall Feature** | 4 | Large | Sum=9 | Multi-component, external service, security | Feature flag, phased rollout, fakes |

**CS-4 Requirements Met**:
- [x] Feature flag: `TREX_AUTH_ENABLED`
- [x] Rollback plan: Set flag false, restart
- [x] ADR consideration: Seed ADRs for token storage, Electron OAuth

---

## Progress Tracking

### Phase Completion Checklist

- [ ] Phase 1: Configuration & Environment - Not Started
- [ ] Phase 2: Backend OAuth Routes - Not Started
- [ ] Phase 3: User Allowlist with Hot Reload - Not Started
- [ ] Phase 4: Auth Middleware & JWT - Not Started
- [ ] Phase 5: WebSocket Authentication - Not Started
- [ ] Phase 6: Frontend Auth Store & UI - Not Started
- [ ] Phase 7: Documentation - Not Started

### STOP Rule

**IMPORTANT**: This plan must be validated before creating phase tasks.

1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

**Plan Complete**: 2026-02-09
**Next Step**: Run `/plan-4-complete-the-plan` to validate readiness
