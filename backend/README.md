# SAJ Backend

Deno Deploy backend for SAJ. Handles GitHub OAuth and proxies Anthropic API calls.

## Setup

### 1. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - Application name: `SAJ`
   - Homepage URL: `https://saj.deno.dev` (or your domain)
   - Authorization callback URL: `https://saj.deno.dev/auth/callback`
4. Save Client ID and generate Client Secret

### 2. Deploy to Deno Deploy

```bash
# Install deployctl
deno install -Arf jsr:@deno/deployctl

# Deploy
cd backend
deployctl deploy --project=saj --entrypoint=main.ts
```

### 3. Set Environment Variables

In Deno Deploy dashboard, set:

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
ANTHROPIC_API_KEY=your_anthropic_key
JWT_SECRET=random_secure_string
RATE_LIMIT=100
```

## Local Development

```bash
# Create .env file
cat > .env << EOF
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
ANTHROPIC_API_KEY=your_anthropic_key
JWT_SECRET=dev_secret
RATE_LIMIT=100
EOF

# Run
deno task dev
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/auth/github` | GET | Start GitHub OAuth |
| `/auth/callback` | GET | OAuth callback |
| `/auth/token` | POST | Exchange code for token |
| `/me` | GET | Get current user |
| `/v1/messages` | POST | Proxy to Anthropic |
| `/usage` | GET | Get usage stats |

## CLI Usage

```bash
# Login via browser
saj login

# Or set token directly
saj login <token>

# Check status
saj whoami

# View usage
saj usage

# Logout
saj logout
```

## Architecture

```
User → CLI → Backend → Anthropic
              ↓
         Deno KV (users, sessions, rate limits)
```

- GitHub OAuth for authentication
- JWT tokens for sessions (30 day expiry)
- Rate limiting: 100 requests/hour per user
- Usage tracking per user per month
