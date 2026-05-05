# Sandbox Passthrough Proxy

A minimal Flask app that forwards HTTP requests from a static-IP host to an
upstream sandbox API (PDAX, by default). Deployed to Fly.io with a dedicated
egress IPv4 so PDAX can whitelist a single, stable address.

## Why this exists

The PDAX sandbox requires IP whitelisting. Developing from a laptop on a
dynamic IP is unworkable, and PDAX flagged the local IP as suspicious anyway.
This proxy gives a single static egress IP that PDAX can whitelist; the dev
machine talks to the proxy, the proxy talks to PDAX.

## What it does

- Catch-all route forwards `<method> /<any/path>?<query>` (with body and
  headers) to `<UPSTREAM_BASE_URL>/<any/path>?<query>`.
- Strips RFC 7230 hop-by-hop headers in both directions.
- Requires a shared-secret header (`X-Proxy-Secret`) so the URL isn't usable
  as an open proxy by anyone who finds it. The header is consumed by the
  proxy and not forwarded upstream.
- `GET /healthz` returns `ok` without auth, for uptime checks.

## Configuration

Set via environment variables (Fly secrets in production, `.env` locally —
`python-dotenv` is loaded on startup):

| Variable            | Default                       | Notes                                    |
| ------------------- | ----------------------------- | ---------------------------------------- |
| `UPSTREAM_BASE_URL` | `https://api-sandbox.pdax.ph` | Base URL the proxy forwards to.          |
| `PROXY_SECRET`      | _(unset → all requests 403)_  | Long random string. Required.            |
| `REQUEST_TIMEOUT`   | `30`                          | Per-request upstream timeout in seconds. |

## Deploy to Fly.io

Prerequisites: `flyctl` installed (`brew install flyctl`) and a Fly.io account
(`flyctl auth signup` for the trial, or `flyctl auth login`).

From this directory:

```sh
# 1. Create the app — uses the included fly.toml + Dockerfile.
#    You'll be prompted to pick an app name (the one in fly.toml may be taken).
flyctl launch --no-deploy --copy-config

# 2. Set secrets — injected as env vars on the machine.
flyctl secrets set \
  PROXY_SECRET="$(openssl rand -hex 32)" \
  UPSTREAM_BASE_URL="https://api-sandbox.pdax.ph"

# 3. Deploy.
flyctl deploy

# 4. Allocate a static egress IPv4 in the same region as the machine.
flyctl ips allocate-egress --region sin

# 5. Send the printed IPv4 to PDAX for whitelisting.
```

The egress IP is app-scoped and persists across deploys, machine restarts, and
auto-stop/start cycles, so PDAX only needs to whitelist it once. Your app URL
(for the SvelteKit app to call) will be `https://<app-name>.fly.dev`.

To rotate `PROXY_SECRET` later: `flyctl secrets set PROXY_SECRET=<new>` —
this triggers a redeploy. The egress IP stays the same.

## Local dev

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit PROXY_SECRET
python app.py
```

Then:

```sh
curl -H "X-Proxy-Secret: <your-secret>" http://127.0.0.1:5000/some/upstream/path
```

## Calling the proxy from the SvelteKit app

In the SvelteKit `.env`, set `PDAX_BASE_URL` to the proxy's public URL (without
any PDAX path prefix — the proxy adds that on its side via `UPSTREAM_BASE_URL`)
and set `PDAX_PROXY_SECRET` to match `PROXY_SECRET` here. For example:

```
# SvelteKit .env
PDAX_BASE_URL="https://pdax-sandbox-proxy.fly.dev"
PDAX_PROXY_SECRET="<same value as PROXY_SECRET>"
```

```
# proxy/.env (or Fly secrets)
UPSTREAM_BASE_URL="https://stage.services.sandbox.pdax.ph/api/pdax-api"
PROXY_SECRET="<same value as PDAX_PROXY_SECRET>"
```

The proxy is otherwise fully transparent — request shape, response shape, and
PDAX's own auth headers (`access_token`, `id_token`) all pass through unchanged.

## Operational notes

- **Cold starts.** With `auto_stop_machines = 'stop'` and `min_machines_running = 0`
  in `fly.toml`, the machine scales to zero when idle. The first request after
  idle pays ~1–2s of machine start + container boot + gunicorn warmup. Flip
  `min_machines_running = 1` if that latency bites; the egress IP is unaffected.
- **Shared-secret model.** A single `PROXY_SECRET` gates all callers — there is
  no per-user isolation. Rotating the secret kicks every caller off at once.
  Fine for a small POC group; not for anything larger.

## Implications if you're reading this for inspiration

**This proxy is a sandbox-only convenience.** The parent repo is a curated
showcase of fiat on/off ramps on Stellar. Both the SvelteKit app and this
proxy target sandbox endpoints exclusively and were never intended to handle
real funds.

If you're considering this pattern for a real integration, do not copy it as-is:

- A shared-secret header is the bare minimum. Production should use mTLS,
  signed requests, or a private network between client and proxy.
- This proxy logs nothing, rate-limits nothing, retries nothing, and does no
  input validation — appropriate for a throwaway dev tool, not anything else.
- IP whitelisting is a coarse control. "The proxy IP is whitelisted" is not
  a sufficient access boundary in production.
- This deploys a single shared-CPU machine in one region with no redundancy.
  Fine for a sandbox helper; not fine for anything with uptime expectations.

Treat this as a stopgap that unblocks sandbox development, not as a
deployment blueprint.
