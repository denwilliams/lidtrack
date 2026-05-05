import { execSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const IDLE_SLEEP_MS = 5 * 60 * 1000;

const hooks = {
  sandbox: { onSandboxReady: [{ command: "npm install" }] },
};

const copyToWorktree = ["node_modules"];

function countOpenIssues(): number {
  const out = execSync(
    'gh issue list --state open --label Sandcastle --json number --jq "length"',
    { encoding: "utf8" },
  ).trim();
  return Number.parseInt(out, 10) || 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let iteration = 0;
while (true) {
  iteration++;
  console.log(`\n=== Iteration ${iteration} ===\n`);

  const openCount = countOpenIssues();
  if (openCount === 0) {
    console.log(
      `No open Sandcastle issues. Sleeping ${IDLE_SLEEP_MS / 1000}s before checking again.`,
    );
    await sleep(IDLE_SLEEP_MS);
    continue;
  }

  console.log(`Found ${openCount} open Sandcastle issue(s). Starting implementer.`);

  // Generate branch name upfront so both phases share the same ref
  const branch = `sandcastle/${new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14)}`;

  const implement = await sandcastle.run({
    hooks,
    copyToWorktree,
    sandbox: docker(),
    branchStrategy: { type: "branch", branch },
    name: "implementer",
    maxIterations: 100,
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/implement-prompt.md",
    promptArgs: {
      BRANCH: branch,
    },
  });

  if (!implement.commits.length) {
    console.log("Implementation agent made no commits. Skipping review.");
    continue;
  }

  console.log(`\nImplementation complete on branch: ${branch}`);
  console.log(`Commits: ${implement.commits.length}`);

  await sandcastle.run({
    hooks,
    copyToWorktree,
    sandbox: docker(),
    branchStrategy: { type: "branch", branch },
    name: "reviewer",
    maxIterations: 1,
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/review-prompt.md",
    promptArgs: {
      BRANCH: branch,
    },
  });

  console.log("\nReview complete. Looping immediately to check for more issues.");
}
