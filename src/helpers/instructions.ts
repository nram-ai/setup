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

// The nram server is the canonical source of the agent instructions: it
// serves them at the public, unauthenticated `GET /instructions` endpoint
// (`format=agents` for the full text, `format=cursor` for the condensed
// rules). This module owns fetching that text, caching the last good copy on
// the machine, and degrading gracefully when nothing is reachable.
//
// It deliberately imports only Node built-ins and the dependency-free file
// helpers from upsert.ts, so the `--session-start` hook path (run at every
// agent session start) stays cheap to load.

import { homedir } from 'os';
import { join } from 'path';
import { read_text, write_text } from './upsert';

export type Format = 'full' | 'condensed';

export type InstructionsSource = 'server' | 'cache' | 'github' | 'builtin';

/** Maps our format names onto the server's `?format=` query values */
const SERVER_FORMATS: Record<Format, string> = {
    full: 'agents',
    condensed: 'cursor'
};

/** The upstream source files, used when the configured server is unreachable */
const GITHUB_FILES: Record<Format, string> = {
    full: 'agent-instructions.md',
    condensed: 'cursor.md'
};

const DEFAULT_GITHUB_BASE =
    'https://raw.githubusercontent.com/nram-ai/nram/refs/heads/master/internal/instructions/data';

/**
 * The GitHub raw URL serving the fallback copy of the given format; the base
 * is env-overridable so tests can stay off the network
 *
 * @param format the instructions format
 */
export const github_url = (format: Format): string =>
    `${process.env.NRAM_INSTRUCTIONS_FALLBACK_BASE ?? DEFAULT_GITHUB_BASE}/${GITHUB_FILES[format]}`;

/**
 * The machine-local cache file holding the last successfully fetched copy of
 * the given format; the directory is env-overridable so tests can isolate it
 *
 * @param format the instructions format
 */
export const cache_path = (format: Format): string =>
    join(process.env.NRAM_CACHE_DIR ?? join(homedir(), '.nram', 'cache'), `instructions-${format}.md`);

/**
 * Reads the cached copy of the given format, returning undefined when there
 * is none (or it cannot be read)
 *
 * @param format the instructions format
 */
export const read_cache = (format: Format): string | undefined => {
    try {
        const text = read_text(cache_path(format));

        return text.length !== 0 ? text : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Caches a successfully fetched copy of the given format, creating the cache
 * directory as needed; failures are swallowed because the cache is an
 * optimization, never a requirement
 *
 * @param format the instructions format
 * @param text the instructions text
 */
export const write_cache = (format: Format, text: string): void => {
    try {
        write_text(cache_path(format), text);
    } catch {
        // a read-only home directory must not break the fallback chain
    }
};

/**
 * Fetches a URL expected to return plain-text instructions, throwing on any
 * HTTP error, timeout, or empty body
 *
 * @param url the URL to fetch
 * @param timeout_ms the request timeout in milliseconds
 */
const fetch_text = async (url: string, timeout_ms: number): Promise<string> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout_ms) });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
    }

    const text = await response.text();

    if (text.trim().length === 0) {
        throw new Error(`empty response from ${url}`);
    }

    return text;
};

/**
 * Fetches the canonical instructions from an nram server's public
 * `/instructions` endpoint, throwing on failure
 *
 * @param base_url the normalized nram base URL
 * @param format the instructions format
 * @param timeout_ms the request timeout in milliseconds
 */
export const fetch_instructions = async (base_url: string, format: Format, timeout_ms: number): Promise<string> =>
    fetch_text(`${base_url}/instructions?format=${SERVER_FORMATS[format]}`, timeout_ms);

/**
 * The last-resort text emitted when the canonical instructions could not be
 * loaded from anywhere; it tells the agent to surface the failure to the user
 * instead of silently proceeding without the memory protocol
 *
 * @param format the instructions format
 */
export const builtin_notice = (format: Format): string => format === 'full'
    ? 'Memory (nram): the canonical nram agent instructions could not be loaded from the configured nram ' +
    'server, the local cache, or the GitHub fallback. Inform the user that the nram instructions failed to ' +
    'load and suggest re-running `npx -y @nram-ai/setup-agents` once their nram server is reachable. ' +
    'nram remains the only memory system: recall before assuming, store what you learn, and never write ' +
    'local memory files.'
    : 'Memory (nram): the canonical nram rules could not be loaded from the nram server, the local cache, or ' +
        'the GitHub fallback. Inform the user and suggest re-running `npx -y @nram-ai/setup-agents` once their ' +
        'nram server is reachable. nram remains the only memory system; never write local memory files.';

/**
 * Resolves the instructions text through the fallback chain: the configured
 * server (skipped when no base URL is known), then the machine-local cache,
 * then the GitHub raw copy, then the built-in notice. Any successful network
 * fetch refreshes the cache. Never throws
 *
 * @param base_url the normalized nram base URL, or undefined to skip the server
 * @param format the instructions format
 * @param timeout_ms the per-attempt network timeout in milliseconds
 */
export const resolve_instructions = async (
    base_url: string | undefined,
    format: Format,
    timeout_ms: number
): Promise<{ text: string; source: InstructionsSource }> => {
    if (base_url !== undefined) {
        try {
            const text = await fetch_instructions(base_url, format, timeout_ms);

            write_cache(format, text);

            return { text, source: 'server' };
        } catch {
            // fall through to the cache
        }
    }

    const cached = read_cache(format);

    if (cached !== undefined) {
        return { text: cached, source: 'cache' };
    }

    try {
        const text = await fetch_text(github_url(format), timeout_ms);

        write_cache(format, text);

        return { text, source: 'github' };
    } catch {
        return { text: builtin_notice(format), source: 'builtin' };
    }
};
