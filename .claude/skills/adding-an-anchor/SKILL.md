---
name: adding-an-anchor
description: Use when adding a new anchor integration to this project: creating an anchor client and its flow pages (plus, for API-key anchors, the server singleton, API wrapper, and proxy routes), or deciding whether a new anchor belongs in ANCHORS vs HONORABLE_MENTIONS.
---

# Adding a new curated anchor

Each curated anchor owns its own client and bespoke flow pages. Nothing is shared; see the per-provider isolation decision in `CLAUDE.md` and the conventions in `.claude/rules/anchor-integrations.md`. Write each piece test-first.

## 1. Client

`src/lib/anchors/<name>/` with `index.ts`, the client (`client.ts` for a proprietary API, `ramp.ts` for a SEP wrapper), and its types and error class. Shape it however the anchor's API actually works; there's no interface to satisfy. Include the `debug?: boolean` flag, keep it browser-safe, and cover it under `tests/anchors/<name>/` (MSW), including a `debug logging` block.

## 2. Wiring: pick by auth model

**SEP anchor (SEP-10 auth, no API key): browser-first.** Pages instantiate the client directly; skip the server singleton, API wrapper, and proxy routes. Before committing to that, confirm the anchor's CORS: `stellar.toml`, `GET`/`POST` auth, preflights for every method with `Authorization` and `Content-Type`, and error responses (401/403/404) all need `Access-Control-Allow-Origin`. Add a proxy only if the anchor's side is broken, and note why in a comment.

**API-key anchor:**

- `src/lib/server/<name>Instance.ts`: singleton getter reading `$app/env/private` (declare the vars in `src/env.ts`), passing `debug: dev` from `$app/env`.
- `src/lib/api/<name>.ts`: browser fetch wrappers built on `createApiRequester` from `./http`.
- `src/routes/api/anchor/<name>/<operation>/+server.ts`: one route per operation.
- Add every new env var to `.env.example`.

## 3. Pages

`src/routes/anchors/<name>/+page.svelte` (landing, with `<AnchorRegionSelector {profile} />`) and `<name>/onramp`, `<name>/offramp` (or the anchor's own flow names). Compose primitives from `src/lib/components/`. Let flow logic duplicate rather than sharing it with another anchor. Add a `page.svelte.spec.ts` for the landing page.

## 4. Config

- `ANCHORS` in `src/lib/config/anchors.ts`, with `regions`, `scorecard` (`makeCriteria`), `knownIssues`, `devOnboarding`, `integrationFlow`, `links`, and an optional `logo` in `static/anchor-logos/`.
- The region's `anchors` list (and description) in `src/lib/config/regions.ts`.
- Update the pinned counts and lists in `tests/config/anchors.test.ts`, `scorecard.test.ts`, and `regions.test.ts`. If the anchor graduates from `HONORABLE_MENTIONS`, remove that entry.

## 5. Docs

`src/lib/anchors/<name>/README.md`: what the anchor is, the flow, and dated wire quirks. Add it to the provider index in `src/lib/anchors/README.md` and the root `README.md`.

## If it doesn't clear the bar

Add it to `HONORABLE_MENTIONS` instead, with no client code, and give it a `scorecard` so its gaps render. For a candidate you're still researching rather than rejecting, use the `assessing-an-anchor` skill.

## Adding SEP support

If the anchor needs a SEP this project doesn't implement yet, create `src/lib/anchors/sep/sep<N>.ts` modeled on the existing modules (pure functions, optional `fetchFn`), add types to `sep/types.ts`, export from `sep/index.ts`, and cover it under `tests/anchors/sep/`.
