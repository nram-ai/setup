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
import { agents_md_path, copilot_dir } from '../paths';
import { agents_md_result, api_key_header_manual_result, mcp_json_result } from '../upsert';

/**
 * Configures GitHub Copilot CLI: merges the nram MCP server into the
 * user-level mcp-config.json (Copilot CLI has no repo-level MCP config) and
 * upserts the agent instructions into the files Copilot CLI documents:
 * `$HOME/.copilot/copilot-instructions.md` at user scope and the repository
 * root AGENTS.md at project scope
 *
 * @param options the collected setup options
 */
export const configure_copilot = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        if (options.scope !== Scope.USER) {
            results.push({
                action: 'MCP registration',
                kind: 'skipped',
                detail: 'Copilot CLI stores MCP servers in the user-level mcp-config.json only; rerun at user scope'
            });
        } else {
            const config_path = resolve(copilot_dir(), 'mcp-config.json');

            const mcp = mcp_json_result(config_path, ['servers', 'nram'], {
                type: 'http',
                url: options.mcp_url
            });

            results.push(mcp);

            if (mcp.kind !== 'manual' && options.api_key !== undefined) {
                results.push(api_key_header_manual_result(config_path));
            }
        }
    }

    if (options.instructions) {
        results.push(agents_md_result(
            agents_md_path(options.scope, resolve(copilot_dir(), 'copilot-instructions.md')),
            options.instructions.full));
    }

    return results;
};
