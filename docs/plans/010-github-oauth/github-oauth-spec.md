# GitHub OAuth Support for Secure Remote Access

**Version**: 1.0.0
**Created**: 2026-02-09
**Status**: DRAFT

📚 This specification incorporates findings from `research-dossier.md`

⚠️ **Unresolved Research Opportunities**
The following external research topics were identified in research-dossier.md but not addressed:
- GitHub OAuth Best Practices 2026: Current security standards for OAuth 2.0/PKCE
- Electron OAuth Patterns: How Electron apps handle OAuth callbacks
Consider running `/deepresearch` prompts before finalizing architecture.

---

## Research Context

**Components affected**:
- Backend: server.go (routes), new auth package, terminal.go (WebSocket upgrade)
- Frontend: new useAuthStore, useCentralWebSocket.ts (add token), new Login UI components

**Critical dependencies**:
- GitHub OAuth API (external service)
- golang.org/x/oauth2 and jwt libraries (new dependencies)

**Modification risks**:
- WebSocket upgrader CheckOrigin function (currently accepts all origins)
- Server binding address (hardcoded to 127.0.0.1)
- Constitution amendment required (v1 says "localhost-only, no auth")

**Link**: See `research-dossier.md` for full 68-finding analysis from 7 parallel research subagents.

---

## Summary

**WHAT**: Add GitHub OAuth authentication to trex so users can securely access terminal sessions remotely. An allowlist of GitHub usernames controls who can connect.

**WHY**: Enable secure multi-user access to terminal sessions on shared/remote machines. Currently trex only works on localhost with no authentication - adding GitHub OAuth enables:
1. Remote access from any machine
2. Secure identity verification via GitHub
3. Fine-grained access control via username allowlist
4. Session ownership tracking (who created which terminal)

---

## Goals

1. **Secure Remote Access**: Users can access trex from any network location, not just localhost
2. **GitHub Identity**: Users authenticate using their existing GitHub accounts (no new passwords)
3. **Allowlist Control**: Machine owner defines which GitHub usernames can access the system
4. **Session Ownership**: Each terminal session is associated with the user who created it
5. **Seamless UX**: Login flow feels native; minimal friction to start using terminals
6. **Both Distributions**: Works in both Web and Electron modes

---

## Non-Goals

1. **Multi-tenant**: This is NOT about running trex as a shared service with isolated tenant data
2. **Role-based Access Control**: All allowed users have equal permissions (no admin/user distinction)
3. **OAuth Providers Beyond GitHub**: Only GitHub OAuth in this feature; other providers are future work
4. **Session Sharing**: Users cannot share their terminal sessions with other users
5. **Audit Logging**: Detailed access logs are out of scope (future enhancement)
6. **Two-Factor Authentication**: We rely on GitHub's 2FA; we don't add our own 2FA layer

---

## Complexity

**Score**: CS-4 (Large)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| **S**urface Area | 2 | Many files: backend auth routes, middleware, frontend stores, UI components |
| **I**ntegration Breadth | 2 | External: GitHub OAuth API, new Go/JWT libraries |
| **D**ata & State | 1 | New auth state in frontend, user context in backend (no DB migration) |
| **N**ovelty & Ambiguity | 1 | OAuth is well-known, but Electron flow has some discovery needed |
| **F**unctional Constraints | 2 | Security-critical: token handling, CSRF protection, session management |
| **T**esting & Rollout | 1 | Integration tests with real GitHub, FakeOAuth for unit tests |

**Total**: 9 points → **CS-4**

**Confidence**: 0.85 (high confidence from research dossier findings)

**Assumptions**:
- GitHub OAuth App creation is done manually by machine owner
- Environment variables are the configuration mechanism
- JWT tokens are used for session management after OAuth
- httpOnly cookies preferred over localStorage for tokens

**Dependencies**:
- GitHub OAuth App (must be created in GitHub settings)
- Network-accessible server (for OAuth callbacks from GitHub)
- Constitution amendment (current v1 says localhost-only)

**Risks**:
- Security vulnerabilities in token handling
- Electron OAuth callback handling complexity
- Rate limiting from GitHub API

**Phases** (required for CS-4):
1. Constitution amendment + environment config
2. Backend OAuth routes + allowlist
3. Auth middleware + JWT validation
4. WebSocket authentication
5. Frontend auth store + login UI
6. Testing + security review
7. Documentation + rollout guide

**Feature Flags** (required for CS-4):
- `TREX_AUTH_ENABLED`: Toggle entire auth system on/off
- Allows gradual rollout and quick disable if issues found

**Rollback Plan** (required for CS-4):
1. Set `TREX_AUTH_ENABLED=false`
2. Restart trex server
3. System reverts to localhost-only behavior

---

## Acceptance Criteria

### AC-01: GitHub OAuth Login Flow
**Given** an unauthenticated user visits trex
**When** they click "Login with GitHub"
**Then** they are redirected to GitHub's authorization page
**And** after approving, they are redirected back and logged in

### AC-02: Allowlist Enforcement
**Given** a user authenticates via GitHub OAuth
**When** their GitHub username is NOT in the allowlist
**Then** they see an "Access Denied" message
**And** they cannot access any terminal functionality

### AC-03: Allowed User Access
**Given** a user authenticates via GitHub OAuth
**When** their GitHub username IS in the allowlist
**Then** they can create, view, and manage terminal sessions
**And** the UI shows their GitHub username/avatar

### AC-04: WebSocket Authentication
**Given** an authenticated user
**When** the frontend establishes a WebSocket connection
**Then** the JWT token is validated before upgrade
**And** unauthenticated WebSocket attempts are rejected

### AC-05: Session Ownership
**Given** an authenticated user creates terminal sessions
**When** viewing the session list
**Then** sessions show which user created them
**And** users can only close their own sessions [NEEDS CLARIFICATION: or can all users close any session?]

### AC-06: Logout Flow
**Given** an authenticated user
**When** they click "Logout"
**Then** their session is cleared
**And** they are returned to the login screen
**And** their WebSocket connection is closed

### AC-07: Token Expiration
**Given** an authenticated user with an expired token
**When** they attempt any action
**Then** they are prompted to re-authenticate
**And** no terminal operations succeed until re-authenticated

### AC-08: Web Mode OAuth
**Given** a user running trex in Web mode (browser)
**When** they complete OAuth flow
**Then** the callback URL works correctly
**And** the token is stored securely (httpOnly cookie preferred)

### AC-09: Electron Mode OAuth
**Given** a user running trex in Electron mode
**When** they click "Login with GitHub"
**Then** the system browser opens for OAuth
**And** callback returns focus to Electron app
**And** authentication completes successfully

### AC-10: Remote Access Works
**Given** trex is configured with `TREX_BIND_ADDRESS=0.0.0.0:3000`
**When** a user accesses trex from another machine
**Then** OAuth flow works correctly with the configured callback URL
**And** WebSocket connections work over the network

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token theft/hijacking | Medium | High | httpOnly cookies, short expiry, secure flag |
| CSRF attacks | Medium | High | State parameter in OAuth flow, SameSite cookies |
| GitHub API rate limiting | Low | Medium | Cache user info, exponential backoff |
| Electron OAuth complexity | Medium | Medium | Research patterns before implementation |
| Allowlist management difficulty | Low | Low | Document clear configuration process |

### Assumptions

1. Machine owner can create GitHub OAuth Apps
2. Server can be made network-accessible (for OAuth callbacks)
3. Users have GitHub accounts
4. Environment variable configuration is acceptable
5. Single allowlist for all users (no per-session permissions)

---

## Open Questions

1. **Session ownership enforcement**: Can users close other users' sessions, or only their own?

2. **Token storage mechanism**: httpOnly cookies vs localStorage - which is better for this use case? [NEEDS CLARIFICATION: Research opportunity identified]

3. **Token refresh**: Should we implement refresh tokens for long-lived sessions, or require periodic re-authentication?

4. **Electron callback handling**: What's the best pattern - deep links, local HTTP server, or custom protocol? [NEEDS CLARIFICATION: Research opportunity identified]

5. **Allowlist storage**: Environment variable (comma-separated) vs config file? What about dynamic updates without restart?

6. **Health endpoint**: Should `/api/health` require authentication or remain public for monitoring?

---

## ADR Seeds (Optional)

### ADR Seed 1: OAuth Token Storage Mechanism

**Decision Drivers**:
- Security: Protection against XSS and CSRF
- Compatibility: Works in both Web and Electron modes
- UX: Token persists appropriately (not lost on refresh, cleared on logout)

**Candidate Alternatives**:
- A: httpOnly cookies (server sets, browser sends automatically)
- B: localStorage with Bearer header (frontend manages)
- C: sessionStorage with Bearer header (cleared on tab close)

**Stakeholders**: Security-conscious users, developers

### ADR Seed 2: Electron OAuth Flow

**Decision Drivers**:
- Security: No token exposure to malicious apps
- UX: Seamless return to Electron after browser OAuth
- Platform: Works on macOS, Windows, Linux

**Candidate Alternatives**:
- A: Custom URL scheme deep link (trex://callback)
- B: Local HTTP server for callback (localhost:PORT)
- C: Polling-based (Electron polls for completion)

**Stakeholders**: Electron users, cross-platform users

---

## Unresolved Research

**Topics**:
1. GitHub OAuth Best Practices 2026: PKCE requirements, token storage recommendations, security headers
2. Electron OAuth Patterns: Deep links vs local server, cross-platform compatibility

**Impact**: These unknowns affect ADR decisions for token storage and Electron flow. Implementation may need adjustment based on findings.

**Recommendation**: Consider running `/deepresearch` prompts from research-dossier.md before finalizing architecture in plan-3 phase.

---

## Related Documents

- Research Dossier: `docs/plans/010-github-oauth/research-dossier.md`
- GitHub Issue: #28
- Feature Branch: `feature/010-github-oauth`
- Constitution (to be amended): `docs/project-rules/constitution.md`

---

**Next Steps**:
1. Update constitution to support authentication (v1.3.0)
2. Run `/plan-2-clarify` for ≤5 high-impact questions
3. Optionally run `/deepresearch` for unresolved research topics
4. Run `/plan-3-architect` to create implementation plan
