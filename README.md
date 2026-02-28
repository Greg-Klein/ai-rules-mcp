# 🧠 AI Rules MCP Server (Docker)

Serveur MCP centralisé qui sert des **skills IA et bonnes pratiques** à toute l'équipe.
Les skills sont stockés dans un **repo GitHub/GitLab** et synchronisés automatiquement.

```
┌─────────────┐                        ┌──────────────────────┐         ┌─────────────┐
│  Cursor      │                        │                      │  clone  │             │
│  Claude Code │ ── POST /mcp ────────▶ │  ai-rules-mcp        │ ◀────── │  GitHub     │
│  Cline       │                        │  (Docker container)  │  pull   │  skills repo│
│  Windsurf    │                        │                      │         │             │
└─────────────┘                         └──────────────────────┘         └─────────────┘
```

## Quick Start

### 1. Préparer le repo de skills sur GitHub

Créer un repo avec cette structure :

```
your-org/ai-rules-skills/
└── skills/
    ├── react/SKILL.md
    ├── typescript/SKILL.md
    ├── testing/SKILL.md
    ├── security/SKILL.md
    └── java-spring/SKILL.md
```

Chaque `SKILL.md` a un frontmatter YAML :

```yaml
---
name: react
description: React best practices
patterns: ["**/*.tsx", "**/*.jsx"]     # quels fichiers déclenchent ce skill
tags: [react, frontend]                # pour activation manuelle
priority: high                         # high | normal | low
always: false                          # true = toujours inclus
---

Contenu Markdown du skill...
```

### 2. Lancer le serveur

```bash
# Cloner ce repo
git clone git@github.com:your-org/ai-rules-mcp.git
cd ai-rules-mcp

# Configurer
cp .env.example .env
# Editer .env avec l'URL de votre repo de skills

# Lancer
docker compose up -d
```

Vérifier que tout fonctionne :

```bash
curl http://localhost:3000/health
# {"status":"ok","skillsDir":"/data/skills-repo/skills","repo":"https://***@github.com/..."}
```

### 3. Configurer son IDE

Voir la section **Configuration IDE** ci-dessous.

## Variables d'environnement

| Variable              | Requis | Défaut   | Description                                         |
|-----------------------|--------|----------|-----------------------------------------------------|
| `SKILLS_REPO_URL`     | ✅     | —        | URL HTTPS du repo Git contenant les skills           |
| `GIT_TOKEN`           | ❌     | —        | GitHub PAT pour les repos privés                     |
| `SKILLS_REPO_BRANCH`  | ❌     | `main`   | Branche à suivre                                     |
| `SKILLS_SUBDIR`       | ❌     | `skills` | Sous-dossier dans le repo contenant les `SKILL.md`   |
| `SYNC_INTERVAL_SEC`   | ❌     | `300`    | Intervalle de synchronisation en secondes             |
| `PORT`                | ❌     | `3000`   | Port HTTP                                            |

### Repo privé

Pour un repo privé, créer un **GitHub Personal Access Token** (Fine-grained, scope `Contents: read`) et le passer au container :

```bash
# Dans .env
GIT_TOKEN=ghp_xxxxxxxxxxxxxx
```

```yaml
# docker-compose.yml — décommenter :
environment:
  GIT_TOKEN: "${GIT_TOKEN}"
```

## Configuration IDE

### Claude Code

```bash
claude mcp add --transport http ai-rules http://localhost:3000/mcp
```

C'est tout. Claude Code découvre automatiquement les tools `get_rules`, `list_skills` et `get_skill`.

Pour vérifier :

```bash
claude mcp list
```

### Cursor

Créer `.cursor/mcp.json` à la racine du projet :

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

Dans les settings de l'extension → MCP Servers :

```json
{
  "ai-rules": {
    "url": "http://localhost:3000/mcp"
  }
}
```

### Windsurf

Dans `~/.codeium/windsurf/mcp_config.json` :

```json
{
  "mcpServers": {
    "ai-rules": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

## Outils MCP exposés

| Outil         | Description                                                            |
|---------------|------------------------------------------------------------------------|
| `get_rules`   | Retourne les skills matchant un chemin de fichier et/ou tags           |
| `list_skills` | Liste tous les skills disponibles (noms + descriptions)                |
| `get_skill`   | Récupère un skill spécifique par nom                                   |

### Exemple d'appel `get_rules`

```json
{
  "file_path": "src/components/Button.tsx",
  "tags": ["testing"]
}
```

→ Retourne : **react** + **typescript-strict** + **testing** + **security** (always)

## Créer un nouveau skill

1. Ajouter un dossier dans le repo de skills GitHub :

```bash
mkdir skills/mon-skill
```

2. Créer `skills/mon-skill/SKILL.md` avec le frontmatter YAML.

3. Push sur `main` → le serveur le récupère automatiquement sous 5 minutes (configurable via `SYNC_INTERVAL_SEC`).

## Architecture du projet

```
ai-rules-mcp/
├── src/
│   ├── index.ts          # Express server + MCP tools (HTTP transport)
│   ├── skills.ts         # Chargement et matching context-aware
│   └── git-sync.ts       # Clone + pull périodique depuis GitHub
├── skills/               # Skills d'exemple (utilisés si pas de repo configuré)
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## License

MIT
