var path = require('path'),
    fs = require('fs'),
    gulp = require('gulp'),
    gutil = require('gulp-util'),
    clean = require('gulp-clean'),
    es6ify = require('es6ify'),
    browserify = require('browserify'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    replace = require('gulp-replace'),
    size = require('gulp-size'),
    gzip = require("gulp-gzip"),
    traceur = require('gulp-traceur'),
    source = require('vinyl-source-stream'),
    map = require('through2-map')
    es = require('event-stream');

// Configuration

var srcFiles = './src/**/*.js',
    fileName = 'jquery-evergreen.js',
    browserifyEntryPoint = './src/main.js',
    distFolder = 'dist/',
    releaseFolder = '.release/',
    pkg = require('./package.json'),
    uglifyOptions = {
        mangle: true,
        preserveComments: false,
        compress: true,
        'screw-ie8': true
    };

var bundlePresets = {
    default: {
        modulesToExclude: ['dom_extra', 'mode', 'selector_extra'],
        dest: path.resolve(releaseFolder)
    },
    full: {
        modulesToExclude: [],
        dest: path.resolve(releaseFolder, 'bundle/full')
    },
    bare: {
        modulesToExclude: ['attr', 'dom_extra', 'html', 'mode', 'selector_extra'],
        dest: path.resolve(releaseFolder, 'bundle/bare')
    },
    custom: {
        modulesToExclude: gutil.env.exclude ? gutil.env.exclude.split(',') : [],
        dest: distFolder
    }
};

// Task grouping

gulp.task('default', ['build']);

gulp.task('build', ['uglify-dist']);

gulp.task('build-release', ['uglify', 'transpile-cjs', 'transpile-amd']);

// Simple tasks

gulp.task('clean', function() {
    return gulp.src([distFolder, releaseFolder], {
        read: false
    }).pipe(clean());
});

gulp.task('watch', function() {
    return gulp.watch(srcFiles, ['bundle']);
});

// Transpile ES6 Modules to CommonJS/AMD

gulp.task('transpile-cjs', ['clean'], function() {
    return gulp.src(srcFiles)
        .pipe(traceur())
        .pipe(replace(/__VERSION__/, pkg.version))
        .pipe(gulp.dest(releaseFolder + 'commonjs'));

});

gulp.task('transpile-amd', ['clean'], function() {
    return gulp.src(srcFiles)
        .pipe(traceur({
            modules: 'amd'
        }))
        .pipe(replace(/__VERSION__/, pkg.version))
        .pipe(gulp.dest(releaseFolder + 'amd'));

});

gulp.task('bundle', ['clean'], function() {

    function bundle(preset) {

        var b = browserify()
            .require(require.resolve(browserifyEntryPoint), {
                entry: true
            })
            .transform(es6ify);

        bundlePresets[preset].modulesToExclude.map(function(moduleName) {
            return './' + moduleName;
        }).map(b.exclude.bind(b));

        return b
            .bundle({
                standalone: 'jQueryEvergreen'
            })
            .pipe(modify([version, dollar, unget]))
            .pipe(modify(exclude(preset))).pipe(source(fileName)).pipe(gulp.dest(bundlePresets[preset].dest));
    }

    return es.concat(
        bundle('custom'),
        bundle('full'),
        bundle('default'),
        bundle('bare')
    )

});

gulp.task('uglify-dist', ['bundle'], function() {
    return gulp.src(distFolder + '*.js')
        .pipe(uglify(uglifyOptions))
        .pipe(rename(function(path) {
            path.basename += '.min';
        }))
        .pipe(gulp.dest(distFolder))
        .pipe(gzip())
        .pipe(size({
            showFiles: true
        }));
});

gulp.task('uglify-bundles', ['bundle'], function() {
    return gulp.src([
        releaseFolder + '**/*.js',
        '!' + releaseFolder + 'amd/**/*.js',
        '!' + releaseFolder + 'commonjs/**/*.js'
    ], {
        base: releaseFolder
    })
        .pipe(uglify(uglifyOptions))
        .pipe(rename(function(path) {
            path.basename += '.min';
        }))
        .pipe(gulp.dest(releaseFolder))
        .pipe(gzip())
        .pipe(size({
            showFiles: true
        }));
});

gulp.task('uglify', ['uglify-dist', 'uglify-bundles']);

// Text-based modifiers

function version(data) {
    return data.replace(/__VERSION__/, pkg.version);
}

function dollar(data) {
    return data.replace(/(jQueryEvergreen)=([^\(])\(\)/, '$=$2()["default"]');
}

function exclude(preset) {
    var modulesToExclude = bundlePresets[preset].modulesToExclude,
        removeDeReqsRE = new RegExp('.+_dereq_.+(__M__).+\\n'.replace(/__M__/g, modulesToExclude.join('|')), 'g'),
        removeExtendsRE = new RegExp('(,\\ (__M__))'.replace(/__M__/g, modulesToExclude.join('|')), 'g');
    return function(data) {
        return modulesToExclude.length ? data.replace(removeDeReqsRE, '').replace(removeExtendsRE, '') : data;
    }
}

function unget(data) {
    return data.replace(/get\ (.*)\(\)\ {\n\s+return\ (.*);\n\s+}/g, '$1: $2')
}

function modify(modifiers) {
    return map({
        wantStrings: true
    }, function(data) {
        (typeof modifiers === 'function' ? [modifiers] : modifiers).forEach(function(modifier) {
            data = modifier(data);
        });
        return data;
    })
}