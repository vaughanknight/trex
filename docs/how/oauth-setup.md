# GitHub OAuth App Setup

Step-by-step guide to configure GitHub OAuth for trex.

## 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** > **New OAuth App**
3. Fill in:
   - **Application name**: `trex` (or any name)
   - **Homepage URL**: `http://localhost:3000` (or your server URL)
   - **Authorization callback URL**: `http://localhost:3000/auth/callback`
4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret** and copy it

## 2. Set Environment Variables

```bash
# Required
export TREX_AUTH_ENABLED=true
export TREX_GITHUB_CLIENT_ID=Ov23li...        # From step 1
export TREX_GITHUB_CLIENT_SECRET=abc123...     # From step 1
export TREX_GITHUB_CALLBACK_URL=http://localhost:3000/auth/callback

# Required: secret key for signing JWT tokens
export TREX_JWT_SECRET=$(openssl rand -hex 32)

# Optional: custom bind address (defaults to 0.0.0.0:3000 when auth enabled)
export TREX_BIND_ADDRESS=0.0.0.0:3000
```

## 3. Configure Allowlist

Create `~/.config/trex/allowed_users.json`:

```json
{
  "version": 1,
  "users": ["your-github-username", "collaborator-username"]
}
```

Usernames are case-insensitive. The file is watched for changes — edits take effect immediately without restarting trex.

To use a custom path:

```bash
export TREX_ALLOWLIST_PATH=/path/to/allowed_users.json
```

## 4. Start trex

```bash
./dist/trex
```

You should see:

```
trex server starting on 0.0.0.0:3000 (auth: enabled)
```

## 5. Access trex

Open `http://localhost:3000` in your browser. Click **Login with GitHub** in the sidebar to authenticate.

## Remote Access

For remote access from another machine:

1. Set the callback URL to your server's address:
   ```bash
   export TREX_GITHUB_CALLBACK_URL=http://your-server:3000/auth/callback
   ```
2. Update the OAuth App's callback URL in GitHub settings to match
3. Ensure port 3000 is accessible on your network

For HTTPS (recommended for remote access), use a reverse proxy (nginx, Caddy) in front of trex.
