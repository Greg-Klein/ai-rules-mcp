/**
 * Skills loader & context-aware matcher.
 *
 * Each skill is a Markdown file with YAML frontmatter defining
 * patterns (glob), tags, priority, and an optional `always` flag.
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import fg from "fast-glob";
import { minimatch } from "minimatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMeta {
  name: string;
  description?: string;
  patterns?: string[];
  tags?: string[];
  priority?: "high" | "normal" | "low";
  always?: boolean;
}

export interface Skill {
  meta: SkillMeta;
  content: string;
  filePath: string;
}

export interface MatchContext {
  filePath?: string;
  tags?: string[];
}

// Additive score contribution based on declared priority.
// A skill with only `priority: normal` earns exactly 2 points,
// which is equal to the threshold (> 2) — so it is excluded unless
// it also matches by file pattern or tags.
const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

// ---------------------------------------------------------------------------
// Loader (with in-memory cache)
// ---------------------------------------------------------------------------

let cachedSkills: Skill[] | null = null;
let cachedSkillsDir: string | null = null;

export function invalidateSkillsCache(): void {
  cachedSkills = null;
  cachedSkillsDir = null;
}

export async function loadSkills(skillsDir: string): Promise<Skill[]> {
  if (cachedSkills && cachedSkillsDir === skillsDir) {
    return cachedSkills;
  }

  const files = await fg("**/SKILL.md", {
    cwd: skillsDir,
    absolute: false,
  });

  const skills: Skill[] = [];

  for (const file of files) {
    const fullPath = path.join(skillsDir, file);
    const raw = await fs.readFile(fullPath, "utf-8");
    const { data, content } = matter(raw);

    skills.push({
      meta: {
        name: data.name ?? path.dirname(file),
        description: data.description,
        patterns: data.patterns ?? [],
        tags: data.tags ?? [],
        priority: data.priority ?? "normal",
        always: data.always ?? false,
      },
      content: content.trim(),
      filePath: file,
    });
  }

  cachedSkills = skills;
  cachedSkillsDir = skillsDir;
  return skills;
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export function matchSkills(skills: Skill[], ctx: MatchContext): Skill[] {
  const scored: { skill: Skill; score: number }[] = [];

  for (const skill of skills) {
    let score = 0;

    // `always: true` guarantees inclusion regardless of context
    if (skill.meta.always) score += 10;

    // +5 if the file path matches at least one glob pattern (first match wins)
    if (ctx.filePath && skill.meta.patterns?.length) {
      for (const pattern of skill.meta.patterns) {
        if (minimatch(ctx.filePath, pattern, { matchBase: true })) {
          score += 5;
          break;
        }
      }
    }

    // +3 per matching tag (case-insensitive)
    if (ctx.tags?.length && skill.meta.tags?.length) {
      const overlap = ctx.tags.filter((t) =>
        skill.meta.tags!.some((st) => st.toLowerCase() === t.toLowerCase())
      );
      score += overlap.length * 3;
    }

    // Add priority weight (high=3, normal=2, low=1)
    score += PRIORITY_WEIGHT[skill.meta.priority ?? "normal"] ?? 2;

    // Exclude skills that only earned their base priority weight (no real match).
    // `always` skills bypass this filter.
    if (score > 2 || skill.meta.always) {
      scored.push({ skill, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.skill);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function listSkills(skillsDir: string): Promise<SkillMeta[]> {
  const skills = await loadSkills(skillsDir);
  return skills.map((s) => s.meta);
}

export async function getSkillByName(
  skillsDir: string,
  name: string
): Promise<Skill | undefined> {
  const skills = await loadSkills(skillsDir);
  return skills.find((s) => s.meta.name.toLowerCase() === name.toLowerCase());
}
