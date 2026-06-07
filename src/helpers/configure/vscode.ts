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
import { vscode_user_dir } from '../paths';
import { api_key_header_manual_result, mcp_json_result, upsert_own_file } from '../upsert';

/**
 * Builds the instructions file VS Code loads for Copilot
 * (`applyTo: '**'` front matter applies it to every request)
 *
 * @param instructions the agent instructions text
 */
export const vscode_instruction_file = (instructions: string): string =>
    '---\n' +
    'applyTo: \'**\'\n' +
    'description: nram (Neural Ram) persistent memory protocol\n' +
    '---\n\n' +
    `${instructions.trimEnd()}\n`;

/**
 * Configures VS Code (Copilot agent mode): merges the nram MCP server into
 * the project `.vscode/mcp.json` (the user-profile mcp.json filename is not
 * documented, so user scope reports the Command Palette path instead) and
 * writes the agent instructions as an `*.instructions.md` file in the
 * profile prompts dir (user) or `.github/instructions` (project)
 *
 * @param options the collected setup options
 */
export const configure_vscode = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        if (options.scope !== Scope.PROJECT) {
            results.push({
                action: 'MCP registration',
                kind: 'manual',
                detail: 'VS Code keeps user-level MCP servers in a profile file with no documented path; run ' +
                    'the "MCP: Open User Configuration" command in VS Code and add under "servers": ' +
                    `"nram": { "type": "http", "url": "${options.mcp_url}" }`
            });
        } else {
            const config_path = resolve(process.cwd(), '.vscode', 'mcp.json');

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
        const instructions_path = options.scope === Scope.USER
            ? resolve(vscode_user_dir(), 'prompts', 'nram.instructions.md')
            : resolve(process.cwd(), '.github', 'instructions', 'nram.instructions.md');

        results.push(
            upsert_own_file(instructions_path, vscode_instruction_file(options.instructions.condensed),
                'Agent instructions'));
    }

    return results;
};
