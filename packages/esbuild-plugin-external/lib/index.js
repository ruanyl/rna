import { readFile } from 'fs/promises';
import pkgUp from 'pkg-up';
import { getRootDir } from '@chialab/esbuild-helpers';

/**
 * @typedef {Object} PluginOptions
 * @property {boolean|string[]} [dependencies]
 * @property {boolean|string[]} [peerDependencies]
 * @property {boolean|string[]} [optionalDependencies]
 */

/**
 * Collect or exclude module dependencies to bundle.
 * @param {PluginOptions} [options]
 * @return An esbuild plugin.
 */
export default function({ dependencies = true, peerDependencies = false, optionalDependencies = false } = {}) {
    /**
     * @type {import('esbuild').Plugin}
     */
    const plugin = {
        name: 'external',
        async setup(build) {
            build.onResolve({ filter: /^https?:\/\// }, (args) => ({
                path: args.path,
                external: true,
            }));

            const { bundle, external = [] } = build.initialOptions;
            if (!bundle) {
                return;
            }

            const rootDir = getRootDir(build);
            const packageFile = await pkgUp({
                cwd: rootDir,
            });

            if (packageFile) {
                const packageJson = JSON.parse(await readFile(packageFile, 'utf-8'));
                if (dependencies) {
                    external.push(...(
                        dependencies === true ?
                            Object.keys(packageJson.dependencies || {}) :
                            dependencies
                    ));
                }
                if (peerDependencies) {
                    external.push(...(
                        peerDependencies === true ?
                            Object.keys(packageJson.peerDependencies || {}) :
                            peerDependencies
                    ));
                }
                if (optionalDependencies) {
                    external.push(...(
                        optionalDependencies === true ?
                            Object.keys(packageJson.optionalDependencies || {}) :
                            optionalDependencies
                    ));
                }
            }

            build.initialOptions.external = external;
        },
    };

    return plugin;
}
