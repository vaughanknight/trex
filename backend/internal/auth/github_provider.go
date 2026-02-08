package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// RealGitHubProvider implements OAuthProvider using real GitHub OAuth APIs.
type RealGitHubProvider struct {
	clientID     string
	clientSecret string
	callbackURL  string
}

// NewRealGitHubProvider creates a provider for real GitHub OAuth.
func NewRealGitHubProvider(clientID, clientSecret, callbackURL string) *RealGitHubProvider {
	return &RealGitHubProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		callbackURL:  callbackURL,
	}
}

func (p *RealGitHubProvider) AuthURL(state string) string {
	params := url.Values{
		"client_id":    {p.clientID},
		"redirect_uri": {p.callbackURL},
		"state":        {state},
		"scope":        {"read:user"},
	}
	return "https://github.com/login/oauth/authorize?" + params.Encode()
}

func (p *RealGitHubProvider) Exchange(code string) (*GitHubUser, error) {
	// Exchange code for access token
	data := url.Values{
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
		"code":          {code},
	}

	req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("creating token request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("exchanging code: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return nil, fmt.Errorf("decoding token response: %w", err)
	}
	if tokenResp.Error != "" {
		return nil, fmt.Errorf("github oauth error: %s", tokenResp.Error)
	}

	// Fetch user info
	userReq, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return nil, fmt.Errorf("creating user request: %w", err)
	}
	userReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
	userReq.Header.Set("Accept", "application/json")

	userResp, err := http.DefaultClient.Do(userReq)
	if err != nil {
		return nil, fmt.Errorf("fetching user info: %w", err)
	}
	defer userResp.Body.Close()

	if userResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(userResp.Body)
		return nil, fmt.Errorf("github user API error: %s (status %d)", string(body), userResp.StatusCode)
	}

	var ghUser struct {
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&ghUser); err != nil {
		return nil, fmt.Errorf("decoding user info: %w", err)
	}

	return &GitHubUser{
		Username:  ghUser.Login,
		AvatarURL: ghUser.AvatarURL,
	}, nil
}
