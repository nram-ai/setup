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
import { cursor_dir } from '../paths';
import { api_key_manual_result, mcp_json_result, upsert_own_file } from '../upsert';

/**
 * Builds the `mcpServers.nram` entry for Cursor's mcp.json. In API-key mode
 * the key is referenced through Cursor's `${env:...}` interpolation, never
 * written to disk
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const cursor_mcp_entry = (mcp_url: string, api_key?: string): any => {
    const entry: any = { url: mcp_url };

    if (api_key !== undefined) {
        entry.headers = { Authorization: 'Bearer ${env:NRAM_API_KEY}' };
    }

    return entry;
};

/**
 * Builds the project rule file (`.cursor/rules/nram.mdc`) carrying the agent
 * instructions; `alwaysApply: true` injects it into every Agent conversation
 *
 * @param instructions the agent instructions text
 */
export const cursor_rule_file = (instructions: string): string =>
    '---\n' +
    'description: nram (Neural Ram) persistent memory protocol\n' +
    'alwaysApply: true\n' +
    '---\n\n' +
    `${instructions.trimEnd()}\n`;

/**
 * Configures Cursor: merges the nram MCP server into mcp.json and, at project
 * scope, writes the agent instructions as `.cursor/rules/nram.mdc`
 * (`.cursorrules` is deprecated; user-level rules live only in the Cursor
 * settings GUI, so the instruction half is reported and skipped at user scope)
 *
 * @param options the collected setup options
 */
export const configure_cursor = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        const config_path = resolve(cursor_dir(options.scope), 'mcp.json');

        const mcp = mcp_json_result(config_path, ['mcpServers', 'nram'],
            cursor_mcp_entry(options.mcp_url, options.api_key));

        results.push(mcp);

        if (mcp.kind !== 'manual' && options.api_key !== undefined) {
            results.push(api_key_manual_result());
        }
    }

    if (!options.instructions) {
        return results;
    }

    if (options.scope !== Scope.PROJECT) {
        results.push({
            action: 'Agent instructions',
            kind: 'skipped',
            detail: 'Cursor has no file-based user-level rules (only Cursor Settings, Rules); ' +
                'rerun at project scope to write .cursor/rules/nram.mdc instead'
        });

        return results;
    }

    const rule_path = resolve(cursor_dir(options.scope), 'rules', 'nram.mdc');

    results.push(upsert_own_file(rule_path, cursor_rule_file(options.instructions.condensed), 'Agent instructions'));

    return results;
};
