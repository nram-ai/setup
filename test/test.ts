// Copyright (c) 2026, Brandon Lehmann <brandonlehmann@gmail.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcp_url, normalize_base_url } from '../src/helpers/url';
import {
    agents_md_result,
    read_json,
    upsert_json_array_entry,
    upsert_marker_block,
    upsert_own_file,
    upsert_session_start_hook,
    write_json
} from '../src/helpers/upsert';
import {
    builtin_notice,
    cache_path,
    fetch_instructions,
    resolve_instructions
} from '../src/helpers/instructions';
import { codex_mcp_block, configure_codex } from '../src/helpers/configure/codex';
import { configure_opencode, opencode_mcp_entry } from '../src/helpers/configure/opencode';
import { configure_cursor, cursor_mcp_entry, cursor_rule_file } from '../src/helpers/configure/cursor';
import { configure_amp } from '../src/helpers/configure/amp';
import { configure_antigravity } from '../src/helpers/configure/antigravity';
import { configure_copilot } from '../src/helpers/configure/copilot';
import { configure_droid, droid_mcp_entry } from '../src/helpers/configure/droid';
import { configure_grok, grok_mcp_block } from '../src/helpers/configure/grok';
import { configure_hermes, hermes_mcp_block } from '../src/helpers/configure/hermes';
import { configure_junie } from '../src/helpers/configure/junie';
import { configure_kilo, kilo_mcp_entry } from '../src/helpers/configure/kilo';
import { configure_kimi } from '../src/helpers/configure/kimi';
import { configure_kiro, kiro_mcp_entry, kiro_steering_file } from '../src/helpers/configure/kiro';
import { configure_openclaw } from '../src/helpers/configure/openclaw';
import { configure_pi } from '../src/helpers/configure/pi';
import { configure_trae } from '../src/helpers/configure/trae';
import { configure_vibe, vibe_mcp_block } from '../src/helpers/configure/vibe';
import { configure_vscode, vscode_instruction_file } from '../src/helpers/configure/vscode';
import { ActionResult, Scope, SetupOptions } from '../src/types';

const temp = (): string => mkdtempSync(join(tmpdir(), 'nram-setup-'));

// Hermetic stand-ins for the server-provided canonical text; the condensed
// fixture deliberately omits the **SESSION START** heading so rules-surface
// tests can assert the full instructions were not embedded
const INSTRUCTIONS_FIXTURE = '**SESSION START** call procedural_fetch before the first task.\n';

const RULES_FIXTURE = 'nram rules: call procedural_fetch at session start; recall before storing.\n';

const setup_options = (overrides: Partial<SetupOptions> = {}): SetupOptions => ({
    scope: Scope.USER,
    base_url: 'http://localhost:8674',
    mcp_url: 'http://localhost:8674/mcp',
    instructions: { full: INSTRUCTIONS_FIXTURE, condensed: RULES_FIXTURE },
    ...overrides
});

const result_for = (results: ActionResult[], action: string): ActionResult => {
    const found = results.find(result => result.action === action);

    assert.ok(found, `expected a "${action}" result, got: ${JSON.stringify(results)}`);

    return found;
};

const with_env = async (name: string, value: string, run: () => Promise<void>): Promise<void> => {
    const previous = process.env[name];

    process.env[name] = value;

    try {
        await run();
    } finally {
        if (previous === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = previous;
        }
    }
};

// homedir() consults USERPROFILE (Windows) / HOME (POSIX) at call time
const with_home = (dir: string, run: () => Promise<void>): Promise<void> =>
    with_env('USERPROFILE', dir, () => with_env('HOME', dir, run));

const with_cwd = async (dir: string, run: () => Promise<void>): Promise<void> => {
    const previous = process.cwd();

    process.chdir(dir);

    try {
        await run();
    } finally {
        process.chdir(previous);
    }
};

describe('url helpers', () => {
    it('normalizes by stripping trailing slashes', () => {
        assert.strictEqual(normalize_base_url('http://localhost:8674/'), 'http://localhost:8674');
        assert.strictEqual(normalize_base_url('  https://nram.example.com//  '), 'https://nram.example.com');
    });

    it('preserves a path prefix', () => {
        assert.strictEqual(normalize_base_url('https://example.com/nram/'), 'https://example.com/nram');
    });

    it('rejects non-http protocols, queries, and fragments', () => {
        assert.throws(() => normalize_base_url('ftp://example.com'));
        assert.throws(() => normalize_base_url('http://example.com/?a=1'));
        assert.throws(() => normalize_base_url('http://example.com/#x'));
        assert.throws(() => normalize_base_url('not a url'));
    });

    it('derives the MCP endpoint', () => {
        assert.strictEqual(mcp_url('http://localhost:8674'), 'http://localhost:8674/mcp');
    });
});

describe('upsert_marker_block', () => {
    const block = '[mcp_servers.nram]\nurl = "http://localhost:8674/mcp"';

    it('inserts into empty text', () => {
        const { text, changed } = upsert_marker_block('', block, 'hash');

        assert.ok(changed);
        assert.ok(text.startsWith('# >>> nram setup >>>\n'));
        assert.ok(text.endsWith('# <<< nram setup <<<\n'));
    });

    it('appends after existing content and leaves it untouched', () => {
        const existing = '# my comment\nmodel = "gpt-5"\n';

        const { text, changed } = upsert_marker_block(existing, block, 'hash');

        assert.ok(changed);
        assert.ok(text.startsWith('# my comment\nmodel = "gpt-5"\n'));
        assert.ok(text.includes(block));
    });

    it('is byte-stable on rerun', () => {
        const first = upsert_marker_block('# user content\n', block, 'hash');
        const second = upsert_marker_block(first.text, block, 'hash');

        assert.strictEqual(second.text, first.text);
        assert.strictEqual(second.changed, false);
    });

    it('replaces an existing block in place', () => {
        const first = upsert_marker_block('before\n', 'old content', 'hash');
        const second = upsert_marker_block(first.text, 'new content', 'hash');

        assert.ok(second.changed);
        assert.ok(second.text.includes('new content'));
        assert.ok(!second.text.includes('old content'));
        assert.ok(second.text.startsWith('before\n'));
    });

    it('prepends with the html style', () => {
        const { text } = upsert_marker_block('# My AGENTS.md\n', 'instructions here', 'html', 'prepend');

        assert.ok(text.startsWith('<!-- nram:start -->\n'));
        assert.ok(text.includes('# My AGENTS.md'));

        const again = upsert_marker_block(text, 'instructions here', 'html', 'prepend');

        assert.strictEqual(again.text, text);
        assert.strictEqual(again.changed, false);
    });
});

describe('upsert_session_start_hook', () => {
    const base_url = 'http://localhost:8674';

    const command = 'npx -y @nram-ai/setup-agents --session-start --url http://localhost:8674';

    it('adds the hook to an empty configuration', () => {
        const { config, changed } = upsert_session_start_hook({}, base_url);

        assert.ok(changed);
        assert.strictEqual(config.hooks.SessionStart.length, 1);
        assert.strictEqual(config.hooks.SessionStart[0].hooks[0].command, command);
    });

    it('preserves unrelated hooks', () => {
        const existing = {
            model: 'opus',
            hooks: {
                SessionStart: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'node -e "console.log(1)"' }]
                }],
                SessionEnd: [{ matcher: '', hooks: [{ type: 'command', command: 'cleanup.sh' }] }]
            }
        };

        const { config, changed } = upsert_session_start_hook(existing, base_url);

        assert.ok(changed);
        assert.strictEqual(config.model, 'opus');
        assert.strictEqual(config.hooks.SessionStart.length, 2);
        assert.strictEqual(config.hooks.SessionEnd.length, 1);
        assert.strictEqual(config.hooks.SessionStart[0].hooks[0].command, 'node -e "console.log(1)"');
    });

    it('does not double-add', () => {
        const { config } = upsert_session_start_hook({}, base_url);
        const second = upsert_session_start_hook(config, base_url);

        assert.strictEqual(second.changed, false);
        assert.strictEqual(second.config.hooks.SessionStart.length, 1);
    });

    it('replaces an outdated command in place', () => {
        // the URL-less command written by older package versions
        const existing = {
            hooks: {
                SessionStart: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'npx -y @nram-ai/setup-agents --session-start' }]
                }]
            }
        };

        const upgraded = upsert_session_start_hook(existing, base_url);

        assert.ok(upgraded.changed);
        assert.strictEqual(upgraded.config.hooks.SessionStart.length, 1);
        assert.strictEqual(upgraded.config.hooks.SessionStart[0].hooks[0].command, command);

        // a rerun pointing at a different server replaces rather than skips
        const moved = upsert_session_start_hook(upgraded.config, 'http://other:9999');

        assert.ok(moved.changed);
        assert.strictEqual(moved.config.hooks.SessionStart.length, 1);
        assert.strictEqual(moved.config.hooks.SessionStart[0].hooks[0].command,
            'npx -y @nram-ai/setup-agents --session-start --url http://other:9999');
    });
});

describe('json helpers', () => {
    it('round-trips and reports missing files as empty', () => {
        const dir = temp();
        const path = join(dir, 'nested', 'config.json');

        const missing = read_json(path);

        assert.ok(missing.ok && missing.value === undefined && !missing.existed);

        write_json(path, { a: 1 });

        const loaded = read_json(path);

        assert.ok(loaded.ok && loaded.existed);
        assert.deepStrictEqual(loaded.ok ? loaded.value : undefined, { a: 1 });
    });

    it('flags unparseable files instead of throwing', () => {
        const dir = temp();
        const path = join(dir, 'broken.json');

        writeFileSync(path, '{ not json');

        const result = read_json(path);

        assert.strictEqual(result.ok, false);
    });
});

describe('instructions', () => {
    // an unroutable endpoint: connections are refused immediately
    const DEAD = 'http://127.0.0.1:1';

    const with_server = async (
        handler: (request: IncomingMessage, response: ServerResponse) => void,
        run: (base: string) => Promise<void>
    ): Promise<void> => {
        const server = createServer(handler);

        await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening));

        const { port } = server.address() as AddressInfo;

        try {
            await run(`http://127.0.0.1:${port}`);
        } finally {
            server.closeAllConnections();

            await new Promise(closed => server.close(closed));
        }
    };

    // mimics the nram server's /instructions endpoint and, on other paths,
    // the GitHub raw fallback files (for tests that redirect the fallback base)
    const serve_canonical = (request: IncomingMessage, response: ServerResponse): void => {
        const url = new URL(request.url ?? '/', 'http://localhost');

        if (url.pathname === '/instructions') {
            const format = url.searchParams.get('format') ?? '';

            if (format === '' || format === 'agents' || format === 'claude') {
                response.end('full canonical text');
            } else if (format === 'cursor') {
                response.end('condensed canonical text');
            } else {
                response.statusCode = 400;
                response.end(`unknown format: ${format}`);
            }

            return;
        }

        if (url.pathname.endsWith('/agent-instructions.md')) {
            response.end('github full text');
        } else if (url.pathname.endsWith('/cursor.md')) {
            response.end('github condensed text');
        } else {
            response.statusCode = 404;
            response.end('not found');
        }
    };

    it('fetches both formats from the server and writes the cache', async () => {
        await with_env('NRAM_CACHE_DIR', temp(), () =>
            with_server(serve_canonical, async (base) => {
                assert.strictEqual(await fetch_instructions(base, 'full', 2_000), 'full canonical text');
                assert.strictEqual(await fetch_instructions(base, 'condensed', 2_000), 'condensed canonical text');

                const resolved = await resolve_instructions(base, 'full', 2_000);

                assert.strictEqual(resolved.source, 'server');
                assert.strictEqual(resolved.text, 'full canonical text');
                assert.strictEqual(readFileSync(cache_path('full'), 'utf8'), 'full canonical text');
            }));
    });

    it('rejects HTTP errors and empty bodies', async () => {
        await with_server((_, response) => {
            response.statusCode = 500;
            response.end('boom');
        }, async (base) => {
            await assert.rejects(fetch_instructions(base, 'full', 2_000));
        });

        await with_server((_, response) => response.end(''), async (base) => {
            await assert.rejects(fetch_instructions(base, 'full', 2_000));
        });
    });

    it('serves the cache when the server is unreachable', async () => {
        await with_env('NRAM_CACHE_DIR', temp(), () =>
            with_env('NRAM_INSTRUCTIONS_FALLBACK_BASE', DEAD, async () => {
                writeFileSync(cache_path('full'), 'cached text');

                const resolved = await resolve_instructions(DEAD, 'full', 500);

                assert.strictEqual(resolved.source, 'cache');
                assert.strictEqual(resolved.text, 'cached text');
            }));
    });

    it('falls back to GitHub on a cold cache and caches the result', async () => {
        await with_env('NRAM_CACHE_DIR', temp(), () =>
            with_server(serve_canonical, github =>
                with_env('NRAM_INSTRUCTIONS_FALLBACK_BASE', github, async () => {
                    const resolved = await resolve_instructions(DEAD, 'full', 1_000);

                    assert.strictEqual(resolved.source, 'github');
                    assert.strictEqual(resolved.text, 'github full text');
                    assert.strictEqual(readFileSync(cache_path('full'), 'utf8'), 'github full text');
                })));
    });

    it('degrades to the built-in notice when nothing is reachable', async () => {
        await with_env('NRAM_CACHE_DIR', temp(), () =>
            with_env('NRAM_INSTRUCTIONS_FALLBACK_BASE', DEAD, async () => {
                const resolved = await resolve_instructions(DEAD, 'full', 500);

                assert.strictEqual(resolved.source, 'builtin');
                assert.strictEqual(resolved.text, builtin_notice('full'));
            }));
    });

    it('skips the server when no base URL is known', async () => {
        await with_env('NRAM_CACHE_DIR', temp(), async () => {
            writeFileSync(cache_path('full'), 'cached text');

            const resolved = await resolve_instructions(undefined, 'full', 500);

            assert.strictEqual(resolved.source, 'cache');
            assert.strictEqual(resolved.text, 'cached text');
        });
    });

    it('aborts a hanging server within the timeout budget', async () => {
        await with_env('NRAM_CACHE_DIR', temp(), () =>
            with_env('NRAM_INSTRUCTIONS_FALLBACK_BASE', DEAD, () =>
                with_server(() => {
                    // accept the connection and never respond
                }, async (base) => {
                    const started = Date.now();

                    const resolved = await resolve_instructions(base, 'full', 300);

                    assert.ok(Date.now() - started < 5_000, 'the timeout did not bound the request');
                    assert.strictEqual(resolved.source, 'builtin');
                })));
    });
});

describe('configure_codex', () => {
    const with_codex_home = (home: string, run: () => Promise<void>): Promise<void> =>
        with_env('CODEX_HOME', home, run);

    it('writes config.toml and hooks.json, then reruns idempotently', async () => {
        const home = temp();

        await with_codex_home(home, async () => {
            const first = await configure_codex(setup_options());

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'SessionStart hook').kind, 'written');

            const config_after_first = readFileSync(join(home, 'config.toml'), 'utf8');
            const hooks_after_first = readFileSync(join(home, 'hooks.json'), 'utf8');

            assert.ok(config_after_first.includes('[mcp_servers.nram]'));
            assert.ok(hooks_after_first.includes('@nram-ai/setup-agents'));
            assert.ok(hooks_after_first.includes('--url http://localhost:8674'));

            const second = await configure_codex(setup_options());

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'SessionStart hook').kind, 'skipped');

            assert.strictEqual(readFileSync(join(home, 'config.toml'), 'utf8'), config_after_first);
            assert.strictEqual(readFileSync(join(home, 'hooks.json'), 'utf8'), hooks_after_first);
        });
    });

    it('preserves user comments and content outside the markers', async () => {
        const home = temp();

        const original = '# my precious comment\nmodel = "o5"\n\n[projects."D:\\\\devbox"]\ntrust_level = "trusted"\n';

        writeFileSync(join(home, 'config.toml'), original);

        await with_codex_home(home, async () => {
            await configure_codex(setup_options());

            const updated = readFileSync(join(home, 'config.toml'), 'utf8');

            assert.ok(updated.startsWith(original.trimEnd()));
            assert.ok(updated.includes('# my precious comment'));
            assert.ok(updated.includes('[mcp_servers.nram]'));
        });
    });

    it('skips when mcp_servers.nram exists outside the markers', async () => {
        const home = temp();

        const original = '[mcp_servers.nram]\nurl = "http://other:1234/mcp"\n';

        writeFileSync(join(home, 'config.toml'), original);

        await with_codex_home(home, async () => {
            const results = await configure_codex(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'skipped');
            assert.strictEqual(readFileSync(join(home, 'config.toml'), 'utf8'), original);
        });
    });

    it('leaves an unparseable config.toml untouched and reports a manual step', async () => {
        const home = temp();

        const original = 'this is = = not toml [';

        writeFileSync(join(home, 'config.toml'), original);

        await with_codex_home(home, async () => {
            const results = await configure_codex(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'manual');
            assert.strictEqual(readFileSync(join(home, 'config.toml'), 'utf8'), original);
        });
    });

    it('references the API key via environment variable only', () => {
        const block = codex_mcp_block('http://localhost:8674/mcp', 'nram_k_abc123');

        assert.ok(block.includes('bearer_token_env_var = "NRAM_API_KEY"'));
        assert.ok(!block.includes('nram_k_abc123'));
    });

    it('honors component gating', async () => {
        const mcp_only_home = temp();

        await with_codex_home(mcp_only_home, async () => {
            const results = await configure_codex(setup_options({ instructions: undefined }));

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].action, 'MCP registration');
            assert.ok(!existsSync(join(mcp_only_home, 'hooks.json')));
        });

        const hooks_only_home = temp();

        await with_codex_home(hooks_only_home, async () => {
            const results = await configure_codex(setup_options({ mcp_url: undefined }));

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].action, 'SessionStart hook');
            assert.ok(!existsSync(join(hooks_only_home, 'config.toml')));
        });
    });
});

describe('configure_opencode', () => {
    const with_xdg = (dir: string, run: () => Promise<void>): Promise<void> =>
        with_env('XDG_CONFIG_HOME', dir, run);

    it('writes opencode.json and AGENTS.md, then reruns idempotently', async () => {
        const dir = temp();

        await with_xdg(dir, async () => {
            const first = await configure_opencode(setup_options());

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'Agent instructions').kind, 'written');

            const config_path = join(dir, 'opencode', 'opencode.json');
            const agents_path = join(dir, 'opencode', 'AGENTS.md');

            const config = JSON.parse(readFileSync(config_path, 'utf8'));

            assert.deepStrictEqual(config.mcp.nram, {
                type: 'remote',
                url: 'http://localhost:8674/mcp',
                enabled: true
            });

            assert.ok(readFileSync(agents_path, 'utf8').includes('procedural_fetch'));

            const config_text = readFileSync(config_path, 'utf8');
            const agents_text = readFileSync(agents_path, 'utf8');

            const second = await configure_opencode(setup_options());

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'Agent instructions').kind, 'skipped');

            assert.strictEqual(readFileSync(config_path, 'utf8'), config_text);
            assert.strictEqual(readFileSync(agents_path, 'utf8'), agents_text);
        });
    });

    it('preserves unrelated configuration and prepends to an existing AGENTS.md', async () => {
        const dir = temp();

        const config_path = join(dir, 'opencode', 'opencode.json');
        const agents_path = join(dir, 'opencode', 'AGENTS.md');

        write_json(config_path, { theme: 'dark', mcp: { other: { type: 'local', command: ['x'] } } });

        writeFileSync(agents_path, '# My rules\n\nBe nice.\n');

        await with_xdg(dir, async () => {
            await configure_opencode(setup_options());

            const config = JSON.parse(readFileSync(config_path, 'utf8'));

            assert.strictEqual(config.theme, 'dark');
            assert.ok(config.mcp.other);
            assert.ok(config.mcp.nram);

            const agents = readFileSync(agents_path, 'utf8');

            assert.ok(agents.startsWith('<!-- nram:start -->'));
            assert.ok(agents.includes('# My rules'));
        });
    });

    it('leaves unparseable opencode.json untouched and reports a manual step', async () => {
        const dir = temp();

        const config_path = join(dir, 'opencode', 'opencode.json');

        write_json(config_path, {});

        const original = '// jsonc comment\n{ "mcp": {} }\n';

        writeFileSync(config_path, original);

        await with_xdg(dir, async () => {
            const results = await configure_opencode(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'manual');
            assert.strictEqual(readFileSync(config_path, 'utf8'), original);
        });
    });

    it('uses env substitution for the API key', () => {
        const entry = opencode_mcp_entry('http://localhost:8674/mcp', 'nram_k_abc123');

        assert.strictEqual(entry.headers.Authorization, 'Bearer ${env:NRAM_API_KEY}');
    });
});

describe('configure_cursor', () => {
    it('writes mcp.json and the rule file at project scope, then reruns idempotently', async () => {
        const home = temp();

        const previous = process.cwd();

        process.chdir(home);

        try {
            const first = await configure_cursor(setup_options({ scope: Scope.PROJECT }));

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8'));

            assert.deepStrictEqual(config.mcpServers.nram, { url: 'http://localhost:8674/mcp' });

            const rule = readFileSync(join(home, '.cursor', 'rules', 'nram.mdc'), 'utf8');

            assert.ok(rule.startsWith('---\n'));
            assert.ok(rule.includes('alwaysApply: true'));
            assert.ok(rule.includes('procedural_fetch'));
            // rules surfaces carry the condensed text, not the full instructions
            assert.ok(!rule.includes('**SESSION START**'));

            const second = await configure_cursor(setup_options({ scope: Scope.PROJECT }));

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'Agent instructions').kind, 'skipped');
        } finally {
            process.chdir(previous);
        }
    });

    it('builds entries with env-substituted API keys and a valid rule file', async () => {
        const entry = cursor_mcp_entry('http://localhost:8674/mcp', 'nram_k_abc123');

        assert.strictEqual(entry.headers.Authorization, 'Bearer ${env:NRAM_API_KEY}');
        assert.ok(!JSON.stringify(entry).includes('nram_k_abc123'));

        const rule = cursor_rule_file('content');

        assert.ok(rule.startsWith('---\n'));
        assert.strictEqual((rule.match(/^---$/gm) ?? []).length, 2);
        assert.ok(rule.endsWith('content\n'));
    });

    it('reports the GUI-only limitation for user-scope instructions without touching files', async () => {
        const results = await configure_cursor(setup_options({ mcp_url: undefined, scope: Scope.USER }));

        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].action, 'Agent instructions');
        assert.strictEqual(results[0].kind, 'skipped');
    });
});

describe('upsert_json_array_entry', () => {
    const entry = { name: 'nram', type: 'http', url: 'http://localhost:8674/mcp' };

    it('creates, appends, replaces by name, and skips identical', () => {
        const path = join(temp(), 'mcp.json');

        assert.strictEqual(upsert_json_array_entry(path, ['servers'], entry).kind, 'written');
        assert.strictEqual(upsert_json_array_entry(path, ['servers'], entry).kind, 'skipped');

        const changed = { ...entry, url: 'http://other:1/mcp' };

        assert.strictEqual(upsert_json_array_entry(path, ['servers'], changed).kind, 'updated');

        const config = JSON.parse(readFileSync(path, 'utf8'));

        assert.strictEqual(config.servers.length, 1);
        assert.strictEqual(config.servers[0].url, 'http://other:1/mcp');
    });

    it('preserves unrelated array elements', () => {
        const path = join(temp(), 'mcp.json');

        write_json(path, { servers: [{ name: 'other', url: 'http://x/mcp' }] });

        upsert_json_array_entry(path, ['servers'], entry);

        const config = JSON.parse(readFileSync(path, 'utf8'));

        assert.strictEqual(config.servers.length, 2);
        assert.strictEqual(config.servers[0].name, 'other');
    });

    it('leaves an unparseable file untouched', () => {
        const path = join(temp(), 'mcp.json');

        writeFileSync(path, '{ nope');

        assert.strictEqual(upsert_json_array_entry(path, ['servers'], entry).kind, 'manual');
        assert.strictEqual(readFileSync(path, 'utf8'), '{ nope');
    });
});

describe('upsert_own_file and agents_md_result', () => {
    it('reports written, skipped, then updated transitions', () => {
        const path = join(temp(), 'rules', 'nram.md');

        assert.strictEqual(upsert_own_file(path, 'one', 'Agent instructions').kind, 'written');
        assert.strictEqual(upsert_own_file(path, 'one', 'Agent instructions').kind, 'skipped');
        assert.strictEqual(upsert_own_file(path, 'two', 'Agent instructions').kind, 'updated');
    });

    it('upserts the shared AGENTS.md block idempotently', () => {
        const path = join(temp(), 'AGENTS.md');

        writeFileSync(path, '# Mine\n');

        assert.strictEqual(agents_md_result(path, INSTRUCTIONS_FIXTURE).kind, 'updated');
        assert.strictEqual(agents_md_result(path, INSTRUCTIONS_FIXTURE).kind, 'skipped');

        const text = readFileSync(path, 'utf8');

        assert.ok(text.startsWith('<!-- nram:start -->'));
        assert.ok(text.includes('# Mine'));
        assert.strictEqual((text.match(/<!-- nram:start -->/g) ?? []).length, 1);
    });
});

describe('configure_amp', () => {
    it('writes settings.json and AGENTS.md at user scope, then reruns idempotently', async () => {
        const dir = temp();

        await with_env('XDG_CONFIG_HOME', dir, async () => {
            const first = await configure_amp(setup_options());

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(dir, 'amp', 'settings.json'), 'utf8'));

            assert.deepStrictEqual(config['amp.mcpServers'].nram, { url: 'http://localhost:8674/mcp' });
            assert.ok(readFileSync(join(dir, 'amp', 'AGENTS.md'), 'utf8').includes('procedural_fetch'));

            const second = await configure_amp(setup_options());

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'Agent instructions').kind, 'skipped');
        });
    });
});

describe('configure_antigravity', () => {
    it('writes serverUrl-shaped config with an OAuth caveat at user scope', async () => {
        const home = temp();

        await with_home(home, async () => {
            const results = await configure_antigravity(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(results, 'Authentication').kind, 'manual');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(home, '.gemini', 'antigravity', 'mcp_config.json'), 'utf8'));

            assert.deepStrictEqual(config.mcpServers.nram, { serverUrl: 'http://localhost:8674/mcp' });
            assert.ok(readFileSync(join(home, '.gemini', 'AGENTS.md'), 'utf8').includes('procedural_fetch'));
        });
    });

    it('skips project-scope MCP', async () => {
        const results = await configure_antigravity(setup_options({ scope: Scope.PROJECT, instructions: undefined }));

        assert.strictEqual(result_for(results, 'MCP registration').kind, 'skipped');
    });
});

describe('configure_openclaw', () => {
    it('writes openclaw.json and the workspace AGENTS.md at user scope', async () => {
        const home = temp();

        await with_home(home, async () => {
            const results = await configure_openclaw(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(home, '.openclaw', 'openclaw.json'), 'utf8'));

            assert.deepStrictEqual(config.mcp.servers.nram, { type: 'http', url: 'http://localhost:8674/mcp' });
            assert.ok(readFileSync(join(home, '.openclaw', 'workspace', 'AGENTS.md'), 'utf8')
                .includes('procedural_fetch'));
        });
    });

    it('skips everything at project scope', async () => {
        const results = await configure_openclaw(setup_options({ scope: Scope.PROJECT }));

        assert.ok(results.every(result => result.kind === 'skipped'));
        assert.strictEqual(results.length, 2);
    });
});

describe('configure_copilot', () => {
    it('writes mcp-config.json and copilot-instructions.md at user scope', async () => {
        const dir = temp();

        await with_env('COPILOT_HOME', dir, async () => {
            const results = await configure_copilot(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(dir, 'mcp-config.json'), 'utf8'));

            assert.deepStrictEqual(config.servers.nram, { type: 'http', url: 'http://localhost:8674/mcp' });
            assert.ok(readFileSync(join(dir, 'copilot-instructions.md'), 'utf8').includes('procedural_fetch'));
        });
    });
});

describe('configure_droid', () => {
    it('merges the servers array and AGENTS.md, then reruns idempotently', async () => {
        const home = temp();

        await with_home(home, async () => {
            const first = await configure_droid(setup_options({ api_key: 'nram_k_abc123' }));

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'API key').kind, 'manual');
            assert.strictEqual(result_for(first, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(home, '.factory', 'mcp.json'), 'utf8'));

            assert.strictEqual(config.servers[0].headers.Authorization, 'Bearer ${NRAM_API_KEY}');
            assert.ok(!JSON.stringify(config).includes('nram_k_abc123'));

            const second = await configure_droid(setup_options({ api_key: 'nram_k_abc123' }));

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
        });
    });

    it('builds entries keyed by name', () => {
        assert.strictEqual(droid_mcp_entry('http://x/mcp').name, 'nram');
        assert.strictEqual(droid_mcp_entry('http://x/mcp').headers, undefined);
    });
});

describe('configure_hermes', () => {
    it('appends the YAML block, preserves comments, and reruns idempotently', async () => {
        const home = temp();

        await with_home(home, async () => {
            mkdirSync(join(home, '.hermes'), { recursive: true });

            writeFileSync(join(home, '.hermes', 'config.yaml'), '# user comment\nmodel: hermes-4\n');

            const first = await configure_hermes(setup_options());

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'updated');

            const text = readFileSync(join(home, '.hermes', 'config.yaml'), 'utf8');

            assert.ok(text.startsWith('# user comment\nmodel: hermes-4\n'));
            assert.ok(text.includes('mcp_servers:'));

            const second = await configure_hermes(setup_options());

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(readFileSync(join(home, '.hermes', 'config.yaml'), 'utf8'), text);
        });
    });

    it('refuses to touch a config.yaml that already has mcp_servers outside the markers', async () => {
        const home = temp();

        await with_home(home, async () => {
            mkdirSync(join(home, '.hermes'), { recursive: true });

            const original = 'mcp_servers:\n  other:\n    url: "http://x/mcp"\n';

            writeFileSync(join(home, '.hermes', 'config.yaml'), original);

            const results = await configure_hermes(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'manual');
            assert.strictEqual(readFileSync(join(home, '.hermes', 'config.yaml'), 'utf8'), original);
        });
    });

    it('keeps the API key out of the block', () => {
        const block = hermes_mcp_block('http://x/mcp', 'nram_k_abc123');

        assert.ok(block.includes('Bearer ${NRAM_API_KEY}'));
        assert.ok(!block.includes('nram_k_abc123'));
    });
});

describe('configure_grok', () => {
    it('writes config.toml and hooks/nram.json at user scope, then reruns idempotently', async () => {
        const home = temp();

        await with_home(home, async () => {
            const first = await configure_grok(setup_options());

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'SessionStart hook').kind, 'written');

            const config_text = readFileSync(join(home, '.grok', 'config.toml'), 'utf8');
            const hooks_text = readFileSync(join(home, '.grok', 'hooks', 'nram.json'), 'utf8');

            assert.ok(config_text.includes('[mcp_servers.nram]'));
            assert.ok(hooks_text.includes('@nram-ai/setup-agents'));
            assert.ok(hooks_text.includes('--url http://localhost:8674'));

            const second = await configure_grok(setup_options());

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'SessionStart hook').kind, 'skipped');

            assert.strictEqual(readFileSync(join(home, '.grok', 'config.toml'), 'utf8'), config_text);
            assert.strictEqual(readFileSync(join(home, '.grok', 'hooks', 'nram.json'), 'utf8'), hooks_text);

            // user-scope hooks are always trusted; no trust note expected
            assert.ok(!first.some(result => result.action === 'Hook trust'));
        });
    });

    it('skips when mcp_servers.nram exists outside the markers', async () => {
        const home = temp();

        await with_home(home, async () => {
            mkdirSync(join(home, '.grok'), { recursive: true });

            const original = '[mcp_servers.nram]\nurl = "http://other:1234/mcp"\n';

            writeFileSync(join(home, '.grok', 'config.toml'), original);

            const results = await configure_grok(setup_options({ instructions: undefined }));

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'skipped');
            assert.strictEqual(readFileSync(join(home, '.grok', 'config.toml'), 'utf8'), original);
        });
    });

    it('adds the hook-trust note at project scope only', async () => {
        const dir = temp();

        await with_cwd(dir, async () => {
            const results = await configure_grok(setup_options({ scope: Scope.PROJECT, mcp_url: undefined }));

            assert.strictEqual(result_for(results, 'SessionStart hook').kind, 'written');
            assert.strictEqual(result_for(results, 'Hook trust').kind, 'manual');
            assert.ok(result_for(results, 'Hook trust').detail.includes('/hooks-trust'));
            assert.ok(existsSync(join(dir, '.grok', 'hooks', 'nram.json')));
        });
    });

    it('references the API key via environment variable only', () => {
        const block = grok_mcp_block('http://localhost:8674/mcp', 'nram_k_abc123');

        assert.ok(block.includes('Bearer ${NRAM_API_KEY}'));
        assert.ok(!block.includes('nram_k_abc123'));
    });
});

describe('configure_junie', () => {
    it('writes mcp/mcp.json and AGENTS.md at user scope', async () => {
        const home = temp();

        await with_home(home, async () => {
            const results = await configure_junie(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.ok(result_for(results, 'MCP registration').detail.includes('JUNIE-1331'));
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(home, '.junie', 'mcp', 'mcp.json'), 'utf8'));

            assert.deepStrictEqual(config.mcpServers.nram, { url: 'http://localhost:8674/mcp' });
        });
    });
});

describe('configure_kilo', () => {
    it('writes kilo.jsonc, the global rule file, and the instructions reference', async () => {
        const dir = temp();

        await with_env('XDG_CONFIG_HOME', dir, async () => {
            const first = await configure_kilo(setup_options({ api_key: 'nram_k_abc123' }));

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'Agent instructions').kind, 'written');
            assert.strictEqual(result_for(first, 'Rule reference').kind, 'updated');

            const config = JSON.parse(readFileSync(join(dir, 'kilo', 'kilo.jsonc'), 'utf8'));

            assert.strictEqual(config.mcp.nram.type, 'streamable-http');
            assert.strictEqual(config.mcp.nram.headers.Authorization, 'Bearer {env:NRAM_API_KEY}');
            assert.strictEqual(config.instructions.length, 1);
            assert.ok(config.instructions[0].endsWith('rules/nram.md'));

            const second = await configure_kilo(setup_options({ api_key: 'nram_k_abc123' }));

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'Rule reference').kind, 'skipped');
        });
    });

    it('builds env-substituted entries', () => {
        assert.ok(!JSON.stringify(kilo_mcp_entry('http://x/mcp', 'nram_k_abc')).includes('nram_k_abc'));
    });
});

describe('configure_kimi', () => {
    it('writes mcp.json with an OAuth note and skips instructions', async () => {
        const home = temp();

        await with_home(home, async () => {
            const results = await configure_kimi(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.ok(result_for(results, 'Authentication').detail.includes('kimi mcp auth nram'));
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'skipped');

            const config = JSON.parse(readFileSync(join(home, '.kimi', 'mcp.json'), 'utf8'));

            assert.deepStrictEqual(config.mcpServers.nram, { url: 'http://localhost:8674/mcp' });
        });
    });
});

describe('configure_kiro', () => {
    it('writes settings/mcp.json and the steering doc', async () => {
        const dir = temp();

        await with_env('KIRO_HOME', dir, async () => {
            const results = await configure_kiro(setup_options({ api_key: 'nram_k_abc123' }));

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(dir, 'settings', 'mcp.json'), 'utf8'));

            assert.deepStrictEqual(config.mcpServers.nram, {
                url: 'http://localhost:8674/mcp',
                headers: { Authorization: 'Bearer ${NRAM_API_KEY}' }
            });

            const steering = readFileSync(join(dir, 'steering', 'nram.md'), 'utf8');

            assert.ok(steering.startsWith('---\ninclusion: always\n---\n'));
            assert.ok(steering.includes('procedural_fetch'));
        });
    });

    it('builds entries without a type field', () => {
        assert.deepStrictEqual(Object.keys(kiro_mcp_entry('http://x/mcp')), ['url']);
        assert.ok(kiro_steering_file('body').includes('inclusion: always'));
    });
});

describe('configure_pi', () => {
    it('writes the agent mcp.json and AGENTS.md at user scope', async () => {
        const home = temp();

        await with_home(home, async () => {
            const results = await configure_pi(setup_options());

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(home, '.pi', 'agent', 'mcp.json'), 'utf8'));

            assert.deepStrictEqual(config.mcpServers.nram, { url: 'http://localhost:8674/mcp' });
            assert.ok(readFileSync(join(home, '.pi', 'agent', 'AGENTS.md'), 'utf8').includes('procedural_fetch'));
        });
    });
});

describe('configure_trae', () => {
    it('reports MCP as a manual UI step and writes project rules', async () => {
        const dir = temp();

        await with_cwd(dir, async () => {
            const results = await configure_trae(setup_options({ scope: Scope.PROJECT }));

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'manual');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');
            assert.ok(readFileSync(join(dir, '.trae', 'rules', 'nram.md'), 'utf8').includes('procedural_fetch'));
        });
    });

    it('skips user-scope instructions with guidance', async () => {
        const results = await configure_trae(setup_options({ mcp_url: undefined, scope: Scope.USER }));

        assert.strictEqual(result_for(results, 'Agent instructions').kind, 'skipped');
    });
});

describe('configure_vibe', () => {
    const with_vibe_home = (home: string, run: () => Promise<void>): Promise<void> =>
        with_env('VIBE_HOME', home, run);

    it('writes config.toml and AGENTS.md at user scope, then reruns idempotently', async () => {
        const home = temp();

        await with_vibe_home(home, async () => {
            const first = await configure_vibe(setup_options());

            assert.strictEqual(result_for(first, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(first, 'Agent instructions').kind, 'written');

            const config_text = readFileSync(join(home, 'config.toml'), 'utf8');
            const agents_text = readFileSync(join(home, 'AGENTS.md'), 'utf8');

            assert.ok(config_text.includes('[[mcp_servers]]'));
            assert.ok(config_text.includes('name = "nram"'));
            assert.ok(config_text.includes('transport = "streamable-http"'));
            assert.ok(agents_text.includes('procedural_fetch'));

            const second = await configure_vibe(setup_options());

            assert.strictEqual(result_for(second, 'MCP registration').kind, 'skipped');
            assert.strictEqual(result_for(second, 'Agent instructions').kind, 'skipped');

            assert.strictEqual(readFileSync(join(home, 'config.toml'), 'utf8'), config_text);
            assert.strictEqual(readFileSync(join(home, 'AGENTS.md'), 'utf8'), agents_text);
        });
    });

    it('appends to an existing array of MCP servers and preserves comments', async () => {
        const home = temp();

        const original = '# my comment\n[[mcp_servers]]\nname = "other"\ntransport = "stdio"\ncommand = "x"\n';

        writeFileSync(join(home, 'config.toml'), original);

        await with_vibe_home(home, async () => {
            const results = await configure_vibe(setup_options({ instructions: undefined }));

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'updated');

            const updated = readFileSync(join(home, 'config.toml'), 'utf8');

            assert.ok(updated.startsWith(original.trimEnd()));
            assert.ok(updated.includes('# my comment'));
            assert.ok(updated.includes('name = "nram"'));
        });
    });

    it('skips when an entry named nram exists outside the markers', async () => {
        const home = temp();

        const original = '[[mcp_servers]]\nname = "nram"\ntransport = "http"\nurl = "http://other:1234/mcp"\n';

        writeFileSync(join(home, 'config.toml'), original);

        await with_vibe_home(home, async () => {
            const results = await configure_vibe(setup_options({ instructions: undefined }));

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'skipped');
            assert.strictEqual(readFileSync(join(home, 'config.toml'), 'utf8'), original);
        });
    });

    it('refuses to create a project config.toml but updates an existing one', async () => {
        const dir = temp();

        await with_cwd(dir, async () => {
            // a fresh project config would shadow the user-level file entirely
            const missing = await configure_vibe(setup_options({ scope: Scope.PROJECT, instructions: undefined }));

            assert.strictEqual(result_for(missing, 'MCP registration').kind, 'manual');
            assert.ok(!existsSync(join(dir, '.vibe', 'config.toml')));

            mkdirSync(join(dir, '.vibe'), { recursive: true });

            writeFileSync(join(dir, '.vibe', 'config.toml'), 'model = "devstral"\n');

            const present = await configure_vibe(setup_options({ scope: Scope.PROJECT }));

            assert.strictEqual(result_for(present, 'MCP registration').kind, 'updated');
            assert.strictEqual(result_for(present, 'Agent instructions').kind, 'written');

            assert.ok(readFileSync(join(dir, '.vibe', 'config.toml'), 'utf8').startsWith('model = "devstral"'));
            // project-scope instructions land in the shared repository-root AGENTS.md
            assert.ok(readFileSync(join(dir, 'AGENTS.md'), 'utf8').includes('procedural_fetch'));
        });
    });

    it('references the API key via environment variable only', () => {
        const block = vibe_mcp_block('http://localhost:8674/mcp', 'nram_k_abc123');

        assert.ok(block.includes('api_key_env = "NRAM_API_KEY"'));
        assert.ok(block.includes('api_key_format = "Bearer {token}"'));
        assert.ok(!block.includes('nram_k_abc123'));
    });
});

describe('configure_vscode', () => {
    it('writes .vscode/mcp.json and the instructions file at project scope', async () => {
        const dir = temp();

        await with_cwd(dir, async () => {
            const results = await configure_vscode(setup_options({ scope: Scope.PROJECT }));

            assert.strictEqual(result_for(results, 'MCP registration').kind, 'written');
            assert.strictEqual(result_for(results, 'Agent instructions').kind, 'written');

            const config = JSON.parse(readFileSync(join(dir, '.vscode', 'mcp.json'), 'utf8'));

            assert.deepStrictEqual(config.servers.nram, { type: 'http', url: 'http://localhost:8674/mcp' });

            const instructions = readFileSync(
                join(dir, '.github', 'instructions', 'nram.instructions.md'), 'utf8');

            assert.ok(instructions.startsWith('---\napplyTo: \'**\'\n'));
            assert.ok(instructions.includes('procedural_fetch'));
        });
    });

    it('reports user-scope MCP as a Command Palette step', async () => {
        const results = await configure_vscode(setup_options({ scope: Scope.USER, instructions: undefined }));

        assert.strictEqual(result_for(results, 'MCP registration').kind, 'manual');
        assert.ok(result_for(results, 'MCP registration').detail.includes('MCP: Open User Configuration'));
    });

    it('builds a frontmatter-fenced instructions file', () => {
        assert.strictEqual((vscode_instruction_file('x').match(/^---$/gm) ?? []).length, 2);
    });
});

describe('shared project AGENTS.md', () => {
    it('dedupes across harnesses configuring the same repository', async () => {
        const dir = temp();

        await with_cwd(dir, async () => {
            const opencode = await configure_opencode(setup_options({ scope: Scope.PROJECT, mcp_url: undefined }));

            assert.strictEqual(result_for(opencode, 'Agent instructions').kind, 'written');

            const droid = await configure_droid(setup_options({ scope: Scope.PROJECT, mcp_url: undefined }));

            assert.strictEqual(result_for(droid, 'Agent instructions').kind, 'skipped');

            const text = readFileSync(join(dir, 'AGENTS.md'), 'utf8');

            assert.strictEqual((text.match(/<!-- nram:start -->/g) ?? []).length, 1);
        });
    });
});
