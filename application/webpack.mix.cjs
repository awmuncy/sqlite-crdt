const mix = require('laravel-mix');

mix
    .webpackConfig({
        resolve: {
            fallback: {
                crypto: false,
                fs: false,
                path: false
            }
        }
    })
    .js('./application.js', '../dist/application.js')
    .sourceMaps();