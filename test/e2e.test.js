// End-to-end: run the real action sub-generator (yeoman-test, prompts answered), then run the real
// grunt-mozu-appdev-sync `manifest` task on its output. Offline; no npm install in the app.
// The task's own failure and --kibo-init cases are tested in that plugin's repo.
// Run: node --test test/e2e.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import helpers from "yeoman-test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actionGen = path.join(repo, "generators/action/index.js");
const gruntBin = path.join(repo, "node_modules/grunt/bin/grunt");

const GLOBAL_AFTER = "http*storefront*pages*global*request*after";
const SEARCH_AFTER = "http*storefront*pages*search*request*after";
const CART_GET_AFTER = "embedded*commerce*carts*get*after";

const created = [];
// process 'exit', not node:test after(): Node 16's runner never calls a top-level after hook.
process.on("exit", () => created.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// Answers are keyed by domain (asterisk form); createMultiple false = one custom function per action.
async function generate(answers, seed, logs) {
  const home = process.cwd();
  try {
    const run = helpers.run(actionGen).withOptions({ testFramework: "manual", "skip-install": true });
    if (seed) { run.inTmpDir(seed); }
    if (logs) { run.onGenerator((gen) => { gen.log = (s) => logs.push(String(s)); }); }
    const result = await run.withAnswers({ createMultiple: false, ...answers });
    // yeoman-test deletes its temp dir on the next run; keep our own copy.
    const app = fs.mkdtempSync(path.join(os.tmpdir(), "mozu-actions-e2e-"));
    fs.cpSync(result.cwd, app, { recursive: true });
    created.push(app);
    return app;
  } finally {
    process.chdir(home); // yeoman-test chdirs into the temp app
  }
}

const readJson = (app, f) => JSON.parse(fs.readFileSync(path.join(app, f), "utf8"));
const writeJson = (app, f, v) => fs.writeFileSync(path.join(app, f), JSON.stringify(v, null, 2));

// The generated app builds with grunt-mozu-appdev-sync's `manifest` task, same file mapping as the generated Gruntfile
// (browserify is not needed by that task). The installed plugin is linked in; grunt-cli only runs a local grunt.
function addGrunt(app) {
  fs.mkdirSync(path.join(app, "node_modules"), { recursive: true });
  ["grunt", "grunt-mozu-appdev-sync"].forEach((m) =>
    fs.symlinkSync(path.join(repo, "node_modules", m), path.join(app, "node_modules", m), "junction"));
  fs.writeFileSync(path.join(app, "Gruntfile.js"), `module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-mozu-appdev-sync');
  grunt.initConfig({ manifest: { all: { files: [{ expand: true, cwd: 'assets/src/', src: ['**/*.manifest.js'],
    dest: 'assets/dist/', ext: '.all.js', extDot: 'last' }] } } });
};
`);
}

function grunt(app, args = [], input = "") {
  const r = spawnSync(process.execPath, [gruntBin, "manifest", "--no-color", "--gruntfile", path.join(app, "Gruntfile.js"), "--base", app, ...args], { input, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

test("generator creates kibo.json with a none entry for the new bundle", async () => {
  const app = await generate({ domains: ["storefront"], storefront: [GLOBAL_AFTER] });
  assert.deepEqual(readJson(app, "kibo.json"), {
    contextReuse: "none",
    functions: { "assets/src/storefront.manifest.js": { contextReuse: "none" } },
  });
});

test("generator keeps an existing warm entry and adds only the new domain's bundle", async () => {
  const first = await generate({ domains: ["storefront"], storefront: [GLOBAL_AFTER] });
  writeJson(first, "kibo.json", { contextReuse: "none", functions: { "assets/src/storefront.manifest.js": { contextReuse: "warm" } } });
  const app = await generate(
    { domains: ["storefront", "commerce*carts"], storefront: [GLOBAL_AFTER, SEARCH_AFTER], "commerce*carts": [CART_GET_AFTER] },
    (dir) => fs.cpSync(first, dir, { recursive: true })
  );
  assert.deepEqual(readJson(app, "kibo.json"), {
    contextReuse: "none",
    functions: {
      "assets/src/storefront.manifest.js": { contextReuse: "warm" },
      "assets/src/commerce.carts.manifest.js": { contextReuse: "none" },
    },
  });
});

test("the plugin's manifest task builds the generated app: complete kibo.json gives the arcjs block", async () => {
  const app = await generate({ domains: ["storefront"], storefront: [GLOBAL_AFTER] });
  addGrunt(app);
  const r = grunt(app);
  assert.equal(r.code, 0, r.out);
  const fj = readJson(app, "assets/functions.json");
  assert.deepEqual(fj.exports.map((e) => e.id), ["http.storefront.pages.global.request.after"]);
  assert.deepEqual(fj.arcjs, { contextReuse: "none", files: { "./dist/storefront.manifest.all.js": { contextReuse: "none" } } });
  assert.ok(!JSON.stringify(fj).includes("attestation"));
});

test("regenerating an app that has its own manifest task warns that kibo.json is ignored, and leaves that task alone", async () => {
  const legacy = "module.exports = function (grunt) { grunt.registerMultiTask('manifest', 'old', function () {}); };\n";
  const logs = [];
  const app = await generate(
    { domains: ["storefront"], storefront: [GLOBAL_AFTER] },
    (dir) => { fs.mkdirSync(path.join(dir, "tasks")); fs.writeFileSync(path.join(dir, "tasks/manifest.js"), legacy); },
    logs
  );
  assert.match(logs.join("\n"), /tasks\/manifest\.js registers its own "manifest" task.*kibo\.json is IGNORED/s);
  assert.equal(fs.readFileSync(path.join(app, "tasks/manifest.js"), "utf8"), legacy);
  assert.ok(fs.existsSync(path.join(app, "kibo.json")));
});

test("the generated Gruntfile's eslint task passes on generated code and fails on an undefined variable", async () => {
  const app = await generate({ domains: ["storefront"], storefront: [GLOBAL_AFTER] });
  fs.mkdirSync(path.join(app, "node_modules"), { recursive: true });
  ["grunt", "grunt-eslint", "eslint"].forEach((m) =>
    fs.symlinkSync(path.join(repo, "node_modules", m), path.join(app, "node_modules", m), "junction"));
  fs.copyFileSync(path.join(repo, "generators/app/templates/eslint.config.js"), path.join(app, "eslint.config.js"));
  // The eslint block of the generated Gruntfile, exactly as the generator writes it (its "<%= %>" refs resolve in grunt).
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, "generators/app/templates/gruntfile-config.json"), "utf8")).configs.eslint;
  fs.writeFileSync(path.join(app, "Gruntfile.js"), `module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-eslint');
  grunt.initConfig({ eslint: ${JSON.stringify(cfg)} });
};
`);
  const run = (target) => spawnSync(process.execPath, [gruntBin, target, "--no-color", "--gruntfile", path.join(app, "Gruntfile.js"), "--base", app], { encoding: "utf8" });

  let r = run("eslint:normal");
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const file = path.join(app, "assets/src/domains/storefront/http.storefront.pages.global.request.after.js");
  fs.appendFileSync(file, "\nmissingVariable.run();\n");
  r = run("eslint:normal");
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /'missingVariable' is not defined/);
  assert.equal(run("eslint:continuous").status, 0); // watch mode reports but does not stop
});
