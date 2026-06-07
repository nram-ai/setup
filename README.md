<p align="center">
  <img src="https://nram.ai/brand.png" alt="Neural Ram" width="150" />
</p>

<h1 align="center">@nram/setup</h1>

<p align="center"><sub>the setup wizard for <a href="https://github.com/nram-ai/nram">Neural Ram</a> (<code>nram</code> for short)</sub></p>

<p align="center">
  <strong>One command to connect your AI coding tools to Neural Ram.</strong><br />
  Registers the MCP connection and installs the standing memory instructions for 17 tools, in one interactive run.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7FCFFA?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/@nram/setup"><img src="https://img.shields.io/npm/v/@nram/setup?style=flat-square&color=7FCFFA" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/Node.js-22%2B-5FA04E?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/supports-17_tools-7FCFFA?style=flat-square" alt="Supports 17 tools" />
  <a href="https://github.com/nram-ai/setup/stargazers"><img src="https://img.shields.io/github/stars/nram-ai/setup?style=flat-square&color=7FCFFA" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/github/last-commit/nram-ai/setup?style=flat-square&color=7FCFFA" alt="Last commit" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#supported-tools">Supported tools</a> &middot;
  <a href="https://nram.ai">nram.ai</a>
</p>

> Work in progress: under active development. Expect rough edges, and feedback is welcome.

## Quick Start

```bash
npx @nram/setup
```

Neural Ram is the continuity layer for everything you do with AI: one self-hosted server that keeps what mattered across every tool, every conversation, and every machine. This wizard wires your coding tools into it.

Your agents get two things out of it: a connection to your nram server (over MCP), and standing instructions that teach them to actually use it, recalling context at the start of every task and storing what they learn. Without the second half, an agent has memory tools it never thinks to touch; without the first, it has instructions about tools that do not exist. This wizard sets up both.

## Requirements

- Node.js 22 or newer
- A running [Neural Ram](https://github.com/nram-ai/nram) server (defaults to `http://localhost:8674`)

## What it does

The wizard walks you through five questions and then does the work:

1. **Scope.** User level (your machine-wide tool configs) or project level (files inside the current repository, shareable with your team).
2. **Tools.** Every supported tool is listed; the ones detected on your machine are preselected. At project level you can configure tools you do not have installed, because teammates might.
3. **Components.** The MCP connection, the agent instructions, or both (the default).
4. **Server.** Your nram base URL, asked once and used for both components: the MCP endpoint derives from it, and the canonical agent instructions are pulled from its public `/instructions` endpoint. Pass it up front with `--url` and the wizard notes the value and skips this question. Every run health-checks the server against `/v1/health` before a single file is touched.
5. **Authentication.** OAuth (recommended: capable tools discover your server and negotiate on their own, this wizard never sees a credential) or an nram API key.

Then it configures each selected tool and prints exactly what it did: every file written, everything skipped because it was already in place, and any step a tool requires you to finish by hand.

## Supported tools

| Tool | MCP connection | Agent instructions |
|---|---|---|
| Amp | `settings.json` | `AGENTS.md` |
| Antigravity | `mcp_config.json` (no MCP OAuth; use an API key) | `AGENTS.md` |
| Claude Code | `claude mcp add` | SessionStart hook |
| Codex | `config.toml` | SessionStart hook |
| Cursor | `mcp.json` | `.cursor/rules/` (project scope) |
| Droid (Factory) | `mcp.json` | `AGENTS.md` |
| GitHub Copilot CLI | `mcp-config.json` | `copilot-instructions.md` / `AGENTS.md` |
| Hermes | `config.yaml` | `AGENTS.md` (project scope) |
| Junie (JetBrains) | `mcp/mcp.json` | `AGENTS.md` |
| Kilo Code | `kilo.jsonc` | rules file |
| Kimi Code | `mcp.json` | not supported by Kimi yet |
| Kiro | `settings/mcp.json` | steering doc |
| OpenClaw | `openclaw.json` | workspace `AGENTS.md` |
| OpenCode | `opencode.json` | `AGENTS.md` |
| Pi | `mcp.json` | `AGENTS.md` |
| Trae | through Trae's own MCP UI | rules file (project scope) |
| VS Code | `.vscode/mcp.json` | instructions file |

Where a tool genuinely cannot do something (a scope it does not support, OAuth it has not implemented, an instructions file it will not read), the wizard says so plainly and prints what to do instead. It never writes a file the tool would ignore.

## How it treats your files

**It merges; it does not overwrite.** Existing config files are edited surgically: a JSON config gains one keyed entry, a TOML or YAML config gains one clearly marked block, and everything else in the file, comments included, survives byte for byte.

**It is idempotent.** Run it twice and the second run changes nothing; every action reports `skipped: already present`. Marker-fenced blocks are updated in place on reruns, never duplicated.

**It refuses rather than guesses.** A config file it cannot parse is left untouched, and you get a copy-paste snippet instead. Same for anything it cannot verify the tool actually supports.

**It keeps secrets off disk.** In API-key mode, configs reference the `NRAM_API_KEY` environment variable wherever the tool supports substitution; where it does not, you are told which header to add yourself. The key itself is never written to a config file.

## Flags

```
npx @nram/setup [options]

  -u, --url <url>       the base URL of your nram server (skips the prompt)
  --skip-mcp            do not register the nram MCP server
  --skip-instructions   do not inject the agent instructions
  -s, --session-start   fetch and print the agent instructions and exit
```

`--session-start` is the command the installed SessionStart hooks run (they carry `--url`, so each hook knows your server): its output lands in the agent's context at the start of every session, which keeps the memory protocol out of your CLAUDE.md and AGENTS.md files where hooks are supported, and always current because the text comes from your server, the single source of truth. Every successful fetch is cached at `~/.nram/cache/`; when the server is unreachable the hook serves that cached copy, then the copy in the nram source on GitHub, and as a last resort a short notice telling the agent to let you know the instructions could not be loaded. The hook never fails or blocks a session beyond a few bounded seconds.

## License

MIT
