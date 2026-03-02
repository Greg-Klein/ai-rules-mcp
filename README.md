# 🧠 AI Rules MCP Server (Docker)

Centralized MCP server that serves **AI skills and best practices** to the whole team.
Skills are stored in a **GitHub/GitLab repo** and synchronized automatically.

```
┌─────────────┐                        ┌──────────────────────┐         ┌─────────────┐
│  Cursor      │                        │                      │  clone  │             │
│  Claude Code │ ── POST /mcp ────────▶ │  ai-rules-mcp        │ ◀────── │  GitHub     │
│  Cline       │                        │  (Docker container)  │  pull   │  skills repo│
│  Windsurf    │                        │                      │         │             │
└─────────────┘                         └──────────────────────┘         └─────────────┘
```

## Quick Start

### 1. Set up the skills repo on GitHub

Create a repo with this structure:

```
skills/
  ├── react/SKILL.md
  ├── typescript/SKILL.md
  ├── testing/SKILL.md
  ├── security/SKILL.md
  └── java-spring/SKILL.md
```

Each `SKILL.md` has a YAML frontmatter:

```yaml
---
name: react
description: React best practices
patterns: ["**/*.tsx", "**/*.jsx"] # which files trigger this skill
tags: [react, frontend] # for manual activation
priority: high # high | normal | low
always: false # true = always included
---
Markdown content of the skill...
```

### 2. Start the server

```bash
# Clone this repo
git clone git@github.com:Greg-Klein/ai-rules-mcp.git
cd ai-rules-mcp

# Configure
cp .env.example .env
# Edit .env with your skills repo URL

# Start
docker compose up -d
```

Verify it works:

```bash
curl http://localhost:3000/health
# {"status":"ok","skillsDir":"/data/skills-repo/skills","repo":"https://***@github.com/..."}
```

### 3. Configure your IDE

See the **IDE Configuration** section below.

## Environment variables

| Variable             | Required | Default             | Description                                           |
| -------------------- | -------- | ------------------- | ----------------------------------------------------- |
| `SKILLS_REPO_URL`    | ✅       | —                   | HTTPS URL of the Git repo containing the skills       |
| `GIT_TOKEN`          | ❌       | —                   | GitHub PAT for private repos                          |
| `SKILLS_REPO_BRANCH` | ❌       | `master`            | Branch to follow                                      |
| `SKILLS_SUBDIR`      | ❌       | `skills`            | Subfolder in the repo containing the `SKILL.md` files |
| `SYNC_INTERVAL_SEC`  | ❌       | `300`               | Sync interval in seconds                              |
| `CLONE_DIR`          | ❌       | `/data/skills-repo` | Local path where the skills repo is cloned            |
| `PORT`               | ❌       | `3000`              | HTTP port                                             |

### Private repo

For a private repo, create a **GitHub Personal Access Token** (Fine-grained, scope `Contents: read`) and pass it to the container:

```bash
# In .env
GIT_TOKEN=ghp_xxxxxxxxxxxxxx
```

```yaml
# docker-compose.yml — uncomment:
environment:
  GIT_TOKEN: "${GIT_TOKEN}"
```

## IDE Configuration

### Claude Code

```bash
claude mcp add --transport http ai-rules http://localhost:3000/mcp
```

That’s it. Claude Code automatically discovers the `get_rules`, `list_skills`, and `get_skill` tools.

To verify:

```bash
claude mcp list
```

### Cursor

Create `.cursor/mcp.json` at the project root:

```json
{
  "mcpServers": {
    "ai-rules": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Cline / Roo Code

In the extension settings → MCP Servers:

```json
{
  "ai-rules": {
    "url": "http://localhost:3000/mcp"
  }
}
```

### Windsurf

In `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "ai-rules": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

## Exposed MCP tools

| Tool          | Description                                       |
| ------------- | ------------------------------------------------- |
| `get_rules`   | Returns skills matching a file path and/or tags   |
| `list_skills` | Lists all available skills (names + descriptions) |
| `get_skill`   | Fetches a specific skill by name                  |

### Example `get_rules` call

```json
{
  "file_path": "src/components/Button.tsx",
  "tags": ["testing"]
}
```

→ Returns: **react** + **typescript-strict** + **testing** + **security** (always)

## Creating a new skill

1. Add a folder in the GitHub skills repo:

```bash
mkdir skills/my-skill
```

2. Create `skills/my-skill/SKILL.md` with the YAML frontmatter.

3. Push to `master` → the server picks it up automatically within 5 minutes (configurable via `SYNC_INTERVAL_SEC`).

## Project architecture

```
ai-rules-mcp/
├── src/
│   ├── index.ts          # Express server + MCP tools (HTTP transport)
│   ├── skills.ts         # Context-aware loading and matching
│   └── git-sync.ts       # Clone + periodic pull from GitHub
├── skills/               # Example skills (used when no repo is configured)
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## License

MIT
