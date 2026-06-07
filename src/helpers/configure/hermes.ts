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
import { parse } from 'yaml';
import { ActionResult, Scope, SetupOptions } from '../../types';
import { hermes_dir } from '../paths';
import { agents_md_result, has_marker_block, upsert_block_with_validation } from '../upsert';

/**
 * Builds the marker-fenced `mcp_servers` YAML block. Hermes resolves
 * `${VAR}` placeholders from `~/.hermes/.env` at connection time, so the key
 * never reaches disk
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const hermes_mcp_block = (mcp_url: string, api_key?: string): string => {
    const lines = [
        'mcp_servers:',
        '  nram:',
        `    url: "${mcp_url}"`
    ];

    if (api_key !== undefined) {
        lines.push('    headers:');
        lines.push('      Authorization: "Bearer ${NRAM_API_KEY}"');
    }

    return lines.join('\n');
};

/**
 * Configures Hermes (Nous Research): upserts a marker-fenced `mcp_servers`
 * block in `~/.hermes/config.yaml` (user scope only; Hermes has no project
 * configuration; YAML cannot carry a duplicate top-level key, so an existing
 * `mcp_servers` outside our markers means a manual step) and the agent
 * instructions into the repository root AGENTS.md at project scope.
 * Hermes's user-level SOUL.md is identity, not protocol, so user-scope
 * instructions are reported and skipped
 *
 * @param options the collected setup options
 */
export const configure_hermes = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        if (options.scope !== Scope.USER) {
            results.push({
                action: 'MCP registration',
                kind: 'skipped',
                detail: 'Hermes keeps MCP servers in the user-level ~/.hermes/config.yaml only; rerun at user scope'
            });
        } else {
            const config_path = resolve(hermes_dir(), 'config.yaml');

            const mcp = upsert_block_with_validation(
                config_path,
                hermes_mcp_block(options.mcp_url, options.api_key),
                parse,
                'YAML',
                (parsed, text) => parsed?.mcp_servers !== undefined && !has_marker_block(text, 'hash')
                    ? {
                        action: 'MCP registration',
                        kind: 'manual',
                        detail: `${config_path} already has an mcp_servers key (YAML cannot carry the key ` +
                            'twice); add this under it yourself:\n  nram:\n    url: "<your nram MCP URL>"'
                    }
                    : undefined,
                parsed => parsed?.mcp_servers?.nram !== undefined
            );

            results.push(mcp);

            if ((mcp.kind === 'written' || mcp.kind === 'updated') && options.api_key !== undefined) {
                results.push({
                    action: 'API key',
                    kind: 'manual',
                    detail: 'add NRAM_API_KEY=<your nram API key> to ~/.hermes/.env (Hermes resolves ${VAR} ' +
                        'placeholders from that file); the key is never written to config.yaml'
                });
            }
        }
    }

    if (options.instructions) {
        if (options.scope !== Scope.PROJECT) {
            results.push({
                action: 'Agent instructions',
                kind: 'skipped',
                detail: 'Hermes has no documented global AGENTS.md (SOUL.md is identity, not protocol); ' +
                    'rerun at project scope to write the repository AGENTS.md'
            });
        } else {
            results.push(agents_md_result(resolve(process.cwd(), 'AGENTS.md'), options.instructions.full));
        }
    }

    return results;
};
