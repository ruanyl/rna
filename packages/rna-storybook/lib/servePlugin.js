import path from 'path';
import { getRequestFilePath } from '@web/dev-server-core';
import { CSS_EXTENSIONS, JSON_EXTENSIONS } from '@chialab/node-resolve';
import { resolveImport } from '@chialab/wds-plugin-rna';
import { loadAddons } from './loadAddon.js';
import { findStories } from './findStories.js';
import { createManagerHtml, createManagerScript, createManagerStyle } from './createManager.js';
import { createPreviewHtml, createPreviewScript, createPreviewStyle } from './createPreview.js';
import { transformMdxToCsf } from './transformMdxToCsf.js';

const regexpReplaceWebsocket = /<!-- injected by web-dev-server -->(.|\s)*<\/script>/m;

/**
 * @typedef {import('@web/dev-server-core').Plugin} Plugin
 */

/**
 * @param {import('./createPlugin').StorybookConfig} options
 */
export function servePlugin({ type, stories: storiesPattern, addons = [], managerEntries = [], previewEntries = [], managerHead, previewHead, previewBody }) {
    /**
     * @type {import('@web/dev-server-core').DevServerCoreConfig}
     */
    let serverConfig;

    /**
     * @type {Promise<[string[], string[]]>}
     */
    let addonsLoader;

    /**
     * @type {Plugin}
     */
    const plugin = {
        name: 'rna-storybook',

        serverStart(args) {
            serverConfig = args.config;
            addonsLoader = loadAddons(addons, serverConfig.rootDir);
        },

        resolveMimeType(context) {
            if (context.URL.searchParams.get('story') !== 'true') {
                return;
            }

            if (context.path.endsWith('.mdx')) {
                return 'js';
            }
        },

        transformImport({ source, context }) {
            if (context.response.is('js') &&
                CSS_EXTENSIONS.includes(path.extname(source))) {
                if (source.includes('?')) {
                    return `${source}&module=style`;
                }
                return `${source}?module=style`;
            }

            if (JSON_EXTENSIONS.includes(path.extname(source))) {
                return;
            }

            if (source.includes('/@storybook/') ||
                (context.path.includes('/@storybook/') && source[0] === '.')) {
                source = source.replace('/dist/esm/', '/dist/cjs/');
            }

            if (context.path === '/manager.js' || context.URL.searchParams.has('manager')) {
                if (source.includes('?')) {
                    return `${source}&manager=true`;
                }
                return `${source}?manager=true`;
            }

            if (context.path === '/preview.js' ||
                context.URL.searchParams.has('preview') ||
                context.URL.searchParams.has('story')) {
                if (source.includes('?')) {
                    return `${source}&preview=true`;
                }
                return `${source}?preview=true`;
            }
        },

        async resolveImport({ source, context, code, line, column }) {
            if (source === '@storybook/manager') {
                return await resolveImport('../storybook/manager/index.js', import.meta.url, serverConfig.rootDir, { code, line, column });
            }

            if (source === `@storybook/${type}`) {
                return await resolveImport(`../storybook/${type}/index.js`, import.meta.url, serverConfig.rootDir, { code, line, column });
            }

            const bundledModules = [
                `@storybook/${type}`,
                '@storybook/api',
                '@storybook/addons',
                '@storybook/client-api',
                '@storybook/client-logger',
                '@storybook/components',
                '@storybook/core-events',
                '@storybook/theming',
                '@storybook/addon-docs',
                'react',
                'react-dom',
                'react-is',
            ];

            if (type === 'web-components') {
                bundledModules.push('lit-html');
            }

            if (bundledModules.includes(source)) {
                if (context.URL.searchParams.has('manager')) {
                    return resolveImport('../storybook/manager/index.js', import.meta.url, serverConfig.rootDir, { code, line, column });
                }
                if (context.URL.searchParams.has('preview')) {
                    return resolveImport(`../storybook/${type}/index.js`, import.meta.url, serverConfig.rootDir, { code, line, column });
                }
            }
        },

        async transform(context) {
            if (typeof context.body !== 'string') {
                return;
            }

            if (context.path === '/') {
                // replace the injected websocket script to avoid reloading the manager in watch mode
                context.body = context.body.replace(regexpReplaceWebsocket, '');
                return;
            }

            if (context.URL.searchParams.get('story') === 'true') {
                const filePath = getRequestFilePath(context.url, serverConfig.rootDir);
                if (context.path.endsWith('.mdx')) {
                    context.body = await transformMdxToCsf(type, context.body, filePath);
                }
            }
        },

        async serve(context) {
            if (!serverConfig) {
                return;
            }

            if (context.path === '/') {
                return createManagerHtml({
                    managerHead,
                    css: {
                        path: '/manager.css',
                    },
                    js: {
                        path: '/manager.js',
                        type: 'module',
                    },
                });
            }

            if (context.path === '/iframe.html') {
                return {
                    type: 'html',
                    body: await createPreviewHtml({
                        previewHead,
                        previewBody,
                        css: {
                            path: '/preview.css',
                        },
                        js: {
                            path: '/preview.js',
                            type: 'module',
                        },
                    }),
                };
            }

            if (context.path.startsWith('/manager.js')) {
                const [manager] = await addonsLoader;
                return createManagerScript({
                    addons,
                    managerEntries: [
                        ...manager,
                        ...managerEntries,
                    ],
                });
            }

            if (context.path.startsWith('/manager.css')) {
                return createManagerStyle();
            }

            if (context.path.startsWith('/preview.js')) {
                const [, preview] = await addonsLoader;
                const stories = await findStories(serverConfig.rootDir, storiesPattern);
                return createPreviewScript({
                    type,
                    stories: stories
                        .map((storyFilePath) => `./${path.relative(
                            serverConfig.rootDir,
                            storyFilePath
                        ).split(path.sep).join('/')}`)
                        .map(i => `${i}?story=true`),
                    previewEntries: [
                        ...preview,
                        ...previewEntries,
                    ],
                });
            }

            if (context.path.startsWith('/preview.css')) {
                return createPreviewStyle();
            }
        },
    };

    return plugin;
}
