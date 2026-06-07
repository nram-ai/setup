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
import { agents_md_path, factory_dir } from '../paths';
import { agents_md_result, api_key_manual_result, mcp_json_result } from '../upsert';

/**
 * Builds the array element for Factory's mcp.json. Droid expands `${VAR}`
 * references at load time, so the key never reaches disk
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const droid_mcp_entry = (mcp_url: string, api_key?: string): any => {
    const entry: any = {
        name: 'nram',
        type: 'http',
        url: mcp_url
    };

    if (api_key !== undefined) {
        entry.headers = { Authorization: 'Bearer ${NRAM_API_KEY}' };
    }

    return entry;
};

/**
 * Configures Droid (Factory): merges the nram MCP server into mcp.json
 * (array-shaped `servers` list) and upserts the agent instructions into the
 * AGENTS.md droid reads: `~/.factory/AGENTS.md` (documented personal
 * override) at user scope, the repository root AGENTS.md at project scope
 *
 * @param options the collected setup options
 */
export const configure_droid = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(factory_dir(options.scope), 'mcp.json');

        const entry = droid_mcp_entry(options.mcp_url, options.api_key);

        const mcp = mcp_json_result(config_path, ['servers'], entry, { array: true });

        results.push(mcp);

        if (mcp.kind !== 'manual' && options.api_key !== undefined) {
            results.push(api_key_manual_result());
        }
    }

    if (options.instructions) {
        results.push(agents_md_result(
            agents_md_path(options.scope, resolve(factory_dir(options.scope), 'AGENTS.md')),
            options.instructions.full));
    }

    return results;
};
