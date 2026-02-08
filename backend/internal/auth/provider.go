package auth

// OAuthProvider abstracts the GitHub OAuth flow for testability.
// Production uses RealGitHubProvider; tests use FakeOAuthProvider.
type OAuthProvider interface {
	// AuthURL returns the URL to redirect users to for authorization.
	AuthURL(state string) string

	// Exchange trades an authorization code for user info.
	// Returns the GitHub username and avatar URL on success.
	Exchange(code string) (*GitHubUser, error)
}

// GitHubUser represents authenticated user info from GitHub.
type GitHubUser struct {
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
}
