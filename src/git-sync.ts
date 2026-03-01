/**
 * Git Sync — clones the skills repo on startup, and refreshes periodically.
 *
 * Environment variables:
 *   SKILLS_REPO_URL    — Git clone URL (HTTPS or SSH)
 *   SKILLS_REPO_BRANCH — Branch to track (default: master)
 *   SKILLS_SUBDIR      — Subdirectory inside the repo containing skills (default: skills)
 *   SYNC_INTERVAL_SEC  — How often to pull updates (default: 300 = 5 min)
 *   GIT_TOKEN           — Optional GitHub PAT for private repos (injected into HTTPS URL)
 */

import fs from "node:fs";
import path from "node:path";
import { simpleGit, SimpleGit } from "simple-git";

const CLONE_DIR = "/data/skills-repo";

export interface SyncConfig {
  repoUrl: string;
  branch: string;
  skillsSubdir: string;
  syncIntervalSec: number;
}

export function getSyncConfig(): SyncConfig {
  const repoUrl = process.env.SKILLS_REPO_URL ?? "";
  const token = process.env.GIT_TOKEN;

  // Inject token into HTTPS URL if provided: https://TOKEN@github.com/org/repo.git
  let finalUrl = repoUrl;
  if (token && repoUrl.startsWith("https://")) {
    finalUrl = repoUrl.replace("https://", `https://${token}@`);
  }

  return {
    repoUrl: finalUrl,
    branch: process.env.SKILLS_REPO_BRANCH ?? "master",
    skillsSubdir: process.env.SKILLS_SUBDIR ?? "skills",
    syncIntervalSec: parseInt(process.env.SYNC_INTERVAL_SEC ?? "300", 10),
  };
}

/**
 * Returns the absolute path to the skills directory.
 */
export function getSkillsPath(config: SyncConfig): string {
  return path.join(CLONE_DIR, config.skillsSubdir);
}

/**
 * Initial clone or pull if already cloned.
 */
export async function syncOnce(config: SyncConfig): Promise<void> {
  if (!config.repoUrl) {
    console.warn(
      "⚠️  SKILLS_REPO_URL not set — using local /data/skills as fallback",
    );
    return;
  }

  const git: SimpleGit = simpleGit();

  if (fs.existsSync(path.join(CLONE_DIR, ".git"))) {
    // Already cloned — pull latest
    console.log(`🔄 Pulling latest from ${config.branch}...`);
    const repo = simpleGit(CLONE_DIR);
    await repo.fetch("origin", config.branch);
    await repo.reset(["--hard", `origin/${config.branch}`]);
    console.log("✅ Skills updated");
  } else {
    // Fresh clone
    console.log(`📦 Cloning ${config.repoUrl} (branch: ${config.branch})...`);
    fs.mkdirSync(CLONE_DIR, { recursive: true });
    // Shallow clone (depth=1) + single-branch to minimize bandwidth and disk usage
    await git.clone(config.repoUrl, CLONE_DIR, [
      "--branch",
      config.branch,
      "--depth",
      "1",
      "--single-branch",
    ]);
    console.log("✅ Skills repo cloned");
  }
}

/**
 * Start periodic sync in the background.
 */
export function startPeriodicSync(config: SyncConfig): () => void {
  if (!config.repoUrl || config.syncIntervalSec <= 0) return () => {};

  const intervalMs = config.syncIntervalSec * 1000;
  let running = false;

  console.log(`⏱️  Auto-sync every ${config.syncIntervalSec}s`);

  const id = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await syncOnce(config);
    } catch (err) {
      console.error("❌ Periodic sync failed:", err);
    } finally {
      running = false;
    }
  }, intervalMs);

  return () => clearInterval(id);
}
