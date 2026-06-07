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
import { kilo_dir } from '../paths';
import {
    agents_md_result,
    api_key_manual_result,
    mcp_json_result,
    read_json,
    upsert_own_file,
    write_json
} from '../upsert';

/**
 * Builds the `mcp.nram` entry for kilo.jsonc. Kilo substitutes
 * `{env:VAR}` references, so the key never reaches disk
 *
 * @param mcp_url the MCP endpoint URL
 * @param api_key the API key, when API-key authentication was chosen
 */
export const kilo_mcp_entry = (mcp_url: string, api_key?: string): any => {
    const entry: any = {
        type: 'streamable-http',
        url: mcp_url,
        enabled: true
    };

    if (api_key !== undefined) {
        entry.headers = { Authorization: 'Bearer {env:NRAM_API_KEY}' };
    }

    return entry;
};

/**
 * Configures Kilo Code: merges the nram MCP server into kilo.jsonc at the
 * requested scope. Instructions: project scope uses the repository root
 * AGENTS.md (Kilo reads it natively); user scope writes a rule file under
 * the global config dir and references it from the `instructions` array in
 * kilo.jsonc, which is how Kilo documents global rules
 *
 * @param options the collected setup options
 */
export const configure_kilo = async (options: SetupOptions): Promise<ActionResult[]> => {
    const results: ActionResult[] = [];

    const config_path = resolve(kilo_dir(options.scope), 'kilo.jsonc');

    if (options.mcp_url !== undefined) {
        const entry = kilo_mcp_entry(options.mcp_url, options.api_key);

        const mcp = mcp_json_result(config_path, ['mcp', 'nram'], entry, {
            parse_hint: 'Kilo allows JSONC, which this tool does not rewrite'
        });

        results.push(mcp);

        if (mcp.kind !== 'manual' && options.api_key !== undefined) {
            results.push(api_key_manual_result());
        }
    }

    if (options.instructions) {
        if (options.scope === Scope.PROJECT) {
            results.push(agents_md_result(resolve(process.cwd(), 'AGENTS.md'), options.instructions.full));
        } else {
            const rule_path = resolve(kilo_dir(options.scope), 'rules', 'nram.md');

            results.push(upsert_own_file(rule_path, options.instructions.condensed, 'Agent instructions'));

            const config_file = read_json(config_path);

            if (!config_file.ok) {
                results.push({
                    action: 'Rule reference',
                    kind: 'manual',
                    detail: `${config_path} could not be parsed; add "${rule_path.replace(/\\/g, '/')}" to its ` +
                        '"instructions" array yourself so Kilo loads the rule globally'
                });
            } else {
                const config = config_file.value ?? {};

                config.instructions ??= [];

                const reference = rule_path.replace(/\\/g, '/');

                if (config.instructions.includes(reference)) {
                    results.push({
                        action: 'Rule reference',
                        kind: 'skipped',
                        detail: `already present in ${config_path}`
                    });
                } else {
                    config.instructions.push(reference);

                    write_json(config_path, config);

                    results.push({
                        action: 'Rule reference',
                        kind: config_file.existed ? 'updated' : 'written',
                        detail: config_path
                    });
                }
            }
        }
    }

    return results;
};
