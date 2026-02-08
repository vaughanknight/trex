package auth

import "fmt"

// FakeOAuthProvider simulates GitHub OAuth for testing.
// Configure AllowedCodes to control which authorization codes succeed.
type FakeOAuthProvider struct {
	// AllowedCodes maps authorization codes to the user they resolve to.
	AllowedCodes map[string]*GitHubUser
	// AuthBaseURL is the fake authorization URL prefix.
	AuthBaseURL string
}

// NewFakeOAuthProvider creates a FakeOAuthProvider with sensible defaults.
func NewFakeOAuthProvider() *FakeOAuthProvider {
	return &FakeOAuthProvider{
		AllowedCodes: map[string]*GitHubUser{
			"valid-code": {Username: "testuser", AvatarURL: "https://github.com/testuser.png"},
		},
		AuthBaseURL: "https://fake-github.com/login/oauth/authorize",
	}
}

func (f *FakeOAuthProvider) AuthURL(state string) string {
	return fmt.Sprintf("%s?client_id=fake&state=%s", f.AuthBaseURL, state)
}

func (f *FakeOAuthProvider) Exchange(code string) (*GitHubUser, error) {
	user, ok := f.AllowedCodes[code]
	if !ok {
		return nil, fmt.Errorf("invalid authorization code: %s", code)
	}
	return user, nil
}
