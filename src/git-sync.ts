/**
 * Git Sync — clones the skills repo on startup, and refreshes periodically.
 *
 * Environment variables:
 *   SKILLS_REPO_URL    — Git clone URL (HTTPS or SSH)
 *   SKILLS_REPO_BRANCH — Branch to track (default: master)
 *   SKILLS_SUBDIR      — Subdirectory inside the repo containing skills (default: skills)
 *   SYNC_INTERVAL_SEC  — How often to pull updates (default: 300 = 5 min)
 *   GIT_TOKEN           — Optional PAT for private repos (injected into HTTPS URL)
 *   GIT_USERNAME        — Optional username for token auth (e.g. "oauth2" for GitLab PATs)
 */

import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";

const CLONE_DIR = process.env.CLONE_DIR ?? "/data/skills-repo";

export interface SyncConfig {
  repoUrl: string;
  branch: string;
  skillsSubdir: string;
  syncIntervalSec: number;
}

export function getSyncConfig(): SyncConfig {
  const repoUrl = process.env.SKILLS_REPO_URL ?? "";
  const token = process.env.GIT_TOKEN;

  // Inject token into HTTPS URL if provided.
  // GitHub:  https://TOKEN@github.com/org/repo.git           (no username needed)
  // GitLab:  https://oauth2:TOKEN@gitlab.com/org/repo.git    (GIT_USERNAME=oauth2)
  let finalUrl = repoUrl;
  if (token && repoUrl.startsWith("https://")) {
    const username = process.env.GIT_USERNAME;
    const credentials = username ? `${username}:${token}` : token;
    finalUrl = repoUrl.replace("https://", `https://${credentials}@`);
  }

  return {
    repoUrl: finalUrl,
    branch: process.env.SKILLS_REPO_BRANCH ?? "master",
    skillsSubdir: process.env.SKILLS_SUBDIR ?? "skills",
    syncIntervalSec: Math.max(0, parseInt(process.env.SYNC_INTERVAL_SEC ?? "300", 10) || 300),
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
function maskUrl(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//***@");
}

export async function syncOnce(config: SyncConfig): Promise<void> {
  if (!config.repoUrl) {
    console.warn(
      "⚠️  SKILLS_REPO_URL not set — using local /data/skills as fallback",
    );
    return;
  }

  if (fs.existsSync(path.join(CLONE_DIR, ".git"))) {
    // Already cloned — pull latest
    console.log(`🔄 Pulling latest from ${config.branch}...`);
    const repo = simpleGit(CLONE_DIR);
    await repo.fetch("origin", config.branch);
    await repo.reset(["--hard", `origin/${config.branch}`]);
    console.log("✅ Skills updated");
  } else {
    // Fresh clone
    console.log(`📦 Cloning ${maskUrl(config.repoUrl)} (branch: ${config.branch})...`);
    fs.mkdirSync(CLONE_DIR, { recursive: true });
    // Shallow clone (depth=1) + single-branch to minimize bandwidth and disk usage
    await simpleGit().clone(config.repoUrl, CLONE_DIR, [
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
export function startPeriodicSync(config: SyncConfig, onSync?: () => void): () => void {
  if (!config.repoUrl || config.syncIntervalSec <= 0) return () => {};

  const intervalMs = config.syncIntervalSec * 1000;
  let running = false;

  console.log(`⏱️  Auto-sync every ${config.syncIntervalSec}s`);

  const id = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await syncOnce(config);
      onSync?.();
    } catch (err) {
      console.error("❌ Periodic sync failed:", err);
    } finally {
      running = false;
    }
  }, intervalMs);

  return () => clearInterval(id);
}
