import { rspack } from '@rspack/core';

/**
 * Production-only Rspack configuration layered on top of the Nest CLI defaults.
 * Development continues to use the regular Nest TypeScript workflow.
 *
 * @param {import('@rspack/core').Configuration} defaults
 * @returns {import('@rspack/core').Configuration}
 */
export default function createProductionConfig(defaults) {
  return {
    ...defaults,
    mode: 'production',
    target: 'node24',
    devtool: 'hidden-source-map',
    optimization: {
      ...defaults.optimization,
      nodeEnv: 'production',
      minimize: true,
      minimizer: [
        new rspack.SwcJsMinimizerRspackPlugin({
          extractComments: false,
          minimizerOptions: {
            module: true,
            compress: {
              passes: 3,
            },
            mangle: {
              keep_classnames: true,
            },
            format: {
              comments: false,
            },
          },
        }),
      ],
    },
  };
}
