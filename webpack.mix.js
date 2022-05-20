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
    .js('./src/index.js', './dist/index.js');