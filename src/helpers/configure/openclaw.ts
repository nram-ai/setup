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
import { openclaw_dir } from '../paths';
import { agents_md_result, api_key_header_manual_result, mcp_json_result } from '../upsert';

/**
 * Configures OpenClaw: merges the nram MCP server into the gateway's
 * openclaw.json and upserts the agent instructions into the workspace
 * AGENTS.md. OpenClaw is a user-level gateway with no project-scoped
 * configuration, so project scope reports and skips
 *
 * @param options the collected setup options
 */
export const configure_openclaw = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.scope !== Scope.USER) {
        if (options.mcp_url !== undefined) {
            results.push({
                action: 'MCP registration',
                kind: 'skipped',
                detail: 'OpenClaw is configured at the user level only (the gateway has no project config); ' +
                    'rerun at user scope'
            });
        }

        if (options.instructions) {
            results.push({
                action: 'Agent instructions',
                kind: 'skipped',
                detail: 'OpenClaw reads its workspace AGENTS.md, not project files; rerun at user scope'
            });
        }

        return results;
    }

    if (options.mcp_url !== undefined) {
        const config_path = resolve(openclaw_dir(), 'openclaw.json');

        const mcp = mcp_json_result(config_path, ['mcp', 'servers', 'nram'], {
            type: 'http',
            url: options.mcp_url
        }, { parse_hint: 'OpenClaw allows JSON5, which this tool does not rewrite' });

        results.push(mcp);

        if (mcp.kind !== 'manual' && options.api_key !== undefined) {
            results.push(api_key_header_manual_result(config_path));
        }
    }

    if (options.instructions) {
        results.push(agents_md_result(resolve(openclaw_dir(), 'workspace', 'AGENTS.md'),
            options.instructions.full));
    }

    return results;
};
