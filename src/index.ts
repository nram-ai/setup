#!/usr/bin/env node

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

import { program } from 'commander';
import { builtin_notice, resolve_instructions } from './helpers/instructions';
import { normalize_base_url } from './helpers/url';

program.name('npx @nram/setup')
    .description('Helps to configure local harnesses to utilize Neural Ram');

program.option('-s, --session-start', 'print out the session start protocol');
program.option('-u, --url <url>', 'the base URL of your nram server (skips the prompt)');
program.option('--skip-mcp', 'do not register the nram MCP server');
program.option('--skip-instructions', 'do not inject the agent instructions (hook, AGENTS.md, or rules file)');
program.parse();

const options = program.opts();

if (options.sessionStart) {
    // A SessionStart hook must never break an agent session: any failure
    // falls down the chain (server, cache, GitHub, built-in notice) and the
    // process always exits 0
    (async () => {
        let base_url: string | undefined;

        try {
            base_url = options.url !== undefined ? normalize_base_url(options.url) : undefined;
        } catch {
            // an unparseable --url degrades to the cache/GitHub chain
        }

        try {
            const { text } = await resolve_instructions(base_url, 'full', 3_000);

            console.log(text);
        } catch {
            console.log(builtin_notice('full'));
        }

        process.exit(0);
    })();
} else {
    // The interactive flow (and its dependencies: @clack/prompts, chalk, and
    // smol-toml via the configurators) loads lazily so the --session-start
    // fast path above, which runs at every agent session start, stays cheap
    (async () => {
        const { run_setup } = await import('./setup');

        await run_setup({
            skip_mcp: options.skipMcp === true,
            skip_instructions: options.skipInstructions === true,
            url: options.url
        });
    })().catch((error: any) => {
        console.error(error);
        process.exit(1);
    });
}
