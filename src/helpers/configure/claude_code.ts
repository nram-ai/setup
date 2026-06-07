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

import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { ActionResult, Scope, SetupOptions } from '../../types';
import { claude_dir } from '../paths';
import { upsert_hooks_json } from '../upsert';

/**
 * Runs the `claude` CLI with the supplied arguments
 *
 * On Windows the CLI is commonly an `.exe` or an npm `.cmd` shim; the latter
 * is only executable through a shell, so we shell out there and quote each
 * argument ourselves (callers must never pass arguments containing `"`)
 *
 * @param args the CLI arguments
 */
const run_claude = (args: string[]): { ok: boolean; missing: boolean; output: string } => {
    const use_shell = process.platform === 'win32';

    const final_args = use_shell ? args.map(arg => `"${arg}"`) : args;

    const result = spawnSync('claude', final_args, {
        shell: use_shell,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000
    });

    const missing = result.error !== undefined || result.status === null;

    return {
        ok: result.status === 0,
        missing,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    };
};

/**
 * Registers the nram MCP server via the documented `claude mcp add` CLI,
 * guarded by `claude mcp get nram` so re-runs never double-add
 *
 * @param scope the CLI scope flag value
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
const claude_mcp_result = (scope: string, mcp_url: string, api_key?: string): ActionResult => {
    const add_args = ['mcp', 'add', '--scope', scope, '--transport', 'http', 'nram', mcp_url];

    if (api_key !== undefined) {
        add_args.push('--header', `Authorization: Bearer ${api_key}`);
    }

    const manual_command = `claude ${add_args.join(' ')}`;

    if (add_args.some(arg => arg.includes('"'))) {
        return {
            action: 'MCP registration',
            kind: 'failed',
            detail: 'refusing to run: argument contains a double quote'
        };
    }

    const existing = run_claude(['mcp', 'get', 'nram']);

    if (existing.missing) {
        return {
            action: 'MCP registration',
            kind: 'manual',
            detail: `the claude CLI was not found on PATH; run this yourself: ${manual_command}`
        };
    }

    if (existing.ok) {
        return {
            action: 'MCP registration',
            kind: 'skipped',
            detail: 'an MCP server named "nram" is already registered (claude mcp get nram)'
        };
    }

    const added = run_claude(add_args);

    if (added.ok) {
        return { action: 'MCP registration', kind: 'written', detail: manual_command };
    }

    return {
        action: 'MCP registration',
        kind: 'failed',
        detail: `claude mcp add failed: ${added.output || 'unknown error'}; ` +
            `run this yourself: ${manual_command}`
    };
};

/**
 * Configures Claude Code: registers the nram MCP server via the documented
 * `claude mcp add` CLI and injects the agent-instructions SessionStart hook
 * into settings.json at the requested scope
 *
 * @param options the collected setup options
 */
export const configure_claude_code = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const scope = options.scope === Scope.USER ? 'user' : 'project';

        results.push(claude_mcp_result(scope, options.mcp_url, options.api_key));
    }

    if (options.instructions) {
        results.push(upsert_hooks_json(resolve(claude_dir(options.scope), 'settings.json'), options.base_url));
    }

    return results;
};
