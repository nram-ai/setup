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

/**
 * Normalizes an nram base URL: trims whitespace, requires http/https,
 * and strips any trailing slash so that paths can be appended safely
 *
 * @param input the user-supplied base URL
 * @returns the normalized base URL
 * @throws Error when the input is not a valid http(s) URL
 */
export const normalize_base_url = (input: string): string => {
    const trimmed = input.trim();

    const url = new URL(trimmed); // throws on invalid input

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('The nram base URL must use http or https');
    }

    if (url.search.length !== 0 || url.hash.length !== 0) {
        throw new Error('The nram base URL must not contain a query string or fragment');
    }

    const pathname = url.pathname.replace(/\/+$/, '');

    return `${url.origin}${pathname}`;
};

/**
 * Derives the MCP endpoint URL from a normalized base URL
 *
 * @param base_url the normalized nram base URL
 */
export const mcp_url = (base_url: string): string => `${base_url}/mcp`;
