// Run: node --test test/generators.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const created = [];
// 'exit', not node:test after(): Node 16's runner never calls a top-level after hook.
process.on("exit", () => created.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

test("both generators load on this Node version", async () => {
  // Guards against syntax only some Node versions accept (e.g. JSON import attributes).
  assert.equal(typeof (await import("../generators/app/index.js")).default, "function");
  assert.equal(typeof (await import("../generators/action/index.js")).default, "function");
});

// The methods under test only need destinationPath, fs.readJSON/writeJSON/read and log from the generator.
async function fakeThis(root) {
  const logs = [];
  const writes = [];
  return {
    logs,
    writes,
    destinationPath: (p = "") => path.join(root, p),
    fs: {
      readJSON: (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : def),
      writeJSON: (f, v) => { writes.push(f); fs.writeFileSync(f, JSON.stringify(v, null, 2)); },
      read: (f, o) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : o.defaults),
    },
    log: (s) => logs.push(s),
  };
}

async function ensureKiboJson(root, manifestsWrittenNow) {
  const ActionGenerator = (await import("../generators/action/index.js")).default;
  const fake = await fakeThis(root);
  ActionGenerator.prototype._ensureKiboJson.call(fake, manifestsWrittenNow);
  const file = path.join(root, "kibo.json");
  const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
  let config;
  try { config = raw === undefined ? undefined : JSON.parse(raw); } catch (e) { config = undefined; } // some tests leave it unparseable
  return { config, fake, raw };
}

function tmpApp(manifests, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kibojson-"));
  created.push(root);
  manifests.forEach((m) => {
    fs.mkdirSync(path.dirname(path.join(root, m)), { recursive: true });
    fs.writeFileSync(path.join(root, m), "module.exports = {};");
  });
  Object.keys(files).forEach((f) => {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), files[f]);
  });
  return root;
}

const SF = "assets/src/storefront.manifest.js";

test("creates kibo.json with a none default and a none entry per manifest, contextReuse first", async () => {
  const root = tmpApp([SF]);
  const { config, fake } = await ensureKiboJson(root, ["assets/src/commerce.carts.manifest.js"]);
  assert.deepEqual(config, {
    contextReuse: "none",
    functions: { [SF]: { contextReuse: "none" }, "assets/src/commerce.carts.manifest.js": { contextReuse: "none" } },
  });
  assert.deepEqual(Object.keys(config), ["contextReuse", "functions"]);
  assert.match(fake.logs.join("\n"), /added .*storefront\.manifest\.js/);
});

test("keeps existing values and only adds missing manifests, nested ones included", async () => {
  const root = tmpApp([SF, "assets/src/sub/nested.manifest.js"], {
    "kibo.json": JSON.stringify({ contextReuse: "warm", functions: { [SF]: { contextReuse: "warm", x: 1 } } }),
  });
  const { config } = await ensureKiboJson(root, []);
  assert.equal(config.contextReuse, "warm");
  assert.deepEqual(config.functions[SF], { contextReuse: "warm", x: 1 });
  assert.deepEqual(config.functions["assets/src/sub/nested.manifest.js"], { contextReuse: "none" });
});

test("nothing to add: the file is not rewritten (a hand-formatted file stays byte-identical), and there is no remark", async () => {
  const root = tmpApp([SF]);
  const handFormatted = '{\r\n    "contextReuse": "none",\r\n    "functions": {\r\n        "' + SF + '": { "contextReuse": "warm" }\r\n    }\r\n}\r\n';
  fs.writeFileSync(path.join(root, "kibo.json"), handFormatted);
  const { raw, fake } = await ensureKiboJson(root, [SF]);
  assert.equal(raw, handFormatted);
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.logs.length, 0);
});

test("a file that only lacks the top-level default gets it first, is rewritten, and the author is told", async () => {
  const root = tmpApp([SF], { "kibo.json": JSON.stringify({ functions: { [SF]: { contextReuse: "warm" } }, note: 1 }) });
  const { config, fake } = await ensureKiboJson(root, []);
  assert.deepEqual(Object.keys(config), ["contextReuse", "functions", "note"]);
  assert.equal(config.functions[SF].contextReuse, "warm");
  assert.equal(fake.writes.length, 1);
  assert.match(fake.logs.join("\n"), /top-level contextReuse "none"/);
});

test("an own __proto__ key in an existing file survives the rewrite", async () => {
  const root = tmpApp([SF], { "kibo.json": '{"b":2,"__proto__":{"a":1},"functions":{}}' });
  const { raw } = await ensureKiboJson(root, []);
  assert.match(raw, /"__proto__"\s*:\s*\{\s*"a"\s*:\s*1/);
  assert.match(raw, /"b"\s*:\s*2/);
});

test("a manifest whose name differs only in case is not added (grunt's glob would not build it)", async () => {
  const root = tmpApp(["assets/src/Upper.MANIFEST.JS", SF]);
  const { config } = await ensureKiboJson(root, []);
  assert.deepEqual(Object.keys(config.functions), [SF]);
});

test("an existing file keeps its key order when contextReuse already exists", async () => {
  const root = tmpApp([SF]);
  fs.writeFileSync(path.join(root, "kibo.json"), JSON.stringify({ functions: {}, contextReuse: "warm", note: 1 }));
  const { config } = await ensureKiboJson(root, []);
  assert.deepEqual(Object.keys(config), ["functions", "contextReuse", "note"]);
});

// Files the generator cannot safely edit stay exactly as they are, with a message, and the run does not crash.
for (const [name, raw] of [
  ["invalid JSON", "{ nope"],
  ["empty", ""],
  ["null", "null"],
  ["a string", '"x"'],
  ["an array", "[1]"],
  ["functions that is an array", '{"contextReuse":"none","functions":[]}'],
  ["functions that is a string", '{"contextReuse":"none","functions":"x"}'],
]) {
  test(`does not touch a kibo.json that is ${name}, and says so`, async () => {
    const root = tmpApp([SF], { "kibo.json": raw });
    const { raw: after, fake } = await ensureKiboJson(root, [SF]);
    assert.equal(after, raw);
    assert.equal(fake.writes.length, 0);
    assert.match(fake.logs.join("\n"), /fix it by hand/);
  });
}

test("invalid existing values are left alone and reported, while missing entries are still added", async () => {
  const root = tmpApp([SF, "assets/src/b.manifest.js"], {
    "kibo.json": JSON.stringify({ contextReuse: "WARMER", functions: { [SF]: "warm" } }),
  });
  const { config, fake } = await ensureKiboJson(root, []);
  assert.equal(config.contextReuse, "WARMER");
  assert.equal(config.functions[SF], "warm");
  assert.deepEqual(config.functions["assets/src/b.manifest.js"], { contextReuse: "none" });
  const out = fake.logs.join("\n");
  assert.match(out, /values the build rejects/);
  assert.match(out, /top-level "contextReuse" "WARMER"/);
  assert.match(out, /storefront\.manifest\.js" "warm"/);
});

test("a null entry is reported, not a crash", async () => {
  const root = tmpApp([SF], { "kibo.json": JSON.stringify({ contextReuse: "none", functions: { [SF]: null } }) });
  const { fake } = await ensureKiboJson(root, []);
  assert.match(fake.logs.join("\n"), /values the build rejects/);
});

test("accepts a differently cased but valid value without complaint", async () => {
  const root = tmpApp([SF], { "kibo.json": JSON.stringify({ contextReuse: " NONE ", functions: { [SF]: { contextReuse: "Warm" } } }) });
  const { fake } = await ensureKiboJson(root, []);
  assert.equal(fake.logs.length, 0);
});

async function warnLocalManifestTask(root) {
  const ActionGenerator = (await import("../generators/action/index.js")).default;
  const fake = await fakeThis(root);
  ActionGenerator.prototype._warnLocalManifestTask.call(fake);
  return fake.logs.join("\n");
}

test("warns when the app registers its own manifest task (tasks/manifest.js, any tasks/*.js, or the Gruntfile)", async () => {
  const legacy = "module.exports = function (grunt) { grunt.registerMultiTask('manifest', 'x', function () {}); };";
  assert.match(await warnLocalManifestTask(tmpApp([], { "tasks/manifest.js": legacy })), /tasks\/manifest\.js registers its own "manifest" task.*IGNORED/s);
  assert.match(await warnLocalManifestTask(tmpApp([], { "tasks/other.js": legacy })), /tasks\/other\.js/);
  assert.match(await warnLocalManifestTask(tmpApp([], { "Gruntfile.js": "grunt.registerTask('manifest', []);" })), /Gruntfile\.js/);
});

const LEGACY = "grunt.registerMultiTask('manifest', 'x', function () {});";
for (const [name, files, expectIn] of [
  ["double quotes and spaces in the call", { "tasks/m.js": 'grunt.registerMultiTask( "manifest" , "x", f);' }, "tasks/m.js"],
  ["a backtick name", { "tasks/m.js": "grunt.registerTask(`manifest`, f);" }, "tasks/m.js"],
  ["a .cjs task file", { "tasks/m.cjs": LEGACY }, "tasks/m.cjs"],
  ["a folder the Gruntfile loads with loadTasks", { "build/m.js": LEGACY, "Gruntfile.js": "grunt.loadTasks('./build');" }, "build/m.js"],
  ["a nested folder loaded with loadTasks", { "tasks/sub/m.js": LEGACY, "Gruntfile.js": 'grunt.loadTasks("tasks/sub");' }, "tasks/sub/m.js"],
]) {
  test(`the warning also finds a manifest task in: ${name}`, async () => {
    assert.match(await warnLocalManifestTask(tmpApp([], files)), new RegExp(expectIn.replace(/[./]/g, "\\$&") + " registers"));
  });
}

test("a commented-out registration gives no warning; one after a // inside a string, or a /* inside a glob, still does", async () => {
  assert.equal(await warnLocalManifestTask(tmpApp([], { "tasks/m.js": "// grunt.registerTask('manifest', f);\n  /* grunt.registerMultiTask('manifest') */\n * grunt.registerTask('manifest')" })), "");
  assert.match(await warnLocalManifestTask(tmpApp([], { "tasks/m.js": "var u = 'http://x'; grunt.registerTask('manifest', f);" })), /tasks\/m\.js/);
  assert.match(await warnLocalManifestTask(tmpApp([], { "tasks/m.js": "var g = 'dist/*.js'; grunt.registerTask('manifest', f); /* c */" })), /tasks\/m\.js/);
});

test("folders the Gruntfile loads are scanned wherever they are in the app, and a file is named once", async () => {
  assert.match(await warnLocalManifestTask(tmpApp([], { "shared/m.js": LEGACY, "Gruntfile.js": "grunt.loadTasks('./shared');" })), /shared\/m\.js/);
  assert.match(await warnLocalManifestTask(tmpApp([], { "m.js": LEGACY, "Gruntfile.js": "grunt.loadTasks('.');" })), /^.*m\.js registers/s);
  const out = await warnLocalManifestTask(tmpApp([], { "tasks/m.js": LEGACY, "Gruntfile.js": "grunt.loadTasks('./tasks');" }));
  assert.equal((out.match(/tasks\/m\.js/g) || []).length, 1);
  assert.match(await warnLocalManifestTask(tmpApp([], { "Gruntfile.cjs": "grunt.registerTask('manifest', f);" })), /Gruntfile\.cjs/);
});

test("no warning for a clean app, or for tasks that only mention manifest", async () => {
  assert.equal(await warnLocalManifestTask(tmpApp([])), "");
  const other = "grunt.registerTask('build', ['manifest']);";
  assert.equal(await warnLocalManifestTask(tmpApp([], { "Gruntfile.js": other, "tasks/x.js": "// manifest" })), "");
});

test("the generated Gruntfile config builds with the plugin's manifest task, and no template copies a task into apps", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, "generators/app/templates/gruntfile-config.json"), "utf8"));
  assert.equal(cfg.configs.manifest.all.files, "<%= browserify.all.files %>");
  assert.deepEqual(cfg.configs.browserify.all.files[0].src, ["**/*.manifest.js"]);
  assert.equal(cfg.configs.browserify.all.files[0].cwd, "assets/src/");
  assert.deepEqual(cfg.tasks.build.slice(-1), ["manifest"]);
  assert.ok(cfg.tasks.default.includes("build") || cfg.tasks.default[0] === "build");
  assert.ok(!fs.existsSync(path.join(repo, "generators/app/templates/manifest.js")));
});

// --- linting: ESLint for new apps, jshint kept for apps that already use it ---

async function appFake(root, extra = {}) {
  const fake = await fakeThis(root);
  const recorded = { config: {}, tasks: {}, prepended: [], copies: [], copySources: {} };
  return Object.assign(fake, {
    recorded,
    options: {},
    templatePath: (p) => path.join(repo, "generators/app/templates", p),
    fs: {
      ...fake.fs,
      copy: (from, to) => { recorded.copies.push(path.relative(root, to)); recorded.copySources[path.relative(root, to)] = from; },
    },
    gruntfile: {
      prependJavaScript: (l) => recorded.prepended.push(l),
      insertConfig: (n, c) => { recorded.config[n] = c; },
      registerTask: (n, t) => { recorded.tasks[n] = t; },
    },
  }, extra);
}

async function AppGen() {
  return (await import("../generators/app/index.js")).default;
}

const LINT = { eslint: "eslint", kept: "kept", jshint: "jshint", none: "none" };

test("lint tool: decided by what the Gruntfile configures, not by dependencies or mentions", async () => {
  const A = await AppGen();
  const detect = async (files) => A.prototype._detectLintTool.call(await appFake(tmpApp([], files)));
  assert.equal(await detect({}), LINT.eslint);                                                   // new app
  assert.equal(await detect({ "Gruntfile.js": "  \n" }), LINT.eslint);                          // empty Gruntfile
  assert.equal(await detect({ "Gruntfile.js": "grunt.initConfig({ jshint: { normal: [], continuous: {} } });" }), LINT.jshint);
  // jshint tasks used but no jshint config in this Gruntfile (it lives elsewhere): we cannot wire targets we cannot see
  assert.equal(await detect({ "Gruntfile.js": "grunt.registerTask('build', ['jshint:normal']);\ngrunt.registerTask('w', ['jshint:continuous']);" }), LINT.kept);
  // jshint with the author's own targets: kept as is, no lint steps written
  assert.equal(await detect({ "Gruntfile.js": "grunt.initConfig({ jshint: { all: ['x.js'] } });\ngrunt.registerTask('build', ['jshint:all']);" }), LINT.kept);
  // a Gruntfile we cannot read: nothing is wired
  assert.equal(await detect({ "Gruntfile.cjs": "module.exports = function (grunt) { grunt.initConfig({ jshint: {} }); };" }), LINT.kept);
  assert.equal(await detect({ "Gruntfile.js": "// a comment\ngrunt.initConfig({ jshint: { normal: [], continuous: {} } });" }), LINT.jshint); // key after a comment line
  assert.equal(await detect({ "Gruntfile.js": "grunt.initConfig({ 'eslint': {} });" }), LINT.kept);
  assert.equal(await detect({ "Gruntfile.js": "grunt.registerTask('build', ['eslint:normal']);" }), LINT.kept);
  assert.equal(await detect({ "Gruntfile.js": "grunt.initConfig({ jshint: {}, eslint: {} });" }), LINT.kept); // already moved: leave it
  // not enough to count as configured:
  assert.equal(await detect({ "Gruntfile.js": "// migrated away from jshint\ngrunt.initConfig({ eslint: {} });" }), LINT.kept);
  assert.equal(await detect({ "Gruntfile.js": "// we dropped jshint\ngrunt.initConfig({});", "package.json": '{"devDependencies":{"grunt-contrib-jshint":"3"}}' }), LINT.none);
  assert.equal(await detect({ "Gruntfile.js": "grunt.initConfig({});" }), LINT.none);
  assert.equal(await detect({ "Gruntfile.js": "// jshint: removed\ngrunt.initConfig({});" }), LINT.none);
});

test("dotfiles: eslint.config.js only for a new app (and only if the app has none); .jshintrc only for jshint apps", async () => {
  const A = await AppGen();
  const copies = async (tool, files = {}) => {
    const f = await appFake(tmpApp([], files), { _lintTool: tool });
    f.fs.exists = (p) => fs.existsSync(p);
    A.prototype._dotfiles.call(f);
    return f.recorded.copies.sort();
  };
  assert.deepEqual(await copies("eslint"), [".editorconfig", ".gitignore", "eslint.config.js"]);
  const f = await appFake(tmpApp([]), { _lintTool: "eslint" });
  f.fs.exists = (p) => fs.existsSync(p);
  A.prototype._dotfiles.call(f);
  assert.equal(f.recorded.copySources["eslint.config.js"], path.join(repo, "generators/app/templates/eslint.config.js"));
  assert.equal(f.recorded.copySources[".editorconfig"], path.join(repo, "generators/app/templates/editorconfig"));
  assert.deepEqual(await copies("eslint", { "eslint.config.mjs": "export default [];" }), [".editorconfig", ".gitignore"]);
  assert.deepEqual(await copies("kept"), [".editorconfig", ".gitignore"]);
  assert.deepEqual(await copies("jshint"), [".editorconfig", ".gitignore", ".jshintrc"]);
  assert.deepEqual(await copies("jshint", { ".jshintrc": '{ "custom": true }' }), [".editorconfig", ".gitignore"]); // the author's own file stays
  assert.deepEqual(await copies("none"), [".editorconfig", ".gitignore"]);
});

test("dependencies: only the wired-up linter's packages are added, and nothing for an app that keeps its own", async () => {
  const A = await AppGen();
  const depsFor = async (tool) => {
    let got;
    await A.prototype._deps.call({ options: {}, _lintTool: tool, _devDependencies: A.prototype._devDependencies, addDevDependencies: async (d) => { got = d; }, log: () => {} });
    return got;
  };
  const lintPkgs = (d) => d.filter((x) => /eslint|jshint/.test(x));
  assert.deepEqual(lintPkgs(await depsFor("eslint")), ["eslint@^9", "grunt-eslint@^25"]);
  assert.deepEqual(lintPkgs(await depsFor("jshint")), ["grunt-contrib-jshint"]);
  assert.deepEqual(lintPkgs(await depsFor("kept")), []);
  assert.deepEqual(lintPkgs(await depsFor("none")), []);
});

test("app generator adds grunt-mozu-appdev-sync ^2.5.0 (the manifest task); with --skip-install it says everything that was not added", async () => {
  const A = await AppGen();
  let got;
  const logs = [];
  const fake = { options: {}, _lintTool: "eslint", _devDependencies: A.prototype._devDependencies, addDevDependencies: async (d) => { got = d; }, log: (s) => logs.push(s) };
  await A.prototype._deps.call(fake);
  assert.ok(got.includes("grunt-mozu-appdev-sync@^2.5.0"));
  assert.ok(!got.includes("grunt-mozu-appdev-sync"));
  got = undefined;
  await A.prototype._deps.call({ ...fake, options: { "skip-install": true } });
  assert.equal(got, undefined);
  const out = logs.join("\n");
  assert.match(out, /skip-install: not added: .*grunt-mozu-appdev-sync@\^2\.5\.0/);
  assert.match(out, /eslint@\^9, grunt-eslint@\^25/);
});

test("Gruntfile: each linter mode registers a consistent config and tasks", async () => {
  const A = await AppGen();
  const run = async (tool) => {
    const f = await appFake(tmpApp([]), { _lintTool: tool });
    A.prototype._gruntfile.call(f);
    return f;
  };
  const fresh = await run("eslint");
  assert.ok(fresh.recorded.config.eslint);
  assert.deepEqual(fresh.recorded.tasks.build, ["eslint:normal", "browserify:all", "manifest"]);
  assert.match(fresh.recorded.config.watch, /eslint:continuous/);

  const keptNoWatch = await run("kept"); // no existing Gruntfile text: nothing configured, so we still add a working watch
  assert.ok(!keptNoWatch.recorded.config.eslint);
  assert.match(keptNoWatch.recorded.config.watch, /assets\/src\/\*\*\/\*\.js/);
  assert.doesNotMatch(keptNoWatch.recorded.config.watch, /eslint|jshint/);
  const keptFake = await appFake(tmpApp([], { "Gruntfile.js": "grunt.initConfig({ eslint: {}, watch: { src: { files: [], tasks: ['eslint:x'] } } });" }), { _lintTool: "kept" });
  A.prototype._gruntfile.call(keptFake);
  const kept = keptFake;
  assert.ok(!kept.recorded.config.eslint, "the author's eslint block is not overwritten");
  assert.ok(!kept.recorded.config.watch, "the author's watch config is not replaced");
  assert.deepEqual(kept.recorded.tasks.build, ["browserify:all", "manifest"]); // merged into their own list: no lint target we cannot know

  const old = await run("jshint");
  assert.ok(!old.recorded.config.eslint);
  assert.deepEqual(old.recorded.tasks.build, ["jshint:normal", "browserify:all", "manifest"]);
  assert.match(old.recorded.config.watch, /"files":\s*"<%= jshint\.normal %>"/);
  assert.doesNotMatch(old.recorded.config.watch, /jshint\.normal\.src/);
  assert.ok(old.recorded.config.watch.indexOf("jshint:continuous") < old.recorded.config.watch.indexOf("browserify:all"));
  assert.doesNotMatch(old.recorded.config.watch, /eslint/);
  assert.match(old.logs.join("\n"), /lints with jshint/);

  const none = await run("none");
  assert.ok(!none.recorded.config.eslint);
  assert.deepEqual(none.recorded.tasks.build, ["browserify:all", "manifest"]);
  assert.doesNotMatch(none.recorded.config.watch, /eslint|jshint/);
  assert.match(none.recorded.config.watch, /assets\/src\/\*\*\/\*\.js/);
  assert.match(none.logs.join("\n"), /no linter/);
});

test("writing() decides the linter before any file is written", async () => {
  const A = await AppGen();
  for (const [files, want] of [[{}, "eslint"], [{ "Gruntfile.js": "grunt.initConfig({ jshint: { normal: [], continuous: {} } });" }, "jshint"]]) {
    const seen = [];
    const f = await appFake(tmpApp([], files), {
      _detectLintTool: A.prototype._detectLintTool,
      _dotfiles() { seen.push(this._lintTool); },
      _gruntfile() { seen.push(this._lintTool); },
      _packagejson() {}, _readme() {}, _enableOnInstallFn() {}, _tests() {},
    });
    A.prototype.writing.call(f);
    assert.deepEqual(seen, [want, want]);
  }
});

// The Gruntfile as the REAL gruntfile-editor writes it, evaluated with the real grunt config engine.
const requireHere = createRequire(import.meta.url);
const OLD_GRUNTFILE = `module.exports = function (grunt) {
    'use strict';
    grunt.loadTasks('./tasks');
    require('time-grunt')(grunt);
    require('load-grunt-tasks')(grunt);
    grunt.initConfig({
        mozuconfig: grunt.file.readJSON('./mozu.config.json'),
        jshint: { 'normal': ['./assets/src/**/*.js'], 'continuous': { 'options': { 'force': true }, 'src': '<%= jshint.normal %>' } },
        watch: { 'options': { 'spawn': false }, 'src': { 'files': '<%= jshint.normal %>', 'tasks': ['jshint:continuous', 'browserify:all', 'manifest'] } }
    });
    grunt.registerTask('build', ['jshint:normal', 'browserify:all', 'manifest']);
};
`;

async function realGruntfile(tool, seed) {
  const A = await AppGen();
  const GruntfileEditor = requireHere("gruntfile-editor");
  const editor = new GruntfileEditor(seed || "");
  const fake = await appFake(tmpApp([], seed ? { "Gruntfile.js": seed } : {}), { _lintTool: tool, gruntfile: editor });
  A.prototype._gruntfile.call(fake);
  const text = editor.toString();
  const rec = { cfg: null, tasks: {} };
  const grunt = { loadTasks() {}, loadNpmTasks() {}, initConfig: (c) => { rec.cfg = c; }, registerTask: (n, t) => { rec.tasks[n] = t; }, file: { readJSON: () => ({}) } };
  const stub = () => () => {};
  const mod = { exports: {} };
  new Function("module", "exports", "require", text)(mod, mod.exports, (n) => (n === "time-grunt" || n === "load-grunt-tasks" ? stub() : requireHere(n)));
  mod.exports(grunt);
  const real = requireHere("grunt"); // resolves the "<%= %>" references the way grunt does
  real.config.init(JSON.parse(JSON.stringify(rec.cfg)));
  return { ...rec, get: (k) => real.config.get(k), text };
}

test("real Gruntfile for a new app: ESLint, with working target and watch references", async () => {
  const g = await realGruntfile("eslint");
  assert.deepEqual(g.tasks.build, ["eslint:normal", "browserify:all", "manifest"]);
  assert.deepEqual(g.tasks.default, ["build", "mozusync:upload"]);
  assert.deepEqual(g.get("eslint.normal.src"), ["./assets/src/**/*.js"]);
  assert.deepEqual(g.get("eslint.continuous.src"), ["./assets/src/**/*.js"]);
  assert.equal(g.get("eslint.continuous.options.failOnError"), false);
  assert.deepEqual(g.get("watch.src.files"), ["./assets/src/**/*.js"]);
  assert.deepEqual(g.get("watch.src.tasks"), ["eslint:continuous", "browserify:all", "manifest"]);
  assert.equal(g.get("jshint"), undefined);
});

test("real Gruntfile for an app that already lints with jshint: still jshint, references still resolve", async () => {
  const g = await realGruntfile("jshint", OLD_GRUNTFILE);
  assert.deepEqual(g.tasks.build, ["jshint:normal", "browserify:all", "manifest"]);
  assert.deepEqual(g.get("jshint.normal"), ["./assets/src/**/*.js"]);
  assert.deepEqual(g.get("watch.src.files"), ["./assets/src/**/*.js"]); // a real array: not an undefined jshint.normal.src
  assert.deepEqual(g.get("watch.src.tasks"), ["jshint:continuous", "browserify:all", "manifest"]);
  assert.equal(g.get("eslint"), undefined);
});

test("real Gruntfile for an app that already has its own ESLint config: its eslint and watch settings are untouched", async () => {
  const own = OLD_GRUNTFILE.replace(/jshint/g, "eslint").replace("'normal': ['./assets/src/**/*.js']", "'normal': { 'src': ['./custom/**/*.js'] }").replace(/<%= eslint\.normal %>/g, "<%= eslint.normal.src %>");
  const g = await realGruntfile("kept", own);
  assert.deepEqual(g.get("eslint.normal.src"), ["./custom/**/*.js"]);
  assert.deepEqual(g.get("watch.src.tasks"), ["eslint:continuous", "browserify:all", "manifest"]);
  assert.deepEqual(g.tasks.build, ["eslint:normal", "browserify:all", "manifest"]); // their own list, nothing added twice
});

test("real Gruntfile for an app with jshint under its own target names: nothing referencing normal/continuous is written", async () => {
  const custom = `module.exports = function (grunt) { grunt.initConfig({ jshint: { all: ['./src/**/*.js'] } }); grunt.registerTask('build', ['jshint:all', 'browserify:all']); };\n`;
  const g = await realGruntfile("kept", custom);
  assert.deepEqual(g.tasks.build, ["jshint:all", "browserify:all", "manifest"]); // theirs, plus manifest
  assert.deepEqual(g.get("jshint.all"), ["./src/**/*.js"]);
  assert.equal(g.get("jshint.normal"), undefined);
  assert.equal(g.get("eslint"), undefined);
  assert.deepEqual(g.get("watch.src.tasks"), ["browserify:all", "manifest"]);
  assert.deepEqual(g.get("watch.src.files"), ["./assets/src/**/*.js"]);
});

test("real Gruntfile for an app with no linter: none added, watch watches the sources", async () => {
  const noLint = `module.exports = function (grunt) { grunt.initConfig({}); grunt.registerTask('build', ['browserify:all']); };\n`;
  const g = await realGruntfile("none", noLint);
  assert.deepEqual(g.tasks.build, ["browserify:all", "manifest"]);
  assert.equal(g.get("eslint"), undefined);
  assert.equal(g.get("jshint"), undefined);
  assert.deepEqual(g.get("watch.src.files"), ["./assets/src/**/*.js"]);
  assert.deepEqual(g.get("watch.src.tasks"), ["browserify:all", "manifest"]);
});

test("the ESLint config template accepts modern syntax and every global it declares, and flags each bug rule", async () => {
  const { ESLint } = await import("eslint");
  const app = tmpApp([], {
    "assets/src/ok.js": [
      "module.exports = (ctx, cb) => {",
      "  const n = ctx.request?.name ?? 'x'; class A { #p = 1; get p() { return this.#p; } }",
      "  console.log(process.env, Buffer.from('x'), setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate);",
      "  cb(null, { n, big: 10n, p: new A().p, u: new URL('http://x'), s: new URLSearchParams(), e: new TextEncoder(), d: new TextDecoder(),",
      "    a: atob, b: btoa('x'), now: performance.now(), q: queueMicrotask, l: _.noop, dir: __dirname, file: __filename, r: require, m: module, x: exports });",
      "};",
    ].join("\n"),
    "assets/src/bad.js": [
      "var o = { a: 1, a: 2 };",                          // no-dupe-keys
      "function f(a, a) { return a; }",                  // no-dupe-args
      "var r; var r;",                                    // no-redeclare
      "const c = 1; c = 2;",                              // no-const-assign
      "function g() {} g = 1;",                           // no-func-assign
      "var s = 1; s = s;",                                // no-self-assign
      "if (!o in c) { }",                                 // no-unsafe-negation
      "var sp = [1, , 2];",                               // no-sparse-arrays
      "if (c === NaN) { }",                               // use-isnan
      "if (typeof c === 'strng') { }",                    // valid-typeof
      "var undefined = 1;",                               // no-shadow-restricted-names
      "function h() { return 1; var dead = 2; }",         // no-unreachable (+ unused)
      "missing();",                                       // no-undef
    ].join("\n"),
  });
  // As the generator places it: in the app root, where there is no "type": "module" (this repo's package.json has one).
  fs.copyFileSync(path.join(repo, "generators/app/templates/eslint.config.js"), path.join(app, "eslint.config.js"));
  const eslint = new ESLint({ cwd: app });
  const results = await eslint.lintFiles(["assets/src/**/*.js"]);
  const by = (name) => results.find((r) => r.filePath.endsWith(name));
  assert.equal(by("ok.js").messages.length, 0, JSON.stringify(by("ok.js").messages));
  const msgs = by("bad.js").messages;
  const rules = new Set(msgs.map((m) => m.ruleId));
  for (const r of ["no-dupe-keys", "no-dupe-args", "no-redeclare", "no-const-assign", "no-func-assign", "no-self-assign", "no-unsafe-negation",
    "no-sparse-arrays", "use-isnan", "valid-typeof", "no-shadow-restricted-names", "no-unreachable", "no-undef", "no-unused-vars"]) {
    assert.ok(rules.has(r), r + " should be reported; got " + [...rules].join());
  }
  assert.equal(msgs.find((m) => m.ruleId === "no-unused-vars").severity, 1); // unused variables warn, they do not stop the build
  assert.equal(msgs.find((m) => m.ruleId === "no-undef").severity, 2);
});
