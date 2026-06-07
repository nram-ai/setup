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

export enum Harness {
    ANTHROPIC_CLAUDE_CODE = 1,
    OPENAI_CODEX = 2,
    OPENCODE = 3,
    CURSOR = 4,
    AMP = 5,
    OPENCLAW = 6,
    GITHUB_COPILOT_CLI = 7,
    FACTORY_DROID = 8,
    HERMES = 9,
    JETBRAINS_JUNIE = 10,
    KILO_CODE = 11,
    KIRO = 12,
    PI = 13,
    TRAE = 14,
    VSCODE = 15,
    GOOGLE_ANTIGRAVITY = 16,
    KIMI_CODE = 17,
    MISTRAL_VIBE = 18,
    XAI_GROK_BUILD = 19
}

export enum Scope {
    USER = 1,
    PROJECT = 2
}

/**
 * The options collected from the user that drive every harness configurator
 */
export interface SetupOptions {
    scope: Scope;
    /** The normalized nram base URL; embedded into SessionStart hook commands */
    base_url: string;
    /** The MCP endpoint URL; undefined when MCP registration was not requested */
    mcp_url?: string;
    /** Present only when the user chose API-key authentication */
    api_key?: string;
    /**
     * The agent instructions to inject (SessionStart hook, AGENTS.md, or
     * rules file), resolved from the server; undefined when not requested.
     * `full` feeds AGENTS.md-style embeds, `condensed` the always-injected
     * surfaces (rules files, steering docs)
     */
    instructions?: { full: string; condensed: string };
}

export type ActionKind = 'written' | 'updated' | 'skipped' | 'manual' | 'failed';

/**
 * The outcome of a single configuration action taken (or not taken) by a configurator
 */
export interface ActionResult {
    /** Short action name, e.g. `MCP registration` */
    action: string;
    kind: ActionKind;
    /** The file path, command, or manual instruction the user needs to see */
    detail: string;
}

/**
 * Describes a supported harness: how to detect it and how to configure it
 */
export interface HarnessDescriptor {
    harness: Harness;
    label: string;
    detected: (scope: Scope) => boolean;
    configure: (options: SetupOptions) => Promise<ActionResult[]>;
}
