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

import { existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'smol-toml';
import { ActionResult, Scope, SetupOptions } from '../../types';
import { agents_md_path, vibe_dir } from '../paths';
import {
    agents_md_result,
    api_key_manual_result,
    has_marker_block,
    upsert_block_with_validation
} from '../upsert';

/**
 * Returns whether the parsed config carries an `[[mcp_servers]]` entry named
 * `nram` (Vibe keys its MCP servers as an array of tables, not a keyed table)
 *
 * @param parsed the parsed config.toml
 */
const has_nram_entry = (parsed: any): boolean =>
    Array.isArray(parsed?.mcp_servers) &&
    parsed.mcp_servers.some((server: any) => server?.name === 'nram');

/**
 * Builds the marker-fenced `[[mcp_servers]]` TOML block. nram serves MCP over
 * streamable HTTP, so the matching Vibe transport is declared explicitly. In
 * API-key mode the key itself is never written to disk; Vibe's documented
 * `api_key_env` substitution references the NRAM_API_KEY environment variable
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const vibe_mcp_block = (mcp_url: string, api_key?: string): string => {
    const lines = [
        '[[mcp_servers]]',
        'name = "nram"',
        'transport = "streamable-http"',
        `url = "${mcp_url}"`
    ];

    if (api_key !== undefined) {
        lines.push(
            'api_key_env = "NRAM_API_KEY"',
            'api_key_header = "Authorization"',
            'api_key_format = "Bearer {token}"'
        );
    }

    return lines.join('\n');
};

/**
 * Configures Vibe (Mistral): upserts a marker-fenced `[[mcp_servers]]` block
 * in config.toml and the agent instructions into the AGENTS.md Vibe reads
 * (`~/.vibe/AGENTS.md` at user scope, the repository root at project scope).
 *
 * Vibe reads exactly ONE config.toml (`./.vibe/config.toml` when present,
 * else `~/.vibe/config.toml` as a whole-file fallback, never a merge), so a
 * project config.toml is only ever updated, not created: creating one would
 * silently shadow everything in the user-level file
 *
 * @param options the collected setup options
 */
export const configure_vibe = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(vibe_dir(options.scope), 'config.toml');

        if (options.scope === Scope.PROJECT && !existsSync(config_path)) {
            results.push({
                action: 'MCP registration',
                kind: 'manual',
                detail: `refusing to create ${config_path}: Vibe reads one config.toml, and a new project ` +
                    'file would shadow the user-level one entirely; if you want a project config, create ' +
                    'it yourself and re-run, or add this block to it:\n' +
                    vibe_mcp_block(options.mcp_url, options.api_key)
            });
        } else {
            const mcp = upsert_block_with_validation(
                config_path,
                vibe_mcp_block(options.mcp_url, options.api_key),
                parse,
                'TOML',
                (parsed, text) => has_nram_entry(parsed) && !has_marker_block(text, 'hash')
                    ? {
                        action: 'MCP registration',
                        kind: 'skipped',
                        detail: `an [[mcp_servers]] entry named "nram" already exists in ${config_path} ` +
                            '(outside the nram setup markers)'
                    }
                    : undefined,
                has_nram_entry
            );

            results.push(mcp);

            if ((mcp.kind === 'written' || mcp.kind === 'updated') && options.api_key !== undefined) {
                results.push(api_key_manual_result());
            }
        }
    }

    if (options.instructions) {
        results.push(agents_md_result(
            agents_md_path(options.scope, resolve(vibe_dir(options.scope), 'AGENTS.md')),
            options.instructions.full));
    }

    return results;
};
