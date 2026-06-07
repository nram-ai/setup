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

import { existsSync } from 'fs';
import { resolve } from 'path';
import { Harness, HarnessDescriptor, Scope } from '../types';
import {
    amp_dir,
    antigravity_dir,
    claude_dir,
    codex_dir,
    copilot_dir,
    cursor_dir,
    factory_dir,
    hermes_dir,
    junie_dir,
    kilo_dir,
    kimi_dir,
    kiro_dir,
    openclaw_dir,
    opencode_dir,
    pi_dir,
    trae_dir,
    vscode_user_dir
} from './paths';
import { configure_amp } from './configure/amp';
import { configure_antigravity } from './configure/antigravity';
import { configure_claude_code } from './configure/claude_code';
import { configure_codex } from './configure/codex';
import { configure_copilot } from './configure/copilot';
import { configure_cursor } from './configure/cursor';
import { configure_droid } from './configure/droid';
import { configure_hermes } from './configure/hermes';
import { configure_junie } from './configure/junie';
import { configure_kilo } from './configure/kilo';
import { configure_kimi } from './configure/kimi';
import { configure_kiro } from './configure/kiro';
import { configure_openclaw } from './configure/openclaw';
import { configure_opencode } from './configure/opencode';
import { configure_pi } from './configure/pi';
import { configure_trae } from './configure/trae';
import { configure_vscode } from './configure/vscode';

export { Harness, Scope };

/**
 * The harnesses this tool knows how to configure, ordered alphabetically by
 * label, with per-scope detection: user scope checks the tool's home
 * directory, project scope checks the tool's directory in the repository
 */
export const HARNESSES: HarnessDescriptor[] = [{
    harness: Harness.AMP,
    label: 'Amp',
    detected: scope => existsSync(amp_dir(scope)),
    configure: configure_amp
}, {
    harness: Harness.GOOGLE_ANTIGRAVITY,
    label: 'Antigravity',
    detected: scope => scope === Scope.USER
        ? existsSync(antigravity_dir())
        : existsSync(resolve(process.cwd(), '.agent')),
    configure: configure_antigravity
}, {
    harness: Harness.ANTHROPIC_CLAUDE_CODE,
    label: 'Claude Code',
    detected: scope => existsSync(claude_dir(scope)),
    configure: configure_claude_code
}, {
    harness: Harness.OPENAI_CODEX,
    label: 'Codex',
    detected: scope => existsSync(codex_dir(scope)),
    configure: configure_codex
}, {
    harness: Harness.CURSOR,
    label: 'Cursor',
    detected: scope => existsSync(cursor_dir(scope)),
    configure: configure_cursor
}, {
    harness: Harness.FACTORY_DROID,
    label: 'Droid',
    detected: scope => existsSync(factory_dir(scope)),
    configure: configure_droid
}, {
    harness: Harness.GITHUB_COPILOT_CLI,
    label: 'GitHub Copilot CLI',
    detected: scope => scope === Scope.USER
        ? existsSync(copilot_dir())
        : existsSync(resolve(process.cwd(), '.github', 'copilot-instructions.md')),
    configure: configure_copilot
}, {
    harness: Harness.HERMES,
    label: 'Hermes',
    detected: scope => scope === Scope.USER && existsSync(hermes_dir()),
    configure: configure_hermes
}, {
    harness: Harness.JETBRAINS_JUNIE,
    label: 'Junie',
    detected: scope => existsSync(junie_dir(scope)),
    configure: configure_junie
}, {
    harness: Harness.KILO_CODE,
    label: 'Kilo Code',
    detected: scope => scope === Scope.USER
        ? existsSync(kilo_dir(scope))
        : existsSync(kilo_dir(scope)) || existsSync(resolve(process.cwd(), 'kilo.jsonc')),
    configure: configure_kilo
}, {
    harness: Harness.KIMI_CODE,
    label: 'Kimi Code',
    detected: scope => scope === Scope.USER && existsSync(kimi_dir()),
    configure: configure_kimi
}, {
    harness: Harness.KIRO,
    label: 'Kiro',
    detected: scope => existsSync(kiro_dir(scope)),
    configure: configure_kiro
}, {
    harness: Harness.OPENCLAW,
    label: 'OpenClaw',
    detected: scope => scope === Scope.USER && existsSync(openclaw_dir()),
    configure: configure_openclaw
}, {
    harness: Harness.OPENCODE,
    label: 'OpenCode',
    detected: scope => scope === Scope.USER
        ? existsSync(opencode_dir(scope))
        : existsSync(resolve(process.cwd(), 'opencode.json')) || existsSync(resolve(process.cwd(), '.opencode')),
    configure: configure_opencode
}, {
    harness: Harness.PI,
    label: 'Pi',
    detected: scope => scope === Scope.USER
        ? existsSync(resolve(pi_dir(), '..'))
        : existsSync(resolve(process.cwd(), '.pi')),
    configure: configure_pi
}, {
    harness: Harness.TRAE,
    label: 'Trae',
    detected: scope => existsSync(trae_dir(scope)),
    configure: configure_trae
}, {
    harness: Harness.VSCODE,
    label: 'VS Code',
    detected: scope => scope === Scope.USER
        ? existsSync(vscode_user_dir())
        : existsSync(resolve(process.cwd(), '.vscode')),
    configure: configure_vscode
}];
