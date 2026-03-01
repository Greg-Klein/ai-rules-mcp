#!/usr/bin/env node

/**
 * AI Rules MCP Server — Centralized HTTP mode.
 *
 * On startup:
 *   1. Clones the skills repo from GitHub
 *   2. Starts an Express server exposing MCP over Streamable HTTP
 *   3. Periodically pulls updates from the repo
 *
 * Agents connect via: POST https://your-host:3000/mcp
 */

import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadSkills, matchSkills, getSkillByName, listSkills, invalidateSkillsCache } from "./skills.js";
import { getSyncConfig, getSkillsPath, syncOnce, startPeriodicSync } from "./git-sync.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const syncConfig = getSyncConfig();
const skillsDir = syncConfig.repoUrl
  ? getSkillsPath(syncConfig)
  : process.env.SKILLS_DIR ?? "/data/skills";

// ---------------------------------------------------------------------------
// Shared MCP Server (single instance, reused across requests)
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "ai-rules",
  version: "1.0.0",
});

// -- get_rules: context-aware skill retrieval --
mcpServer.tool(
  "get_rules",
  "Get coding rules and best practices relevant to the current context. " +
    "Pass the file path you're working on, and/or tags like 'testing', 'security'. " +
    "Returns only matching rules to save context tokens.",
  {
    file_path: z
      .string()
      .optional()
      .describe("Current file path (e.g. src/components/Button.tsx)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Extra tags to include (e.g. ['testing', 'security'])"),
    max_results: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Max skills to return (default: 5)"),
  },
  async ({ file_path, tags, max_results }) => {
    const allSkills = await loadSkills(skillsDir);
    const matched = matchSkills(allSkills, { filePath: file_path, tags });
    const limited = matched.slice(0, max_results ?? 5);

    if (limited.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No matching rules found. Use `list_skills` to see available skills.",
          },
        ],
      };
    }

    const output = limited
      .map((s) => {
        const header = `## ${s.meta.name} (priority: ${s.meta.priority ?? "normal"})`;
        const desc = s.meta.description ? `> ${s.meta.description}\n` : "";
        return `${header}\n${desc}\n${s.content}`;
      })
      .join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `# Matched Rules (${limited.length}/${allSkills.length} skills)\n\n${output}`,
        },
      ],
    };
  }
);

// -- list_skills: inventory --
mcpServer.tool(
  "list_skills",
  "List all available skills with descriptions and tags.",
  {},
  async () => {
    const skills = await listSkills(skillsDir);
    const output = skills
      .map(
        (s) =>
          `- **${s.name}** — ${s.description ?? "No description"}\n  Tags: ${(s.tags ?? []).join(", ") || "none"} | Patterns: \`${(s.patterns ?? []).join("`, `") || "none"}\``
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `# Available Skills (${skills.length})\n\n${output}`,
        },
      ],
    };
  }
);

// -- get_skill: fetch one by name --
mcpServer.tool(
  "get_skill",
  "Get a specific skill by name.",
  { name: z.string().describe("Exact skill name") },
  async ({ name }) => {
    const skill = await getSkillByName(skillsDir, name);
    if (!skill) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Skill "${name}" not found. Use list_skills to see available names.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `# ${skill.meta.name}\n> ${skill.meta.description ?? ""}\n\n${skill.content}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    skillsDir,
    repo: syncConfig.repoUrl ? syncConfig.repoUrl.replace(/\/\/.*@/, "//***@") : "none",
  });
});

// MCP endpoint — stateless: one transport per request, shared McpServer
app.post("/mcp", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  try {
    res.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    transport.close();
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Handle GET and DELETE for MCP protocol (required by spec for session mgmt)
app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({ error: "Method not allowed. Use POST." });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({ error: "Method not allowed." });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  // 1. Sync skills from GitHub
  try {
    await syncOnce(syncConfig);
    invalidateSkillsCache();
  } catch (err) {
    console.error("⚠️  Initial git sync failed:", err);
    console.error("   Server will start with whatever is in", skillsDir);
  }

  // 2. Start periodic sync (invalidate cache after each successful sync)
  const stopSync = startPeriodicSync(syncConfig, invalidateSkillsCache);

  // 3. Start HTTP server
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 ai-rules-mcp server running`);
    console.log(`   MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
    console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`   Skills dir:   ${skillsDir}`);
    console.log();
  });

  // Graceful shutdown with forced exit timeout
  const SHUTDOWN_TIMEOUT_MS = 5_000;
  const shutdown = () => {
    console.log("\n🛑 Shutting down...");
    stopSync();
    server.close(() => process.exit(0));
    setTimeout(() => {
      console.error("⚠️  Forced shutdown after timeout");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
