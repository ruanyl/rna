import mdx from '@mdx-js/mdx';
import esbuild from 'esbuild';
import { createCompiler } from '@storybook/csf-tools/mdx.js';

const compilers = [createCompiler({})];

/**
 * @param {string} body
 * @param {string} filePath
 */
export async function transformMdxToCsf(body, filePath) {
    body = `import React from 'react';
import { mdx } from '@mdx-js/react';

${body}`;

    body = await mdx(body, { compilers, filepath: filePath });
    return esbuild.transform(body, {
        loader: 'jsx',
        sourcemap: false,
        tsconfigRaw: '{ "compilerOptions": { "jsxFactory": "mdx" } }',
        jsxFactory: 'mdx',
    });
}
