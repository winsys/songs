#!/usr/bin/env node
/**
 * Build helper for the terser contract (CLAUDE.md §3).
 *
 * Usage:
 *   node tools/minify.js              rebuild only stale .min.js files
 *   node tools/minify.js <name...>    rebuild the given files (e.g. "tech")
 *   node tools/minify.js --all        rebuild every .min.js
 *   node tools/minify.js --check      exit 1 if any .min.js is older than its source
 *
 * Only files in public/js that HAVE a .min.js counterpart are touched, so
 * min-only files (csrf_interceptor.min.js) are never overwritten. After a
 * rebuild the script lists the templates referencing the file so the ?v=N
 * cache-busting bump is not forgotten.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'public', 'js');
const TPL_DIR = path.join(ROOT, 'templates');

function pairs() {
    return fs.readdirSync(JS_DIR)
        .filter(function (f) { return f.endsWith('.js') && !f.endsWith('.min.js'); })
        .map(function (f) {
            const name = path.basename(f, '.js');
            return {
                name: name,
                src: path.join(JS_DIR, f),
                min: path.join(JS_DIR, name + '.min.js'),
            };
        })
        .filter(function (p) { return fs.existsSync(p.min); });
}

function isStale(p) {
    return fs.statSync(p.src).mtimeMs > fs.statSync(p.min).mtimeMs + 1;
}

function minify(p) {
    console.log('terser: ' + p.name + '.js -> ' + p.name + '.min.js');
    execFileSync('npx', ['terser', p.src, '-o', p.min, '--compress'], {
        stdio: 'inherit',
        shell: process.platform === 'win32', // npx is a .cmd shim on Windows
    });
}

function templateRefs(name) {
    return fs.readdirSync(TPL_DIR)
        .filter(function (t) { return t.endsWith('.html'); })
        .filter(function (t) {
            const c = fs.readFileSync(path.join(TPL_DIR, t), 'utf8');
            return c.indexOf(name + '.min.js?v=') !== -1 || c.indexOf(name + '.js?v=') !== -1;
        });
}

const args = process.argv.slice(2);

if (args[0] === '--check') {
    const stale = pairs().filter(isStale);
    if (stale.length) {
        console.error('STALE minified files (run: npm run min):');
        stale.forEach(function (p) { console.error('  ' + p.name); });
        process.exit(1);
    }
    console.log('all .min.js files are up to date');
    process.exit(0);
}

let targets = pairs();
if (args.length && args[0] !== '--all') {
    const names = args.map(function (a) { return a.replace(/\.js$/, ''); });
    targets = targets.filter(function (p) { return names.indexOf(p.name) !== -1; });
    if (!targets.length) {
        console.error('no matching js files with a .min.js counterpart: ' + args.join(', '));
        process.exit(1);
    }
} else if (!args.length) {
    targets = targets.filter(isStale);
    if (!targets.length) {
        console.log('nothing stale to minify');
        process.exit(0);
    }
}

targets.forEach(function (p) {
    minify(p);
    const refs = templateRefs(p.name);
    if (refs.length) {
        console.log('  reminder: bump ?v=N in: ' + refs.join(', '));
    }
});
