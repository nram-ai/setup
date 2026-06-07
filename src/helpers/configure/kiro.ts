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
import { kiro_dir } from '../paths';
import { api_key_manual_result, mcp_json_result, upsert_own_file } from '../upsert';

/**
 * Builds the `mcpServers.nram` entry for Kiro's mcp.json (Kiro's remote
 * entries carry no type field, just url and headers; `${VAR}` references
 * resolve from the environment, so the key never reaches disk)
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const kiro_mcp_entry = (mcp_url: string, api_key?: string): any => {
    const entry: any = { url: mcp_url };

    if (api_key !== undefined) {
        entry.headers = { Authorization: 'Bearer ${NRAM_API_KEY}' };
    }

    return entry;
};

/**
 * Builds the steering doc Kiro loads into every interaction
 * (`inclusion: always` front matter)
 *
 * @param instructions the agent instructions text
 */
export const kiro_steering_file = (instructions: string): string =>
    '---\n' +
    'inclusion: always\n' +
    '---\n\n' +
    `${instructions.trimEnd()}\n`;

/**
 * Configures Kiro (AWS): merges the nram MCP server into settings/mcp.json
 * and writes the agent instructions as a steering doc, both at the requested
 * scope (Kiro reads `~/.kiro` and `.kiro` symmetrically)
 *
 * @param options the collected setup options
 */
export const configure_kiro = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(kiro_dir(options.scope), 'settings', 'mcp.json');

        const mcp = mcp_json_result(config_path, ['mcpServers', 'nram'],
            kiro_mcp_entry(options.mcp_url, options.api_key));

        results.push(mcp);

        if (mcp.kind !== 'manual' && options.api_key !== undefined) {
            results.push(api_key_manual_result());
        }
    }

    if (options.instructions) {
        const steering_path = resolve(kiro_dir(options.scope), 'steering', 'nram.md');

        results.push(upsert_own_file(steering_path, kiro_steering_file(options.instructions.condensed),
            'Agent instructions'));
    }

    return results;
};
