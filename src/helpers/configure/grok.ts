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

import { resolve } from 'path';
import { parse } from 'smol-toml';
import { ActionResult, Scope, SetupOptions } from '../../types';
import { grok_dir } from '../paths';
import {
    api_key_manual_result,
    has_marker_block,
    upsert_block_with_validation,
    upsert_hooks_json
} from '../upsert';

/**
 * Builds the marker-fenced `[mcp_servers.nram]` TOML block. Grok Build
 * expands `${VAR}` in string fields at load time, so in API-key mode the
 * Authorization header references the NRAM_API_KEY environment variable and
 * the key itself is never written to disk
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const grok_mcp_block = (mcp_url: string, api_key?: string): string => {
    const lines = [
        '[mcp_servers.nram]',
        `url = "${mcp_url}"`
    ];

    if (api_key !== undefined) {
        lines.push('headers = { "Authorization" = "Bearer ${NRAM_API_KEY}" }');
    }

    return lines.join('\n');
};

/**
 * Configures Grok Build (xAI): upserts a marker-fenced `[mcp_servers.nram]`
 * block in config.toml (project-scoped config files support `[mcp_servers]`
 * only, which is exactly what is written) and injects the agent-instructions
 * SessionStart hook as its own merged hooks file (Grok Build merges every
 * `hooks/*.json`, in the same nested shape Claude Code uses).
 *
 * Native config.toml servers take documented precedence over Grok Build's
 * Claude Code compatibility sources on a name conflict, so registering nram
 * here stays correct on machines where Claude Code is configured too
 *
 * @param options the collected setup options
 */
export const configure_grok = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(grok_dir(options.scope), 'config.toml');

        const mcp = upsert_block_with_validation(
            config_path,
            grok_mcp_block(options.mcp_url, options.api_key),
            parse,
            'TOML',
            (parsed, text) => parsed?.mcp_servers?.nram !== undefined && !has_marker_block(text, 'hash')
                ? {
                    action: 'MCP registration',
                    kind: 'skipped',
                    detail: `[mcp_servers.nram] already exists in ${config_path} (outside the nram setup markers)`
                }
                : undefined,
            parsed => parsed?.mcp_servers?.nram !== undefined
        );

        results.push(mcp);

        if ((mcp.kind === 'written' || mcp.kind === 'updated') && options.api_key !== undefined) {
            results.push(api_key_manual_result());
        }
    }

    if (options.instructions) {
        const hook = upsert_hooks_json(resolve(grok_dir(options.scope), 'hooks', 'nram.json'), options.base_url);

        results.push(hook);

        // user-scope hooks are always trusted; project hooks are not run
        // until the user trusts them inside Grok Build
        if (options.scope === Scope.PROJECT && (hook.kind === 'written' || hook.kind === 'updated')) {
            results.push({
                action: 'Hook trust',
                kind: 'manual',
                detail: 'project-scope hooks only run after you approve them: run /hooks-trust inside Grok Build'
            });
        }
    }

    return results;
};
