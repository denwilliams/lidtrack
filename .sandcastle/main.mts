// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): A sonnet agent picks an open GitHub issue, works on it
//                        on a dedicated branch, commits the changes, and signals
//                        completion.
//   Phase 2 (Review):    A second sonnet agent reviews the branch diff and either
//                        approves it or makes corrections directly on the branch.
//
// The outer loop runs indefinitely (until Ctrl+C), processing one issue per
// iteration. It checks for open Sandcastle issues via `gh` before launching
// any agent — if none are open, it sleeps for IDLE_WAIT_MS without burning
// any model tokens. This is a middle-complexity option between the simple-loop
// (no review gate) and the parallel-planner (concurrent execution with a
// planning phase).
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// How long to wait between iterations when there are no open issues to work on.
const IDLE_WAIT_MS = 5 * 60 * 1000;

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: { onSandboxReady: [{ command: "npm install" }] },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasOpenIssues(): boolean {
  const out = execFileSync(
    "gh",
    ["issue", "list", "--state", "open", "--label", "Sandcastle", "--json", "number"],
    { encoding: "utf8" },
  );
  const issues = JSON.parse(out) as unknown[];
  return issues.length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main loop — runs until cancelled (Ctrl+C)
// ---------------------------------------------------------------------------

for (let iteration = 1; ; iteration++) {
  console.log(`\n=== Iteration ${iteration} ===\n`);

  if (!hasOpenIssues()) {
    console.log(`No open Sandcastle issues. Sleeping ${IDLE_WAIT_MS / 1000}s.`);
    await sleep(IDLE_WAIT_MS);
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 1: Implement
  //
  // A sonnet agent picks the next open GitHub issue, creates a branch, writes
  // the implementation (using RGR: Red → Green → Repeat → Refactor), and
  // commits the result.
  //
  // The agent signals completion via <promise>COMPLETE</promise> when done.
  // The result contains the branch name the agent worked on.
  // -------------------------------------------------------------------------
  const implement = await sandcastle.run({
    hooks,
    copyToWorktree,
    sandbox: docker(),
    branchStrategy: { type: "merge-to-head" },
    name: "implementer",
    maxIterations: 100,
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/implement-prompt.md",
  });

  // Extract the branch the agent worked on so the reviewer can target it.
  const branch = implement.branch;

  if (!implement.commits.length) {
    console.log("Implementation agent made no commits. Skipping review.");
    continue;
  }

  console.log(`\nImplementation complete on branch: ${branch}`);
  console.log(`Commits: ${implement.commits.length}`);

  // -------------------------------------------------------------------------
  // Phase 2: Review
  //
  // A second sonnet agent reviews the diff of the branch produced by Phase 1.
  // It uses the {{BRANCH}} prompt argument to inspect the right branch, and
  // either approves or makes corrections directly on the branch.
  // -------------------------------------------------------------------------
  await sandcastle.run({
    hooks,
    copyToWorktree,
    sandbox: docker(),
    branchStrategy: { type: "branch", branch },
    name: "reviewer",
    maxIterations: 1,
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/review-prompt.md",
    // Prompt arguments substitute {{BRANCH}} in review-prompt.md before the
    // agent sees the prompt.
    promptArgs: {
      BRANCH: branch,
    },
  });

  console.log("\nReview complete.");
}
