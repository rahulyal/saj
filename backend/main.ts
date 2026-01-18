/**
 * SAJ Backend - Deno Deploy
 *
 * Handles GitHub OAuth and proxies Anthropic API calls.
 * Users authenticate via GitHub, then use SAJ CLI with your API key.
 */

import { Hono, type Context } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { sign, verify } from "@hono/hono/jwt";

// =============================================================================
// Config
// =============================================================================

const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID")!;
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "change-me-in-production";

// Rate limiting: requests per hour per user
const RATE_LIMIT = parseInt(Deno.env.get("RATE_LIMIT") || "100");

// Billing: monthly free tier in dollars (configurable via env)
const MONTHLY_FREE_LIMIT = parseFloat(
  Deno.env.get("MONTHLY_FREE_LIMIT") || "10",
);

// Model pricing (per token)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-opus-4-20250514": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
};
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// =============================================================================
// KV Store
// =============================================================================

const kv = await Deno.openKv();

interface User {
  id: string;
  githubId: number;
  username: string;
  email: string | null;
  avatarUrl: string;
  createdAt: string;
  lastLoginAt: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// =============================================================================
// Helpers
// =============================================================================

async function getUser(userId: string): Promise<User | null> {
  const result = await kv.get<User>(["users", userId]);
  return result.value;
}

async function createOrUpdateUser(githubUser: {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}): Promise<User> {
  const existingByGithub = await kv.get<string>([
    "github_to_user",
    githubUser.id,
  ]);

  let user: User;
  const now = new Date().toISOString();

  if (existingByGithub.value) {
    // Update existing user
    const existing = await getUser(existingByGithub.value);
    if (existing) {
      user = {
        ...existing,
        username: githubUser.login,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
        lastLoginAt: now,
      };
    } else {
      // Orphaned mapping, create new
      user = {
        id: crypto.randomUUID(),
        githubId: githubUser.id,
        username: githubUser.login,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
        createdAt: now,
        lastLoginAt: now,
      };
    }
  } else {
    // New user
    user = {
      id: crypto.randomUUID(),
      githubId: githubUser.id,
      username: githubUser.login,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
      createdAt: now,
      lastLoginAt: now,
    };
  }

  // Save user and mapping
  await kv.set(["users", user.id], user);
  await kv.set(["github_to_user", githubUser.id], user.id);

  return user;
}

async function checkRateLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const hourFromNow = now + 60 * 60 * 1000;

  const result = await kv.get<RateLimitEntry>(["rate_limit", userId]);

  if (!result.value || result.value.resetAt < now) {
    // New window
    await kv.set(["rate_limit", userId], { count: 1, resetAt: hourFromNow });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt: hourFromNow };
  }

  if (result.value.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: result.value.resetAt };
  }

  // Increment
  const newEntry = {
    count: result.value.count + 1,
    resetAt: result.value.resetAt,
  };
  await kv.set(["rate_limit", userId], newEntry);

  return {
    allowed: true,
    remaining: RATE_LIMIT - newEntry.count,
    resetAt: newEntry.resetAt,
  };
}

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = DEFAULT_MODEL,
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

interface UsageData {
  input: number;
  output: number;
  requests: number;
  cost: number;
}

async function getMonthlyUsage(userId: string): Promise<UsageData> {
  const now = new Date().toISOString();
  const monthKey = now.slice(0, 7); // YYYY-MM
  const result = await kv.get<UsageData>(["usage", userId, monthKey]);
  const data = result.value || { input: 0, output: 0, requests: 0, cost: 0 };
  // Migrate old data without cost field (handles null and undefined)
  if (data.cost == null) {
    data.cost = calculateCost(data.input, data.output);
  }
  return data;
}

async function checkBudget(
  userId: string,
): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}> {
  const usage = await getMonthlyUsage(userId);
  const remaining = Math.max(0, MONTHLY_FREE_LIMIT - usage.cost);
  return {
    allowed: usage.cost < MONTHLY_FREE_LIMIT,
    used: usage.cost,
    limit: MONTHLY_FREE_LIMIT,
    remaining,
  };
}

async function logUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  model: string = DEFAULT_MODEL,
): Promise<void> {
  const now = new Date().toISOString();
  const monthKey = now.slice(0, 7); // YYYY-MM

  const result = await kv.get<UsageData>(["usage", userId, monthKey]);
  const usage = result.value || { input: 0, output: 0, requests: 0, cost: 0 };

  const callCost = calculateCost(inputTokens, outputTokens, model);

  await kv.set(["usage", userId, monthKey], {
    input: usage.input + inputTokens,
    output: usage.output + outputTokens,
    requests: usage.requests + 1,
    cost: usage.cost + callCost,
  });
}

// =============================================================================
// App
// =============================================================================

const app = new Hono();

// CORS for CLI
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Health check
app.get("/", (c: Context) => c.json({ status: "ok", service: "saj-backend" }));

// CLI source - redirect to jsDelivr (better cache invalidation than GitHub raw)
app.get("/cli.ts", (c: Context) => {
  return c.redirect("https://cdn.jsdelivr.net/gh/rahulyal/saj@main/saj.ts");
});

// Install script
app.get("/install.sh", (c: Context) => {
  const script = `#!/bin/bash
set -e

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[0;33m'
MAGENTA='\\033[0;35m'
DIM='\\033[2m'
BOLD='\\033[1m'
NC='\\033[0m'

echo -e "\${MAGENTA}"
echo "      ██╗"
echo "     ██╔╝    \${NC}\${BOLD}saj\${NC}\${MAGENTA}"
echo "    ██╔╝     \${NC}\${DIM}self-programming agent\${NC}\${MAGENTA}"
echo "   ██╔╝"
echo "  ███╔╝"
echo " ██╔██╗"
echo "██╔╝ ██╗"
echo "╚═╝  ╚═╝"
echo -e "\${NC}"

# Check for Deno
if ! command -v deno &> /dev/null; then
    echo -e "\${YELLOW}Deno not found. Installing...\${NC}"
    curl -fsSL https://deno.land/install.sh | sh

    # Add to PATH for this session
    export DENO_INSTALL="$HOME/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"

    echo -e "\${GREEN}✓ Deno installed\${NC}"
fi

echo -e "\${DIM}Installing saj...\${NC}"

# Get latest commit hash to bypass CDN cache
SHA=$(curl -s https://api.github.com/repos/rahulyal/saj/commits/main | grep '"sha"' | head -1 | cut -d'"' -f4 | cut -c1-7)

# Install saj globally
deno install \\
    --global \\
    --allow-all \\
    --unstable-kv \\
    --name saj \\
    --force \\
    --reload \\
    "https://cdn.jsdelivr.net/gh/rahulyal/saj@\${SHA}/saj.ts"

echo -e "\${GREEN}✓ saj installed\${NC}"

# Create config directory
mkdir -p "$HOME/.saj"

# Check if saj is in PATH
if command -v saj &> /dev/null; then
    echo -e "\${GREEN}✓ Ready to use\${NC}"
    echo ""
    echo -e "  \${BOLD}Get started:\${NC}"
    echo -e "    \${DIM}saj login\${NC}      # Authenticate with GitHub"
    echo -e "    \${DIM}saj\${NC}            # Start chatting"
    echo ""
else
    echo -e "\${YELLOW}Add Deno to your PATH:\${NC}"
    echo ""
    echo -e "  \${DIM}export PATH=\\"\\\$HOME/.deno/bin:\\\$PATH\\"\${NC}"
    echo ""
    echo "Then run: saj login"
fi
`;
  return c.text(script, 200, { "Content-Type": "text/plain" });
});

// =============================================================================
// GitHub OAuth
// =============================================================================

// Step 1: Redirect to GitHub
app.get("/auth/github", (c: Context) => {
  const state = crypto.randomUUID();
  const redirectUri = new URL("/auth/callback", c.req.url).toString();

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);

  return c.redirect(url.toString());
});

// CLI login flow - redirects to local callback
app.get("/auth/github/cli", (c: Context) => {
  const cliCallback = c.req.query("callback");
  if (!cliCallback) {
    return c.json({ error: "Missing callback parameter" }, 400);
  }

  // Store CLI callback in state (we'll parse it in the callback)
  const state = encodeURIComponent(cliCallback);
  const redirectUri = new URL("/auth/callback/cli", c.req.url).toString();

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);

  return c.redirect(url.toString());
});

// CLI callback - redirects code to local CLI server
app.get("/auth/callback/cli", (c: Context) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  const cliCallback = decodeURIComponent(state);
  const redirectUrl = new URL(cliCallback);
  redirectUrl.searchParams.set("code", code);

  return c.redirect(redirectUrl.toString());
});

// Step 2: Handle callback
app.get("/auth/callback", async (c: Context) => {
  const code = c.req.query("code");

  if (!code) {
    return c.json({ error: "Missing code" }, 400);
  }

  // Exchange code for access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    },
  );

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    return c.json({ error: tokenData.error_description }, 400);
  }

  // Get user info from GitHub
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "SAJ-Backend",
    },
  });

  const githubUser = await userResponse.json();

  // Create or update user in our DB
  const user = await createOrUpdateUser(githubUser);

  // Generate JWT
  const token = await sign(
    {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
    },
    JWT_SECRET,
  );

  // Return HTML that the CLI can parse, or redirect
  const html = `
<!DOCTYPE html>
<html>
<head><title>SAJ - Logged In</title></head>
<body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e;">
  <div style="text-align: center; color: white;">
    <h1 style="color: #e94560;">λ</h1>
    <h2>Welcome, ${user.username}!</h2>
    <p style="color: #888;">Copy this token to your CLI:</p>
    <code style="background: #16213e; padding: 12px 24px; border-radius: 8px; display: block; margin: 20px 0; word-break: break-all; color: #0f0;">${token}</code>
    <p style="color: #666; font-size: 14px;">Run: <code>saj login ${token.slice(0, 20)}...</code></p>
    <p style="color: #666; font-size: 14px;">Or set: <code>export SAJ_TOKEN=${token.slice(0, 20)}...</code></p>
  </div>
</body>
</html>
  `;

  return c.html(html);
});

// Get token via POST (for CLI flow)
app.post("/auth/token", async (c: Context) => {
  const { code } = await c.req.json();

  if (!code) {
    return c.json({ error: "Missing code" }, 400);
  }

  // Exchange code for access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    },
  );

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    return c.json({ error: tokenData.error_description }, 400);
  }

  // Get user info
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "SAJ-Backend",
    },
  });

  const githubUser = await userResponse.json();
  const user = await createOrUpdateUser(githubUser);

  // Generate JWT
  const token = await sign(
    {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    },
    JWT_SECRET,
  );

  return c.json({ token, user: { id: user.id, username: user.username } });
});

// =============================================================================
// Protected Routes
// =============================================================================

// Verify user from JWT
async function getAuthUser(
  c: Context,
): Promise<{ id: string; username: string } | null> {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    return { id: payload.sub as string, username: payload.username as string };
  } catch (e) {
    console.error("JWT verify error:", e);
    return null;
  }
}

// Get current user
app.get("/me", async (c: Context) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const user = await getUser(authUser.id);
  if (!user) return c.json({ error: "User not found" }, 404);

  return c.json({
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  });
});

// =============================================================================
// Anthropic Proxy
// =============================================================================

app.post("/v1/messages", async (c: Context) => {
  const authUser = await getAuthUser(c);
  if (!authUser) {
    return c.json({ error: "Unauthorized. Run 'saj login' first." }, 401);
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(authUser.id);
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded",
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      },
      429,
    );
  }

  // Check monthly budget
  const budget = await checkBudget(authUser.id);
  if (!budget.allowed) {
    return c.json(
      {
        error: "Monthly budget exceeded",
        used: `$${budget.used.toFixed(2)}`,
        limit: `$${budget.limit.toFixed(2)}`,
        message:
          "You've used your $10 free tier this month. Contact @rahulyal for extended access.",
      },
      402,
    ); // 402 Payment Required
  }

  // Get request body and extract model for cost calculation
  const body = await c.req.json();
  const model = body.model || DEFAULT_MODEL;

  // Proxy to Anthropic
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  // Parse response to log usage
  const responseData = await response.json();

  if (responseData.usage) {
    await logUsage(
      authUser.id,
      responseData.usage.input_tokens || 0,
      responseData.usage.output_tokens || 0,
      model,
    );
  }

  // Return with rate limit headers
  return c.json(responseData, response.status as 200, {
    "X-RateLimit-Remaining": rateLimit.remaining.toString(),
    "X-RateLimit-Reset": new Date(rateLimit.resetAt).toISOString(),
  });
});

// =============================================================================
// Usage Stats
// =============================================================================

app.get("/usage", async (c: Context) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date().toISOString();
  const monthKey = now.slice(0, 7);

  const usage = await getMonthlyUsage(authUser.id);
  const budget = await checkBudget(authUser.id);
  const rateLimit = await kv.get<RateLimitEntry>(["rate_limit", authUser.id]);

  return c.json({
    month: monthKey,
    tokens: { input: usage.input, output: usage.output },
    requests: usage.requests,
    budget: {
      used: parseFloat(budget.used.toFixed(4)),
      limit: budget.limit,
      remaining: parseFloat(budget.remaining.toFixed(4)),
      percentUsed: parseFloat(((budget.used / budget.limit) * 100).toFixed(1)),
    },
    rateLimit: {
      limit: RATE_LIMIT,
      remaining: rateLimit.value
        ? Math.max(0, RATE_LIMIT - rateLimit.value.count)
        : RATE_LIMIT,
      resetsAt: rateLimit.value?.resetAt
        ? new Date(rateLimit.value.resetAt).toISOString()
        : null,
    },
  });
});

// =============================================================================
// Start
// =============================================================================

Deno.serve(app.fetch);
