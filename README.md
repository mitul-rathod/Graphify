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

**Layer 2: Ultra-Fast PreToolUse Hook (<10ms)**
A bash hook fires on each tool use with a 3-tier caching strategy:

| Tier | Check | Time |
|------|-------|------|
| ⚡ **Fast** | File age — skip if checked in last 60s | ~2ms |
| 🔍 **Medium** | Git commit hash — skip if unchanged | ~8ms |
| 🔄 **Slow** | Full re-analysis (runs in background) | ~8ms return |

The hook **never blocks** Claude Code — even when re-analysis is needed, it forks the work to a background process and returns immediately.

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

| Language | Extensions | Parser | Extracts |
|----------|-----------|--------|----------|
| JavaScript | `.js` `.jsx` `.mjs` `.cjs` | Babel AST | Functions, classes, imports, exports, call graph |
| TypeScript | `.ts` `.tsx` | Babel + TS plugin | Functions, classes, imports, exports, call graph |
| Python | `.py` `.pyi` `.pyx` `.pxd` | Regex | Functions, classes, imports, exports, calls |
| C / C++ Headers | `.c` `.h` | Regex | Functions, structs, enums, typedefs, `#include`, `#define` |
| Protocol Buffers | `.proto` | Regex | Messages, services, RPCs, enums, imports |
| YAML | `.yaml` `.yml` | Regex | Top-level config keys |
| Shell / Bash | `.sh` | Regex | Functions, source imports, exported variables |
| HTML | `.html` `.htm` | Regex | Script/link imports, structural elements |

## Performance

| Project Size | Files | Functions | Classes | Imports | Time |
|-------------|-------|-----------|---------|---------|------|
| Small project | 20 | 65 | 0 | 49 | **0.09s** |
| Large project (6.5k files) | 6,502 | 10,954 | 13,096 | 39,014 | **6.53s** |

Hook overhead per Claude Code tool call: **18–32ms** (cached path).

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
├── bin/graphify.js            ← CLI entry point
├── src/
│   ├── index.js               ← Main orchestrator
│   ├── scanner.js             ← File discovery (22 extensions)
│   ├── branch.js              ← Git branch & commit detection
│   ├── utils.js               ← Path helpers, import resolution
│   ├── parser/
│   │   ├── index.js           ← Parser router (7 languages)
│   │   ├── javascript.js      ← JS/TS parser (Babel AST)
│   │   ├── python.js          ← Python/Cython parser (regex)
│   │   ├── c.js               ← C/H parser (regex)
│   │   ├── proto.js           ← Protocol Buffers parser (regex)
│   │   ├── yaml.js            ← YAML config parser
│   │   ├── shell.js           ← Shell/Bash parser (regex)
│   │   └── html.js            ← HTML parser (regex)
│   ├── graph/
│   │   ├── builder.js         ← Graph construction + metrics
│   │   ├── nodes.js           ← Node types (File, Function, Class, Module)
│   │   └── edges.js           ← Edge types (imports, calls, extends)
│   └── writers/
│       ├── obsidian.js        ← Obsidian vault writer (wiki-links)
│       └── claude.js          ← Claude GRAPH.md writer (LLM-optimized)
├── hooks/
│   ├── fast-hook.sh           ← Ultra-fast bash hook (<10ms)
│   ├── claude-hook.sh         ← Shell hook for graph output
│   └── install.js             ← Automated hook installer
└── README.md
```

## Dependencies

- **[@babel/parser](https://www.npmjs.com/package/@babel/parser)** — JS/TS AST parsing
- **[@babel/traverse](https://www.npmjs.com/package/@babel/traverse)** — AST traversal
- **[ignore](https://www.npmjs.com/package/ignore)** — `.gitignore` pattern matching

## License

MIT
