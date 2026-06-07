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
import { ActionResult, SetupOptions } from '../../types';
import { opencode_dir } from '../paths';
import { agents_md_result, api_key_manual_result, mcp_json_result } from '../upsert';

/**
 * Builds the `mcp.nram` entry for opencode.json. In API-key mode the key is
 * referenced through OpenCode's `${env:...}` substitution, never written
 * to disk
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const opencode_mcp_entry = (mcp_url: string, api_key?: string): any => {
    const entry: any = {
        type: 'remote',
        url: mcp_url,
        enabled: true
    };

    if (api_key !== undefined) {
        entry.headers = { Authorization: 'Bearer ${env:NRAM_API_KEY}' };
    }

    return entry;
};

/**
 * Configures OpenCode: merges the nram MCP server into opencode.json and
 * upserts a marker-fenced agent-instructions block at the top of AGENTS.md
 * (OpenCode has no session hooks, so AGENTS.md is the documented mechanism)
 *
 * @param options the collected setup options
 */
export const configure_opencode = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(opencode_dir(options.scope), 'opencode.json');

        const mcp = mcp_json_result(config_path, ['mcp', 'nram'],
            opencode_mcp_entry(options.mcp_url, options.api_key), {
                fallback: { $schema: 'https://opencode.ai/config.json' },
                parse_hint: 'OpenCode allows JSONC, which this tool does not rewrite'
            });

        results.push(mcp);

        if (mcp.kind !== 'manual' && options.api_key !== undefined) {
            results.push(api_key_manual_result());
        }
    }

    if (options.instructions) {
        results.push(agents_md_result(resolve(opencode_dir(options.scope), 'AGENTS.md'),
            options.instructions.full));
    }

    return results;
};
