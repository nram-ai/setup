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
import { ActionResult, SetupOptions } from '../../types';
import { codex_dir } from '../paths';
import {
    api_key_manual_result,
    has_marker_block,
    upsert_block_with_validation,
    upsert_hooks_json
} from '../upsert';

/**
 * Builds the marker-fenced `[mcp_servers.nram]` TOML block. In API-key mode
 * the key itself is never written to disk; the file references the
 * NRAM_API_KEY environment variable instead
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const codex_mcp_block = (mcp_url: string, api_key?: string): string => {
    const lines = [
        '[mcp_servers.nram]',
        `url = "${mcp_url}"`
    ];

    if (api_key !== undefined) {
        lines.push('bearer_token_env_var = "NRAM_API_KEY"');
    }

    return lines.join('\n');
};

/**
 * Configures Codex: upserts a marker-fenced `[mcp_servers.nram]` block in
 * config.toml (the `codex mcp add` CLI covers stdio servers only, so remote
 * HTTP servers are written to the file, per the Codex docs) and injects the
 * agent-instructions SessionStart hook into hooks.json
 *
 * @param options the collected setup options
 */
export const configure_codex = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(codex_dir(options.scope), 'config.toml');

        const mcp = upsert_block_with_validation(
            config_path,
            codex_mcp_block(options.mcp_url, options.api_key),
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
        results.push(upsert_hooks_json(resolve(codex_dir(options.scope), 'hooks.json'), options.base_url));
    }

    return results;
};
