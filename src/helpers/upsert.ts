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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { ActionResult } from '../types';

/**
 * Identifies our SessionStart hook entry among the user's hooks, across every
 * historical command format
 */
export const SESSION_START_MARKER = '@nram/setup';

/**
 * The shell command injected as a SessionStart hook; its stdout (the agent
 * instructions, fetched from the configured nram server) is added to the
 * model's context by the harness
 *
 * @param base_url the normalized nram base URL the hook fetches from
 */
export const session_start_command = (base_url: string): string =>
    `npx -y @nram/setup --session-start --url ${base_url}`;

export type MarkerStyle = 'hash' | 'html';

const MARKERS: Record<MarkerStyle, [string, string]> = {
    hash: ['# >>> nram setup >>>', '# <<< nram setup <<<'],
    html: ['<!-- nram:start -->', '<!-- nram:end -->']
};

/**
 * Returns whether the text already carries our marker-fenced block
 *
 * @param text the file content
 * @param style the marker comment style
 */
export const has_marker_block = (text: string, style: MarkerStyle): boolean =>
    text.includes(MARKERS[style][0]);

/**
 * Reads a text file, returning an empty string when the file does not exist
 *
 * @param path the file to read
 */
export const read_text = (path: string): string =>
    existsSync(path) ? readFileSync(path, 'utf8') : '';

/**
 * Writes a text file, creating parent directories as needed
 *
 * @param path the file to write
 * @param text the file content
 */
export const write_text = (path: string, text: string): void => {
    mkdirSync(dirname(path), { recursive: true });

    writeFileSync(path, text);
};

export type JsonReadResult =
    { ok: true; value: any; existed: boolean } |
    { ok: false; error: string };

/**
 * Reads and parses a JSON file. A missing file is NOT an error (it yields
 * `value: undefined`); an existing file that cannot be parsed is, and the
 * caller MUST leave that file untouched and fall back to a manual snippet
 *
 * @param path the file to read
 */
export const read_json = (path: string): JsonReadResult => {
    if (!existsSync(path)) {
        return { ok: true, value: undefined, existed: false };
    }

    try {
        return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')), existed: true };
    } catch (error: any) {
        return { ok: false, error: error.toString() };
    }
};

/**
 * Serializes a value as 2-space-indented JSON (with a trailing newline)
 * and writes it, creating parent directories as needed
 *
 * @param path the file to write
 * @param value the value to serialize
 */
export const write_json = (path: string, value: unknown): void =>
    write_text(path, `${JSON.stringify(value, null, 2)}\n`);

/**
 * Inserts a marker-fenced block into a body of text, or replaces the existing
 * fenced block in place. Content outside the markers is never modified, and
 * re-applying the same block is byte-stable
 *
 * @param text the current file content (may be empty)
 * @param block the block content to place between the markers
 * @param style the marker comment style for the target file type
 * @param position where to place a NEW block; ignored when replacing
 * @returns the updated text and whether anything changed
 */
export const upsert_marker_block = (
    text: string,
    block: string,
    style: MarkerStyle,
    position: 'prepend' | 'append' = 'append'
): { text: string; changed: boolean } => {
    const [begin, end] = MARKERS[style];

    const fenced = `${begin}\n${block.trimEnd()}\n${end}\n`;

    const begin_idx = text.indexOf(begin);

    if (begin_idx !== -1) {
        const end_idx = text.indexOf(end, begin_idx);

        if (end_idx !== -1) {
            const after = text.slice(end_idx + end.length).replace(/^\r?\n/, '');

            const updated = `${text.slice(0, begin_idx)}${fenced}${after}`;

            return { text: updated, changed: updated !== text };
        }
    }

    if (text.trim().length === 0) {
        return { text: fenced, changed: true };
    }

    if (position === 'prepend') {
        return { text: `${fenced}\n${text.replace(/^\s*\n/, '')}`, changed: true };
    }

    return { text: `${text.trimEnd()}\n\n${fenced}`, changed: true };
};

/**
 * Upserts our SessionStart hook entry into a hooks-style configuration object
 * (the SessionStart shape is identical between Claude Code's settings.json
 * and Codex's hooks.json). An existing entry referencing `@nram/setup` is
 * replaced in place when its command differs (a different server URL, or the
 * URL-less command written by older package versions), left alone when it
 * already matches, and appended when absent. Unrelated hooks are never touched
 *
 * @param config the parsed configuration object (mutated in place)
 * @param base_url the normalized nram base URL embedded in the hook command
 * @returns the configuration and whether it changed
 */
export const upsert_session_start_hook = (config: any, base_url: string): { config: any; changed: boolean } => {
    config ??= {};
    config.hooks ??= {};
    config.hooks.SessionStart ??= [];

    const command = session_start_command(base_url);

    for (const group of config.hooks.SessionStart) {
        for (const hook of group?.hooks ?? []) {
            if (typeof hook?.command === 'string' && hook.command.includes(SESSION_START_MARKER)) {
                if (hook.command === command) {
                    return { config, changed: false };
                }

                hook.command = command;

                return { config, changed: true };
            }
        }
    }

    config.hooks.SessionStart.push({
        matcher: '',
        hooks: [{
            type: 'command',
            command
        }]
    });

    return { config, changed: true };
};

/**
 * Upserts our SessionStart hook into a hooks-style JSON file (Claude Code's
 * settings.json and Codex's hooks.json share the shape) and reports the
 * outcome; an unparseable file is left untouched
 *
 * @param path the hooks file to update
 * @param base_url the normalized nram base URL embedded in the hook command
 */
export const upsert_hooks_json = (path: string, base_url: string): ActionResult => {
    const file = read_json(path);

    if (!file.ok) {
        return {
            action: 'SessionStart hook',
            kind: 'manual',
            detail: `${path} exists but could not be parsed (${file.error}); ` +
                'add this to hooks.SessionStart yourself: ' +
                `{ "matcher": "", "hooks": [{ "type": "command", "command": "${session_start_command(base_url)}" }] }`
        };
    }

    const { config, changed } = upsert_session_start_hook(file.value ?? {}, base_url);

    if (!changed) {
        return { action: 'SessionStart hook', kind: 'skipped', detail: `already present in ${path}` };
    }

    write_json(path, config);

    return { action: 'SessionStart hook', kind: file.existed ? 'updated' : 'written', detail: path };
};

export type JsonUpsertResult =
    { kind: 'skipped' | 'written' | 'updated' } |
    { kind: 'manual'; error: string };

/**
 * Merges a value into a JSON file at the given key path (creating intermediate
 * objects as needed), writing only when the value differs. An unparseable
 * existing file is left untouched and reported for manual handling
 *
 * @param path the JSON file to update
 * @param key_path the nested key path, e.g. ['mcpServers', 'nram']
 * @param entry the value to place at the key path
 * @param fallback the configuration to start from when the file is missing
 */
export const upsert_json_path = (
    path: string,
    key_path: string[],
    entry: unknown,
    fallback: any = {}
): JsonUpsertResult => {
    const file = read_json(path);

    if (!file.ok) {
        return { kind: 'manual', error: file.error };
    }

    const config = file.value ?? fallback;

    let node = config;

    for (const key of key_path.slice(0, -1)) {
        node[key] ??= {};
        node = node[key];
    }

    const leaf = key_path[key_path.length - 1];

    if (JSON.stringify(node[leaf]) === JSON.stringify(entry)) {
        return { kind: 'skipped' };
    }

    node[leaf] = entry;

    write_json(path, config);

    return { kind: file.existed ? 'updated' : 'written' };
};

/**
 * The manual follow-up shown whenever a configuration references the
 * NRAM_API_KEY environment variable instead of embedding the key
 */
export const api_key_manual_result = (): ActionResult => ({
    action: 'API key',
    kind: 'manual',
    detail: 'set the NRAM_API_KEY environment variable to your nram API key; ' +
        'the key is never written to disk'
});

/**
 * The manual follow-up shown when a tool's configuration has no verified
 * environment-variable substitution, so the Authorization header must be
 * added by hand rather than risking a literal key on disk
 *
 * @param path the configuration file the header belongs in
 */
export const api_key_header_manual_result = (path: string): ActionResult => ({
    action: 'API key',
    kind: 'manual',
    detail: `this tool has no verified env-var substitution, so add the header yourself in ${path}: ` +
        '"headers": { "Authorization": "Bearer <your nram_k_ key>" }'
});

export interface McpJsonOptions {
    /** Starting configuration when the file is missing */
    fallback?: any;
    /** Replaces the parse-error reason in the manual detail (e.g. a JSONC caveat) */
    parse_hint?: string;
    /** Appended to the written/updated detail */
    note?: string;
    /** The key path addresses an array merged by entry name instead of a keyed object */
    array?: boolean;
}

/**
 * Merges an MCP server entry into a JSON configuration and maps the outcome
 * onto the standard `MCP registration` ActionResult, including the manual
 * snippet for unparseable files; this is the shared report flow every
 * JSON-configured harness uses
 *
 * @param path the JSON file to update
 * @param key_path the nested key path (the leaf is the entry key, or the array itself with `array`)
 * @param entry the entry value
 * @param options report and merge options
 */
export const mcp_json_result = (
    path: string,
    key_path: string[],
    entry: any,
    options: McpJsonOptions = {}
): ActionResult => {
    const merged = options.array
        ? upsert_json_array_entry(path, key_path, entry)
        : upsert_json_path(path, key_path, entry, options.fallback ?? {});

    if (merged.kind === 'manual') {
        const reason = options.parse_hint ?? merged.error;

        const target = options.array
            ? `add this to the "${key_path.join('.')}" array yourself`
            : `add this under "${key_path.slice(0, -1).join('.')}" yourself: "${key_path[key_path.length - 1]}"`;

        return {
            action: 'MCP registration',
            kind: 'manual',
            detail: `${path} exists but could not be parsed (${reason}); ${target}: ${JSON.stringify(entry)}`
        };
    }

    if (merged.kind === 'skipped') {
        return { action: 'MCP registration', kind: 'skipped', detail: `already present in ${path}` };
    }

    return {
        action: 'MCP registration',
        kind: merged.kind,
        detail: options.note === undefined ? path : `${path} (${options.note})`
    };
};

/**
 * Upserts a marker-fenced configuration block into a structured text file
 * (TOML, YAML): parse the existing content (manual on failure), let the
 * caller veto via a conflict check, apply the marker upsert, validate that
 * the result re-parses with the expected entry, and only then write. The
 * file is never re-serialized as a whole, so user comments survive
 *
 * @param path the configuration file
 * @param block the marker-fenced block content
 * @param parse the format parser (throws on invalid input)
 * @param format the format name for messaging
 * @param conflict returns a result to report instead of editing (e.g. the key exists outside our markers)
 * @param valid post-edit check that the entry is present in the re-parsed file
 */
export const upsert_block_with_validation = (
    path: string,
    block: string,
    parse: (text: string) => any,
    format: string,
    conflict: (parsed: any, text: string) => ActionResult | undefined,
    valid: (parsed: any) => boolean
): ActionResult => {
    const text = read_text(path);

    if (text.trim().length !== 0) {
        let parsed: any;

        try {
            parsed = parse(text);
        } catch {
            return {
                action: 'MCP registration',
                kind: 'manual',
                detail: `${path} exists but could not be parsed as ${format}; add this yourself:\n${block}`
            };
        }

        const vetoed = conflict(parsed, text);

        if (vetoed !== undefined) {
            return vetoed;
        }
    }

    const { text: updated, changed } = upsert_marker_block(text, block, 'hash', 'append');

    if (!changed) {
        return { action: 'MCP registration', kind: 'skipped', detail: `already present in ${path}` };
    }

    let ok: boolean;

    try {
        ok = valid(parse(updated));
    } catch {
        ok = false;
    }

    if (!ok) {
        return {
            action: 'MCP registration',
            kind: 'failed',
            detail: `refusing to write ${path}: the updated file did not re-parse cleanly; ` +
                `add this yourself:\n${block}`
        };
    }

    write_text(path, updated);

    return {
        action: 'MCP registration',
        kind: text.length === 0 ? 'written' : 'updated',
        detail: path
    };
};

/**
 * Merges an entry into an array-shaped JSON configuration (e.g. Factory's
 * `servers: []`), keyed by a name field: replace in place when an element
 * with the same name exists and differs, append when absent, skip when
 * identical. An unparseable existing file is left untouched
 *
 * @param path the JSON file to update
 * @param array_key_path the nested key path holding the array
 * @param entry the element to place (must carry the name key)
 * @param name_key the field that identifies elements (default `name`)
 */
export const upsert_json_array_entry = (
    path: string,
    array_key_path: string[],
    entry: any,
    name_key = 'name'
): JsonUpsertResult => {
    const file = read_json(path);

    if (!file.ok) {
        return { kind: 'manual', error: file.error };
    }

    const config = file.value ?? {};

    let node = config;

    for (const key of array_key_path.slice(0, -1)) {
        node[key] ??= {};
        node = node[key];
    }

    const leaf = array_key_path[array_key_path.length - 1];

    node[leaf] ??= [];

    const list: any[] = node[leaf];

    const index = list.findIndex(element => element?.[name_key] === entry[name_key]);

    if (index !== -1 && JSON.stringify(list[index]) === JSON.stringify(entry)) {
        return { kind: 'skipped' };
    }

    if (index !== -1) {
        list[index] = entry;
    } else {
        list.push(entry);
    }

    write_json(path, config);

    return { kind: file.existed ? 'updated' : 'written' };
};

/**
 * Writes a file the tool owns outright (rule files, steering docs,
 * instruction files): compare, write when different, and report
 *
 * @param path the file to write
 * @param content the full file content
 * @param action the action name for the result
 */
export const upsert_own_file = (path: string, content: string, action: string): ActionResult => {
    const existing = read_text(path);

    if (existing === content) {
        return { action, kind: 'skipped', detail: `already present at ${path}` };
    }

    write_text(path, content);

    return {
        action,
        kind: existing.length === 0 ? 'written' : 'updated',
        detail: path
    };
};

/**
 * Upserts the marker-fenced agent-instructions block at the top of an
 * AGENTS.md-style file and reports the outcome; tools sharing the same file
 * (the project-root AGENTS.md) dedupe automatically because the second
 * upsert finds the block unchanged
 *
 * @param path the markdown file to update
 * @param instructions the agent instructions text to place in the block
 */
export const agents_md_result = (path: string, instructions: string): ActionResult => {
    const text = read_text(path);

    const { text: updated, changed } = upsert_marker_block(text, instructions, 'html', 'prepend');

    if (!changed) {
        return { action: 'Agent instructions', kind: 'skipped', detail: `already present in ${path}` };
    }

    write_text(path, updated);

    return {
        action: 'Agent instructions',
        kind: text.length === 0 ? 'written' : 'updated',
        detail: path
    };
};
