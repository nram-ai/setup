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

import { homedir } from 'os';
import { resolve } from 'path';
import { Scope } from '../types';

/**
 * Resolved per call (homedir() consults USERPROFILE/HOME at call time) so
 * tests can redirect the home directory through the environment
 */
const user_home = (): string => homedir();

/**
 * The XDG configuration root (`$XDG_CONFIG_HOME` else `~/.config`)
 */
const xdg_config = (): string =>
    process.env.XDG_CONFIG_HOME ?? resolve(user_home(), '.config');

/**
 * Returns the Claude Code configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const claude_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(process.env.CLAUDE_CONFIG_DIR ?? resolve(user_home(), '.claude'))
        : resolve(process.cwd(), '.claude');

/**
 * Returns the Codex home directory for the given scope
 *
 * @param scope the configuration scope
 */
export const codex_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(process.env.CODEX_HOME ?? resolve(user_home(), '.codex'))
        : resolve(process.cwd(), '.codex');

/**
 * Returns the OpenCode configuration directory for the given scope
 *
 * Note: OpenCode documents `~/.config/opencode` as the global location on all
 * platforms; `XDG_CONFIG_HOME` is honored when set. At project scope, OpenCode
 * reads `opencode.json` and `AGENTS.md` from the repository root.
 *
 * @param scope the configuration scope
 */
export const opencode_dir = (scope: Scope): string =>
    scope === Scope.USER ? resolve(xdg_config(), 'opencode') : resolve(process.cwd());

/**
 * Returns the Cursor configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const cursor_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(user_home(), '.cursor')
        : resolve(process.cwd(), '.cursor');

/**
 * Returns the Amp configuration directory for the given scope; Amp documents
 * `~/.config/amp` on every platform, including `%USERPROFILE%\.config\amp`
 * on Windows
 *
 * @param scope the configuration scope
 */
export const amp_dir = (scope: Scope): string =>
    scope === Scope.USER ? resolve(xdg_config(), 'amp') : resolve(process.cwd(), '.amp');

/**
 * Returns the Google Antigravity configuration directory (user level only;
 * Antigravity documents project-local MCP config as read-but-ignored)
 */
export const antigravity_dir = (): string =>
    resolve(user_home(), '.gemini', 'antigravity');

/**
 * Returns the shared `~/.gemini` directory, where Antigravity reads the
 * cross-tool AGENTS.md (GEMINI.md is avoided deliberately: both Antigravity
 * and Gemini CLI write it, a documented conflict)
 */
export const gemini_dir = (): string =>
    resolve(user_home(), '.gemini');

/**
 * Returns the OpenClaw state directory (user level only; the gateway has no
 * project-scoped configuration)
 */
export const openclaw_dir = (): string =>
    resolve(user_home(), '.openclaw');

/**
 * Returns the GitHub Copilot CLI configuration directory (user level only
 * for MCP; honors COPILOT_HOME)
 */
export const copilot_dir = (): string =>
    resolve(process.env.COPILOT_HOME ?? resolve(user_home(), '.copilot'));

/**
 * Returns the Factory (droid) configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const factory_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(user_home(), '.factory')
        : resolve(process.cwd(), '.factory');

/**
 * Returns the Hermes configuration directory (user level only; Hermes has no
 * project-scoped configuration)
 */
export const hermes_dir = (): string =>
    resolve(user_home(), '.hermes');

/**
 * Returns the JetBrains Junie configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const junie_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(user_home(), '.junie')
        : resolve(process.cwd(), '.junie');

/**
 * Returns the Kilo Code configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const kilo_dir = (scope: Scope): string =>
    scope === Scope.USER ? resolve(xdg_config(), 'kilo') : resolve(process.cwd(), '.kilo');

/**
 * Returns the Kimi Code CLI configuration directory (user level only; no
 * project-scoped configuration is documented)
 */
export const kimi_dir = (): string =>
    resolve(user_home(), '.kimi');

/**
 * Returns the Kiro configuration directory for the given scope (honors
 * KIRO_HOME at user scope)
 *
 * @param scope the configuration scope
 */
export const kiro_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(process.env.KIRO_HOME ?? resolve(user_home(), '.kiro'))
        : resolve(process.cwd(), '.kiro');

/**
 * Returns the Pi coding agent configuration directory (user level; Pi keeps
 * its agent state under `~/.pi/agent`)
 */
export const pi_dir = (): string =>
    resolve(user_home(), '.pi', 'agent');

/**
 * Returns the Vibe (Mistral) home directory for the given scope (honors
 * VIBE_HOME at user scope)
 *
 * @param scope the configuration scope
 */
export const vibe_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(process.env.VIBE_HOME ?? resolve(user_home(), '.vibe'))
        : resolve(process.cwd(), '.vibe');

/**
 * Returns the Grok Build configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const grok_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(user_home(), '.grok')
        : resolve(process.cwd(), '.grok');

/**
 * Returns the Trae configuration directory for the given scope
 *
 * @param scope the configuration scope
 */
export const trae_dir = (scope: Scope): string =>
    scope === Scope.USER
        ? resolve(user_home(), '.trae')
        : resolve(process.cwd(), '.trae');

/**
 * Resolves the AGENTS.md a harness reads: its own user-level file at user
 * scope, the shared repository-root AGENTS.md at project scope (where all
 * AGENTS.md-reading harnesses dedupe into one marker block)
 *
 * @param scope the configuration scope
 * @param user_file the harness's user-level instructions file
 */
export const agents_md_path = (scope: Scope, user_file: string): string =>
    scope === Scope.USER ? user_file : resolve(process.cwd(), 'AGENTS.md');

/**
 * Returns the VS Code user profile directory per platform
 */
export const vscode_user_dir = (): string => {
    if (process.platform === 'win32') {
        return resolve(process.env.APPDATA ?? resolve(user_home(), 'AppData', 'Roaming'), 'Code', 'User');
    }

    if (process.platform === 'darwin') {
        return resolve(user_home(), 'Library', 'Application Support', 'Code', 'User');
    }

    return resolve(xdg_config(), 'Code', 'User');
};
