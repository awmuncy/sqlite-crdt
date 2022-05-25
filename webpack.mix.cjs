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
    .js('./src/application/application.js', './dist/application.js')
    .sourceMaps();