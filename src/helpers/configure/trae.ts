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
import { trae_dir } from '../paths';
import { upsert_own_file } from '../upsert';

/**
 * Configures Trae (ByteDance): writes the agent instructions as a project
 * rules file. Trae's MCP config schema could not be verified against
 * accessible documentation, so MCP registration is reported as a manual
 * step through Trae's own UI rather than risking a guessed write; the
 * user-level rules location is likewise undocumented
 *
 * @param options the collected setup options
 */
export const configure_trae = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    if (options.mcp_url !== undefined) {
        results.push({
            action: 'MCP registration',
            kind: 'manual',
            detail: 'Trae\'s MCP config file schema is not verifiable against accessible docs; add the server ' +
                `through Trae's UI (MCP, Add) with the URL ${options.mcp_url}`
        });
    }

    if (options.instructions) {
        if (options.scope !== Scope.PROJECT) {
            results.push({
                action: 'Agent instructions',
                kind: 'skipped',
                detail: 'Trae user-level rules are managed through the IDE UI (no documented file path); ' +
                    'rerun at project scope to write .trae/rules/nram.md'
            });
        } else {
            const rule_path = resolve(trae_dir(options.scope), 'rules', 'nram.md');

            results.push(upsert_own_file(rule_path, options.instructions.condensed, 'Agent instructions'));
        }
    }

    return results;
};
