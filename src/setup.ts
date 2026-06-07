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

import {
    cancel,
    confirm,
    intro,
    isCancel,
    log,
    multiselect,
    outro,
    password,
    select,
    spinner,
    text
} from '@clack/prompts';
import chalk from 'chalk';
import { HARNESSES } from './helpers/harnesses';
import { InstructionsSource, resolve_instructions } from './helpers/instructions';
import { mcp_url, normalize_base_url } from './helpers/url';
import { ActionKind, ActionResult, Scope, SetupOptions } from './types';

/**
 * Flags that pre-decide (and therefore remove) interactive choices
 */
export interface SetupFlags {
    skip_mcp?: boolean;
    skip_instructions?: boolean;
    /** pre-answers the server question; the base URL prompt is skipped */
    url?: string;
}

type Component = 'mcp' | 'instructions';

/**
 * Unwraps a clack prompt result, exiting cleanly if the user cancelled
 *
 * @param value the prompt result
 */
const guard = <T>(value: T | symbol): T => {
    if (isCancel(value)) {
        cancel('Setup aborted');
        process.exit(0);
    }

    return value as T;
};

/**
 * Asks whether to continue past a failed verification, aborting unless the
 * user explicitly opts in
 *
 * @param message the confirmation message
 */
const confirm_or_abort = async (message: string): Promise<void> => {
    const proceed = guard(await confirm({ message, initialValue: false }));

    if (!proceed) {
        cancel('Setup aborted');
        process.exit(1);
    }
};

const KIND_COLORS: Record<ActionKind, (text: string) => string> = {
    written: chalk.green,
    updated: chalk.cyan,
    skipped: chalk.yellow,
    manual: chalk.magenta,
    failed: chalk.red
};

/**
 * Renders a configurator's results beneath its harness label
 *
 * @param label the harness label
 * @param results the configurator results
 */
const render_results = (label: string, results: ActionResult[]): void => {
    const lines = results.map(result =>
        `${KIND_COLORS[result.kind](result.kind.padEnd(7))} ${result.action}: ${result.detail}`);

    log.message(`${chalk.bold(label)}\n${lines.join('\n')}`);
};

/**
 * Runs the interactive setup flow: scope, harness, and component selection,
 * nram server details, authentication choice, and the per-harness
 * configurators
 *
 * @param flags component choices pre-decided on the command line
 */
export const run_setup = async (flags: SetupFlags = {}): Promise<void> => {
    if (flags.skip_mcp && flags.skip_instructions) {
        console.error('Nothing to configure: both --skip-mcp and --skip-instructions were given.');
        process.exit(1);
    }

    // Validate a command-line URL before any prompts so a typo fails fast
    // instead of after the user has answered every question
    let preset_url: string | undefined;

    if (flags.url !== undefined) {
        try {
            preset_url = normalize_base_url(flags.url);
        } catch (error: any) {
            console.error(`Invalid --url "${flags.url}": ${error.message}`);
            process.exit(1);
        }
    }

    intro(chalk.bold('@nram/setup'));

    const scope = guard(await select({
        message: 'Configure at which level?',
        options: [
            { value: Scope.USER, label: 'User level', hint: 'your account-wide configuration' },
            { value: Scope.PROJECT, label: 'Project level', hint: 'this directory, shared via the repository' }
        ],
        initialValue: Scope.USER
    }));

    const detected = new Map(HARNESSES.map(descriptor => [descriptor.harness, descriptor.detected(scope)]));

    if (scope === Scope.USER && ![...detected.values()].some(found => found)) {
        cancel('No supported harnesses were detected at the user level. ' +
            `Install one (${HARNESSES.map(descriptor => descriptor.label).join(', ')}) ` +
            'or rerun with project-level scope.');
        process.exit(1);
    }

    const selected = guard(await multiselect({
        message: 'Which tools would you like to configure to work with nram?',
        options: HARNESSES.map(descriptor => ({
            value: descriptor.harness,
            label: descriptor.label,
            hint: detected.get(descriptor.harness)
                ? 'detected'
                : scope === Scope.PROJECT ? 'not detected here; can be configured anyway' : 'not detected',
            disabled: scope === Scope.USER && !detected.get(descriptor.harness)
        })),
        initialValues: HARNESSES.filter(descriptor => detected.get(descriptor.harness))
            .map(descriptor => descriptor.harness),
        required: true
    }));

    const available: { value: Component; label: string; hint: string }[] = [];

    if (!flags.skip_mcp) {
        available.push({
            value: 'mcp',
            label: 'MCP server connection',
            hint: 'register nram as an MCP server'
        });
    }

    if (!flags.skip_instructions) {
        available.push({
            value: 'instructions',
            label: 'Agent instructions',
            hint: 'SessionStart hook, AGENTS.md, or rules file'
        });
    }

    const components = available.length === 1
        ? available.map(option => option.value)
        : guard(await multiselect({
            message: 'What should be configured?',
            options: available,
            initialValues: available.map(option => option.value),
            required: true
        }));

    const wants_mcp = components.includes('mcp');
    const wants_instructions = components.includes('instructions');

    // The base URL now serves both components: the MCP endpoint derives from
    // it, and the canonical agent instructions are fetched from it
    let base_url: string;

    if (preset_url !== undefined) {
        base_url = preset_url;

        log.info(`Using the nram server at ${base_url} (provided via --url)`);
    } else {
        base_url = normalize_base_url(guard(await text({
            message: 'What is the base URL of your nram server?',
            initialValue: 'http://localhost:8674',
            validate: (value) => {
                try {
                    normalize_base_url(value ?? '');
                } catch (error: any) {
                    return error.message;
                }
            }
        })));
    }

    // The URL is baked into hook commands and used for the instructions
    // fetch even without MCP, so verify it on every run; a typo'd URL must
    // hit this gate rather than quietly riding the fallback chain
    const health = spinner();

    health.start(`Checking ${base_url}/v1/health`);

    let healthy = false;

    try {
        const response = await fetch(`${base_url}/v1/health`, { signal: AbortSignal.timeout(7_000) });

        healthy = response.ok;

        health.stop(healthy
            ? `nram is reachable at ${base_url}`
            : `nram responded with HTTP ${response.status} at ${base_url}/v1/health`);
    } catch (error: any) {
        health.stop(`Could not reach ${base_url}/v1/health: ${error.message}`);
    }

    if (!healthy) {
        await confirm_or_abort('The nram server could not be verified. Continue writing configuration anyway?');
    }

    let mcp_endpoint: string | undefined;

    let api_key: string | undefined;

    if (wants_mcp) {
        mcp_endpoint = mcp_url(base_url);

        const auth = guard(await select({
            message: 'How should your tools authenticate to nram?',
            options: [
                { value: 'oauth', label: 'OAuth', hint: 'recommended; tools negotiate automatically via discovery' },
                { value: 'api-key', label: 'API key', hint: 'a nram_k_ key used as a Bearer token' }
            ],
            initialValue: 'oauth'
        }));

        if (auth === 'api-key') {
            api_key = guard(await password({
                message: 'Paste your nram API key',
                validate: (value) => {
                    if (!/^nram_k_[0-9a-zA-Z]+$/.test(value ?? '')) {
                        return 'That does not look like an nram API key (expected the nram_k_ prefix)';
                    }
                }
            }));

            const check = spinner();

            check.start('Verifying the API key');

            let verified = false;

            try {
                const response = await fetch(`${base_url}/userinfo`, {
                    headers: { Authorization: `Bearer ${api_key}` },
                    signal: AbortSignal.timeout(7_000)
                });

                verified = response.ok;

                check.stop(verified ? 'API key verified' : `The key was rejected (HTTP ${response.status})`);
            } catch (error: any) {
                check.stop(`Could not verify the API key: ${error.message}`);
            }

            if (!verified) {
                await confirm_or_abort('The API key could not be verified. Continue anyway?');
            }
        }
    }

    let instructions: SetupOptions['instructions'];

    if (wants_instructions) {
        const fetching = spinner();

        fetching.start(`Fetching the canonical agent instructions from ${base_url}`);

        const [full, condensed] = await Promise.all([
            resolve_instructions(base_url, 'full', 7_000),
            resolve_instructions(base_url, 'condensed', 7_000)
        ]);

        instructions = { full: full.text, condensed: condensed.text };

        if (full.source === 'server' && condensed.source === 'server') {
            fetching.stop(`Canonical agent instructions fetched from ${base_url}`);
        } else {
            fetching.stop(`The canonical agent instructions could not be fetched from ${base_url}`);

            const describe: Record<InstructionsSource, string> = {
                server: 'the server',
                cache: 'the last copy cached on this machine',
                github: 'the fallback copy on GitHub',
                builtin: 'a built-in notice (the canonical text was unreachable everywhere)'
            };

            log.warn(full.source === condensed.source
                ? `Using ${describe[full.source]} for the agent instructions and the condensed rules.`
                : `Using ${describe[full.source]} for the agent instructions and ` +
                    `${describe[condensed.source]} for the condensed rules.`);
        }
    }

    const setup: SetupOptions = { scope, base_url, mcp_url: mcp_endpoint, api_key, instructions };

    let failures = 0;

    let changes = 0;

    for (const descriptor of HARNESSES.filter(descriptor => selected.includes(descriptor.harness))) {
        const progress = spinner();

        progress.start(`Configuring ${descriptor.label}`);

        try {
            const results = await descriptor.configure(setup);

            const written = results.filter(result => result.kind === 'written' || result.kind === 'updated').length;

            progress.stop(written !== 0 ? `${descriptor.label} configured` : `${descriptor.label}: no changes`);

            failures += results.filter(result => result.kind === 'failed').length;

            changes += written;

            render_results(descriptor.label, results);
        } catch (error: any) {
            progress.stop(`${descriptor.label} failed: ${error.message}`);

            failures++;
        }
    }

    let done_message: string;

    if (failures !== 0) {
        done_message = chalk.red('Completed with failures; review the output above.');
    } else if (changes === 0) {
        done_message = 'No changes were made; everything selected was already configured or not applicable.';
    } else if (wants_mcp) {
        done_message = 'Done. Restart your agent sessions to pick up the changes. ' +
            'OAuth-capable tools will prompt to authenticate on first use (Claude Code: run /mcp).';
    } else {
        done_message = 'Done. Restart your agent sessions to pick up the changes.';
    }

    outro(done_message);

    process.exitCode = failures === 0 ? 0 : 1;
};
