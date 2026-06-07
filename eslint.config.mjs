import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default defineConfig([
    js.configs.recommended,
    tseslint.configs.recommended,
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: true,
        commaDangle: 'never',
        braceStyle: '1tbs'
    }),
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },

        rules: {
            '@stylistic/indent': ['error', 4, {
                SwitchCase: 1
            }],

            '@stylistic/max-len': ['error', {
                code: 120
            }],

            '@stylistic/space-before-function-paren': ['error', 'always'],
            '@stylistic/quote-props': ['error', 'as-needed'],

            '@stylistic/operator-linebreak': ['error', 'after', {
                overrides: {
                    '?': 'before',
                    ':': 'before'
                }
            }],

            eqeqeq: ['error', 'always', {
                null: 'ignore'
            }],

            'no-var': 'error',
            'prefer-const': ['error', {
                destructuring: 'all'
            }],

            camelcase: 'off',

            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off'
        }
    }
]);
