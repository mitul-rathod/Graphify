# 🧠 Graphify

**Persistent memory for Claude Code** — A codebase knowledge graph generator that gives AI coding assistants instant, branch-aware understanding of your entire project.

## What It Does

Graphify scans your codebase and generates a **knowledge graph** that maps out:

- 📁 **Files** — Every source file with its purpose and contents
- ⚡ **Functions** — All functions with parameters, return types, and call relationships
- 🏗️ **Classes** — Class hierarchies, methods, properties, and inheritance chains
- 🔗 **Dependencies** — Import/export relationships between all files
- 📦 **Modules** — Directory-level groupings and their contents
- 📊 **Metrics** — Most imported files, most connected functions, orphan files

### Two Outputs, One Graph

| Output | For | Format |
|--------|-----|--------|
| `.graphify/GRAPH.md` | **Claude Code** | Compact LLM-optimized index |
| `.graphify/vault/<branch>/` | **Obsidian** | Markdown files with `[[wiki-links]]` |

### Why Branch-Level?

Each branch can have different code. Graphify generates a separate graph per branch, so your AI assistant always has accurate context for the code you're actually working on.

## Quick Start

### 1. Install

```bash
cd your-project
npm install /path/to/Graphify
```

Or for global use:

```bash
cd /path/to/Graphify
npm install -g .
```

### 2. Run

```bash
# Analyze current branch
graphify

# Force re-analysis
graphify --force

# Analyze a specific branch
graphify --branch feature/auth
```

### 3. Install Claude Code Hook

```bash
graphify install-hook
```

This sets up Claude Code to automatically update and read the knowledge graph before processing your requests.

## How It Integrates with Claude Code

### The Three-Layer Integration

**Layer 1: CLAUDE.md Instructions**
Graphify injects instructions into your project's `CLAUDE.md` that tell Claude Code to read the graph first, before touching any source files.

**Layer 2: PreToolUse Hook**
A hook fires on each tool use. Graphify checks if the graph needs updating (based on commit hash), regenerates if needed, and stays silent if nothing changed.

**Layer 3: GRAPH.md Context**
The generated `GRAPH.md` gives Claude Code a complete map of your codebase — file structure, function signatures, dependencies, and call graphs — so it knows exactly where to make changes.

### The Result

```
Before Graphify:
  User: "Add error handling to auth"
  Claude: *reads 15 files to understand the project*
  Claude: *makes changes*

After Graphify:  
  User: "Add error handling to auth"
  Claude: *reads GRAPH.md* → "Auth logic is in src/auth/handler.ts,
           calls validateToken() in src/utils/auth.ts"
  Claude: *reads only 2 files, makes targeted changes*
```

## Viewing in Obsidian

1. Open Obsidian
2. Open vault → select `.graphify/vault/<your-branch>/`
3. Open the Graph View (Ctrl/Cmd + G)
4. Explore your codebase as an interactive knowledge graph!

### What You'll See

- **File nodes** linked to their functions and classes
- **Import relationships** showing which files depend on which
- **Function call chains** revealing how your code flows
- **Class hierarchies** with inheritance and interface relationships

## Supported Languages

| Language | Parser | Coverage |
|----------|--------|----------|
| JavaScript (.js, .jsx, .mjs, .cjs) | Babel | Full |
| TypeScript (.ts, .tsx) | Babel + TS plugin | Full |
| Python (.py) | Regex-based | Functions, classes, imports |

## Configuration

### CLI Options

```
graphify                     Analyze current branch
graphify --force, -f         Force re-analysis (ignore cache)
graphify --quiet, -q         Quiet mode (for hooks)
graphify --branch <name>     Analyze a specific branch
graphify install-hook        Install Claude Code hook
graphify --help, -h          Show help
```

### What Gets Ignored

Graphify respects `.gitignore` and also skips:
- `node_modules/`, `.git/`, `dist/`, `build/`
- `__pycache__/`, `venv/`, `.env/`
- Minified files (`*.min.js`, `*.bundle.js`)
- Lock files (`package-lock.json`, `yarn.lock`)

## Architecture

```
Graphify/
├── bin/graphify.js        ← CLI entry point
├── src/
│   ├── index.js           ← Main orchestrator
│   ├── scanner.js         ← File discovery
│   ├── branch.js          ← Git branch management
│   ├── utils.js           ← Shared utilities
│   ├── parser/
│   │   ├── index.js       ← Parser factory
│   │   ├── javascript.js  ← JS/TS parser (Babel AST)
│   │   └── python.js      ← Python parser (regex)
│   ├── graph/
│   │   ├── builder.js     ← Graph construction
│   │   ├── nodes.js       ← Node types
│   │   └── edges.js       ← Edge types
│   └── writers/
│       ├── obsidian.js    ← Obsidian vault writer
│       └── claude.js      ← Claude GRAPH.md writer
├── hooks/
│   ├── claude-hook.sh     ← Shell hook script
│   └── install.js         ← Hook installer
└── README.md
```

## License

MIT
