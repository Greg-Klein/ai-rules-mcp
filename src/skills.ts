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

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadSkills(skillsDir: string): Promise<Skill[]> {
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

  return skills;
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export function matchSkills(skills: Skill[], ctx: MatchContext): Skill[] {
  const scored: { skill: Skill; score: number }[] = [];

  for (const skill of skills) {
    let score = 0;

    if (skill.meta.always) score += 10;

    if (ctx.filePath && skill.meta.patterns?.length) {
      for (const pattern of skill.meta.patterns) {
        if (minimatch(ctx.filePath, pattern, { matchBase: true })) {
          score += 5;
          break;
        }
      }
    }

    if (ctx.tags?.length && skill.meta.tags?.length) {
      const overlap = ctx.tags.filter((t) =>
        skill.meta.tags!.some((st) => st.toLowerCase() === t.toLowerCase())
      );
      score += overlap.length * 3;
    }

    score += PRIORITY_WEIGHT[skill.meta.priority ?? "normal"] ?? 2;

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
