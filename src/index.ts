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
import { loadSkills, matchSkills, getSkillByName, listSkills } from "./skills.js";
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
// MCP Server factory — one per request (stateless)
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ai-rules",
    version: "1.0.0",
  });

  // -- get_rules: context-aware skill retrieval --
  server.tool(
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
  server.tool(
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
  server.tool(
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

  return server;
}

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

// MCP endpoint — stateless: one transport per request
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    // Clean up transport and server when the HTTP connection closes
    // (client disconnect, timeout, or normal end-of-response)
    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Handle GET and DELETE for MCP protocol (required by spec for session mgmt)
app.get("/mcp", (_req: Request, res: Response) => {
  res.writeHead(405).end(JSON.stringify({ error: "Method not allowed. Use POST." }));
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.writeHead(405).end(JSON.stringify({ error: "Method not allowed." }));
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  // 1. Sync skills from GitHub
  try {
    await syncOnce(syncConfig);
  } catch (err) {
    console.error("⚠️  Initial git sync failed:", err);
    console.error("   Server will start with whatever is in", skillsDir);
  }

  // 2. Start periodic sync
  startPeriodicSync(syncConfig);

  // 3. Start HTTP server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 ai-rules-mcp server running`);
    console.log(`   MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
    console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`   Skills dir:   ${skillsDir}`);
    console.log();
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
