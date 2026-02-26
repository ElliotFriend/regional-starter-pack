# DX Testing: Supervisor Instructions

You are supervising a developer experience (DX) test of the portable anchor integration library in this repository. The goal is to validate the thesis:

> "This repository provides useful information, examples, and copy/paste-friendly code that can be easily incorporated into any TypeScript project to enable anchor integration in a breeze."

Each round, a subagent (playing the role of a developer with no prior context) builds an application using the library in a different framework or against a different anchor provider. You scaffold the project, launch the subagent, review its work, and write a DX report.

---

## Before You Start

### Understand the repository

Read `CLAUDE.md` at the project root. It has the full codebase map, the `Anchor` interface, provider details, and the directory structure. You need to understand the library to evaluate the subagent's work.

### Check prior rounds

Read `dx-testing/README.md` to see completed rounds, the cross-round issue tracker, and ideas for future rounds. Check which framework/provider combinations have been tested and which are still open. The user will tell you (or you should ask) which combination to test.

### Determine what to test

Each round needs a unique combination of:
- **Framework**: React+Vite, Next.js, Express, plain TypeScript, etc.
- **Provider**: Etherfuse, AlfredPay, BlindPay, or testanchor (SEP flow)
- **Bonus feature**: Something that goes beyond basic on/off ramp (AMM pool, multi-provider routing, SEP flow, etc.)

---

## Phase 1: Scaffold the Test Project

**All test projects use the fixed directory `sample-dx-project/` at the repo root.** This directory is gitignored and gets wiped and recreated each round. The scaffold is disposable — only the reports in `dx-testing/<name>/` are kept.

If `sample-dx-project/` already exists from a prior round, delete it first:
```bash
rm -rf sample-dx-project/
```

Scaffold with the standard tooling for the framework:
- **Next.js**: `npx create-next-app@latest sample-dx-project --typescript --tailwind --app --src-dir --eslint --use-npm`
- **Vite + React**: `npm create vite@latest sample-dx-project -- --template react-ts`
- **Express**: `mkdir sample-dx-project && cd sample-dx-project && npm init -y && npm install express typescript @types/node tsx`

Verify the scaffold builds cleanly before launching the subagent. Fix any issues.

**Important**: Do NOT install Stellar dependencies (`@stellar/stellar-sdk`, `@stellar/freighter-api`). The subagent should do this — it's part of the DX being tested.

---

## Phase 2: Write the Subagent Prompt

The prompt is the most important artifact. It defines what the subagent builds and how it documents its work. Use `testing-prompt.md` at the repo root as a reference, but write a fresh prompt for each round.

The prompt must include:

### 1. Role and context
Tell the subagent what kind of developer it is and that it found this SvelteKit project with a portable library.

### 2. Project location
- **Source repo**: the absolute path to this SvelteKit project
- **Test project**: the absolute path to `sample-dx-project/`

### 3. What to build
Be specific about the features. Include:
- Wallet connection (Freighter)
- Customer registration + KYC
- On-ramp flow (fiat -> crypto)
- Off-ramp flow (crypto -> fiat)
- A "bonus" feature that exercises the library beyond basic ramp flows (AMM pool, multi-provider routing, SEP flow, etc.)
- API route handlers / backend proxy (if the framework supports it)

### 4. Provider-specific context
Call out anything unique about the provider being tested:
- **Etherfuse**: iframe KYC, deferred off-ramp signing, sandbox simulation, CETES token
- **BlindPay**: redirect KYC, bank-before-quote, wallet registration, payout submission, USDB token
- **AlfredPay**: form-based KYC, email customer lookup, USDC token

### 5. How to get started
Tell the subagent to read docs and source code first. Point at CLAUDE.md, READMEs, types, and client implementations. Tell it NOT to read `dx-testing/`.

### 6. Build journal requirements
The subagent MUST maintain a `BUILD_JOURNAL.md` in the test project directory. Specify:
- Write frequently, not just at the end
- Record what files were read and what was learned
- Record decisions, friction, confusion, and surprises
- First-person narrative, stream-of-consciousness style
- "Lab notebook", not "documentation"

### 7. Verification
The subagent must run type-checking and build commands and fix any errors.

### 8. Bash permissions
**Critical**: End the prompt with an explicit statement that the subagent has permission to use Bash for all operations (installing packages, creating directories, running builds). Without this, the subagent may stall asking for permission.

Example closing line:
> IMPORTANT: You have full permission to use Bash for all operations — installing npm packages, creating directories, running builds, etc. Do not ask for permission. Just proceed with the work.

---

## Bash Permissions for Subagents

A PreToolUse hook at `.claude/hooks/approve-dx-test-bash.sh` auto-approves non-destructive Bash commands scoped to the `sample-dx-project/` directory. This is wired up in `.claude/settings.local.json`.

**How it works:**
- If the Bash command references `sample-dx-project` in the command string, it's auto-approved
- If the subagent's working directory is inside `sample-dx-project/`, it's auto-approved
- Destructive commands (`rm -rf /`, `git push --force`, etc.) are always denied
- Everything else falls through to normal permission handling

**If the subagent still can't run Bash**: This can happen if the hook doesn't fire for some reason. Fall back to running install/build yourself in Phase 4. Document that it happened but don't treat it as a DX issue — it's a tooling limitation.

---

## Phase 3: Launch the Subagent

Use the Task tool with `subagent_type: "general-purpose"` and `run_in_background: true`.

Pass the full prompt as the `prompt` parameter.

Monitor progress by reading the output file periodically if desired, but generally just wait for the completion notification.

---

## Phase 4: Review the Subagent's Work

This is the core of the supervisor's job. Be thorough.

### 4a. Install and build

If the subagent couldn't run Bash, do it yourself:
```bash
cd sample-dx-project/
npm install
npm run build
```

If the build fails, note the errors — they're DX findings. Fix them if straightforward, but document what happened.

### 4b. Read the build journal

Read `BUILD_JOURNAL.md` in full. Look for:
- What the subagent found easy vs. confusing
- Where it got stuck or made wrong turns
- What it chose to copy vs. skip and why
- Any friction with the library, types, or documentation
- Whether it used the `Anchor` interface or reached for provider-specific code
- Whether it used `AnchorCapabilities` flags correctly

### 4c. Diff copied files

For every file the subagent claimed to copy "verbatim", diff it against the original:
```bash
diff src/lib/anchors/types.ts sample-dx-project/src/lib/anchors/types.ts
```

Document any changes — even cosmetic ones (stripped comments, reformatted imports). The "verbatim" claim is part of the DX evaluation.

### 4d. Read all created files

Read every file the subagent wrote (components, hooks, API routes, utilities, pages). Evaluate:
- Does it use the `Anchor` interface correctly?
- Does it handle provider-specific patterns (deferred signing, bank-before-quote, etc.)?
- Are API routes properly proxying through the server-side client?
- Is the error handling pattern correct (`AnchorError` -> HTTP status)?
- Did it recreate token/config data that should have come from the library?

### 4e. Cross-reference with prior rounds

Check the cross-round issue tracker in `dx-testing/README.md`. For each previously-fixed issue, verify whether it's actually fixed in this round's experience. This is the regression test.

---

## Phase 5: Write the DX Report

Create the output directory: `dx-testing/<framework>-<provider>/`

Copy `BUILD_JOURNAL.md` from the test project into this directory.

Write `DX_REPORT.md` following the established format. The report structure is:

```markdown
# Anchor Library Portability: DX Report

## Thesis Under Test
> (the thesis, quoted)

## Methodology
How the test was run. What the subagent did. What the supervisor did.
Context about which round this is and what prior fixes are being validated.

## Test Application
Stack, what was built, line count.

## Verdict: X/10
One-paragraph summary of the overall assessment.

## What Worked
Numbered sections with specific examples, code snippets, and evidence.

## What Didn't Work
Numbered issues with severity, problem description, and fix suggestions.

## Observations (Not Issues)
Things worth noting that aren't problems — scope decisions, patterns that emerged, etc.

## Recommendations
Prioritized list of suggested improvements.

## File Manifest
Three tables:
1. Portable library files used (file, copied verbatim?, notes)
2. Application files created (file, lines, purpose)
3. Files not copied and why

## Appendix A: Subagent Prompt
The full prompt given to the subagent, quoted verbatim.
```

### Rating guidelines

- **10/10**: Zero library issues. Everything copied and worked without friction.
- **9/10**: Minor ergonomic issues that don't block the developer.
- **8/10**: Real issues that require workarounds but are fixable.
- **7/10**: Significant friction that would slow down a real developer.
- **Below 7**: Fundamental portability problems.

---

## Phase 6: Update the README

Add a row to the rounds table in `dx-testing/README.md` with the directory, framework, provider, verdict, and key issues.

If the round surfaced new cross-round issues (appeared in 2+ rounds), add them to the cross-round issue tracker.

If the round was one of the "Ideas for Future Rounds", check it off.

---

## Checklist

- [ ] Read `CLAUDE.md` and `dx-testing/README.md`
- [ ] Confirm the framework/provider combination with the user
- [ ] Scaffold test project into `sample-dx-project/` (delete old one first if it exists)
- [ ] Verify the scaffold builds cleanly
- [ ] Write the subagent prompt (reference `testing-prompt.md`)
- [ ] Launch the subagent (background, general-purpose)
- [ ] Wait for completion
- [ ] Install deps and run build (if subagent couldn't)
- [ ] Read the build journal
- [ ] Diff all copied files against originals
- [ ] Read all created files
- [ ] Cross-reference with prior round issues
- [ ] Create `dx-testing/<name>/` output directory
- [ ] Copy `BUILD_JOURNAL.md` to output directory
- [ ] Write `DX_REPORT.md`
- [ ] Append the subagent prompt as Appendix A
- [ ] Update `dx-testing/README.md` rounds table
- [ ] Update cross-round issue tracker if needed
