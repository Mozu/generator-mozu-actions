// Run: node --test test/generators.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

test("app generator adds grunt-mozu-appdev-sync ^2.5.0 (the manifest task), unless install is skipped", async () => {
  const AppGenerator = (await import("../generators/app/index.js")).default;
  let got;
  const logs = [];
  const fake = { options: {}, addDevDependencies: async (d) => { got = d; }, log: (s) => logs.push(s) };
  await AppGenerator.prototype._deps.call(fake);
  assert.ok(got.includes("grunt-mozu-appdev-sync@^2.5.0"));
  assert.ok(!got.includes("grunt-mozu-appdev-sync"));
  got = undefined;
  await AppGenerator.prototype._deps.call({ ...fake, options: { "skip-install": true } });
  assert.equal(got, undefined);
  assert.match(logs.join("\n"), /skip-install: grunt-mozu-appdev-sync@\^2\.5\.0/);
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
