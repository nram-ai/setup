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
import { ActionResult, Scope, SetupOptions } from '../../types';
import { kimi_dir } from '../paths';
import { api_key_header_manual_result, mcp_json_result } from '../upsert';

/**
 * Configures Kimi Code CLI: merges the nram MCP server into the user-level
 * mcp.json. Kimi does not auto-load AGENTS.md or any documented instruction
 * file (MoonshotAI/kimi-cli issue 850 closed without documented support as
 * of June 2026), so the instructions half is reported and skipped
 *
 * @param options the collected setup options
 */
export const configure_kimi = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        if (options.scope !== Scope.USER) {
            results.push({
                action: 'MCP registration',
                kind: 'skipped',
                detail: 'Kimi Code keeps MCP servers in the user-level ~/.kimi/mcp.json only; rerun at user scope'
            });
        } else {
            const config_path = resolve(kimi_dir(), 'mcp.json');

            const mcp = mcp_json_result(config_path, ['mcpServers', 'nram'], { url: options.mcp_url });

            results.push(mcp);

            if (mcp.kind !== 'manual') {
                if (options.api_key !== undefined) {
                    results.push(api_key_header_manual_result(config_path));
                } else {
                    results.push({
                        action: 'Authentication',
                        kind: 'manual',
                        detail: 'run `kimi mcp auth nram` once to complete the OAuth flow (Kimi requires an ' +
                            'explicit auth step for OAuth MCP servers)'
                    });
                }
            }
        }
    }

    if (options.instructions) {
        results.push({
            action: 'Agent instructions',
            kind: 'skipped',
            detail: 'Kimi Code does not auto-load AGENTS.md or any documented instruction file (as of June 2026); ' +
                'nothing was written because Kimi would not read it'
        });
    }

    return results;
};
