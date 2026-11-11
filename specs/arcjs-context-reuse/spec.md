# Spec: required `kibo.json` drives the `arcjs` block in `functions.json`

**Status:** Implemented (v4). The build task now lives in `grunt-mozu-appdev-sync` 2.5.0 (this repo creates and maintains `kibo.json`). Supersedes the drafts that kept the setting in the manifest files and the v3 design that copied the task into each app.
**Repo:** `generator-mozu-actions`
**Date:** 2026-11-11

## 1. Problem

The Kibo ArcJs engine can reuse a loaded ("warm") context across requests for compiled bundles that the app declares safe. The declaration lives in the app's `assets/functions.json`, next to `exports`:

```json
{
  "exports": [ … ],
  "arcjs": {
    "contextReuse": "none",
    "files": {
      "./dist/storefront.manifest.all.js": { "contextReuse": "warm" },
      "./dist/platform.applications.manifest.all.js": { "contextReuse": "none" }
    }
  }
}
```

**Why authors can't edit it today.** The `manifest` grunt task rewrites `functions.json` from scratch on every build, and `mozusync` uploads the result. A hand-added block is lost.

**Fix.** Authors declare reuse in a committed `kibo.json` at the project root. The task validates it on every build and emits the block from it. The setting is a deliberate decision: every bundle must have an explicit answer, or the build fails.

## 2. Design

### 2.1 Choosing `kibo.json`

`kibo.json` follows the serverless convention of one committed, platform-named root config, keyed by source path with an options object per function (as in `vercel.json` `functions`, `netlify.toml`, `serverless.yml` and `host.json`). The alternatives were rejected:

- **`mozu.config.json`:** gitignored and per developer, so CI may not have it.
- **`package.json`:** less discoverable.
- **Gruntfile options:** overwritten when the generator reruns.
- **The manifest files:** dropped. That route needed parser, template and export-skipping changes for a second source of truth.

### 2.2 Schema

```json
{
  "contextReuse": "none",
  "functions": {
    "assets/src/storefront.manifest.js":            { "contextReuse": "warm" },
    "assets/src/platform.applications.manifest.js": { "contextReuse": "none" }
  }
}
```

- **Top-level `contextReuse` (required).** It is emitted as `arcjs.contextReuse`, which is the engine's default for files not listed.
- **`functions` keys.** Each key is a manifest's **source path relative to the project root**, with `/` separators.
- **`functions` values.** Each value is an options object. Only `contextReuse` is defined; any other option name fails the build.
- **Every bundle is required.** Each `assets/src/**/*.manifest.js` in the build must have an entry.
- **Values.** `"warm"` or `"none"`, trimmed and case-insensitive, and emitted in lowercase.
- **Location.** The project root, never under `assets/`, so `mozusync` does not upload it.

### 2.3 Build behavior (the `manifest` task, in `grunt-mozu-appdev-sync` `tasks/manifest.js`)

This section describes the plugin's behavior; the plugin's README and tests are authoritative. Earlier versions copied the task into each app from this repo (`generators/app/templates/manifest.js`, now removed): apps get fixes by bumping the plugin instead.

The build **fails with `grunt.fail.fatal`** (exit 1, not bypassable with `--force`) and leaves `functions.json` untouched when:
- `kibo.json` is missing, isn't valid JSON, or isn't an object;
- the top-level `contextReuse` is missing or invalid;
- any bundle in the build has no entry, or an entry that isn't an object or has an invalid value;
- an entry has an unknown option;
- a `functions` key matches no manifest in the build. Typos and renamed or removed manifests are caught here. The message lists the valid keys, and suggests the source path when the key looks like a `./dist/…` path.

Each problem is logged on its own line (`kibo.json: …`), followed by one fatal message that points to `--kibo-init`.

On success the task:
- writes `{ exports, arcjs }`. `exports` is unchanged. `arcjs = { contextReuse, files }`, where `files` is keyed by the **same string** as each `exports[].virtualPath`. Path separators are not normalized; the engine compares the two after removing every non-alphanumeric character;
- logs one line per bundle (`arcjs: assets/src/x.manifest.js -> warm`).

It never writes `attestation` or `nodeVersion`.

### 2.4 `--kibo-init` (interactive fill-in)

`grunt build --kibo-init` (or `grunt manifest --kibo-init`):
- creates `kibo.json` if it is absent;
- asks only for values that are missing or invalid: first the top-level default, then each bundle;
- explains that `warm` is only for bundles that passed the ArcJs shared-context audit;
- re-asks on invalid input. An empty answer means `none`;
- writes `kibo.json` (2-space JSON) and continues the build;
- keeps existing valid entries and other keys. Unknown keys still fail, because it never deletes author content;
- fails cleanly if input ends before every question is answered, for example in CI with no stdin.

### 2.5 Generator behavior (`generators/action/index.js`, `_ensureKiboJson`)

The app generator composes the action sub-generator, which writes every domain manifest. At the end of its `writing()` the sub-generator:
- creates `kibo.json` if it is absent, with `"contextReuse": "none"`;
- adds a `{ "contextReuse": "none" }` entry for every manifest on disk (`assets/src/**/*.manifest.js`) and every manifest written in this run that lacks one;
- never changes existing entries;
- prints a remark listing what it added, and that `warm` is the author's call after an audit.

Other cases:
- **Unreadable or unusable file.** If `kibo.json` is not valid JSON, is not an object, or has a non-object `functions`, the generator leaves it untouched and prints a "fix it by hand" message.
- **Invalid values.** A top-level value or entry that is not `warm` / `none` is left as it is and reported. Missing entries are still added.
- **Nothing to add.** The file is not rewritten, so a hand-formatted file stays byte-identical.
- **A local `manifest` task.** The sub-generator also looks for a task named `manifest` in `tasks/*.{js,cjs}`, in every folder the Gruntfile loads with `grunt.loadTasks`, and in the Gruntfile. If it finds one it prints a red warning: that task overrides the plugin's, so `kibo.json` is ignored. It never changes that file. A task whose name is built at run time cannot be found this way; the plugin's own build-time warning is the backstop.

So a freshly generated app builds straight away with everything `none`. Adding actions with `yo mozu-actions:action` keeps `kibo.json` complete.

### 2.6 Documentation

- The generated app's README (`_README.md.tpt`) has a "Shared context (ArcJs): `kibo.json`" section.
- The repo README has the same section, including the migration notes.

## 3. Migration (existing apps)

- **Plugin version.** Set `grunt-mozu-appdev-sync` to `^2.5.0`. New apps get it from the generator (`_deps`).
- **A local `tasks/manifest.js` wins.** Grunt registers `./tasks` before the plugin and the plugin never replaces an existing `manifest` task, so upgrading the plugin alone changes nothing. The plugin warns when `kibo.json` exists but is ignored for this reason. Delete the file after carrying over local changes (for example arctest1's `nodeVersion` stamp, which the plugin task does not write).

- **The first build fails on purpose.** The first build with the new task fails until `kibo.json` exists. Run `grunt build --kibo-init`.
- **Existing `arcjs` blocks.** A block that already exists in a stored `functions.json`, for example one Kibo wrote, is replaced by the build output. Carry those values into `kibo.json` (D1).
- **Watch mode.** `grunt watch` (`spawn: false`) exits on the fatal error, the same as any other fatal build error.

## 4. Tests

The task's own unit and end-to-end tests (failure cases, `--kibo-init`, collisions, a project's own task winning) live in `grunt-mozu-appdev-sync` (`npm test`, 79 tests). This repo tests what it owns: `kibo.json` creation, and that its output builds with the real plugin.

`test/generators.test.js`:

| Case | Expect |
|---|---|
| Both generators load | They import on the running Node version. This guards against syntax only some Node versions accept |
| `_ensureKiboJson` on a fresh app | Creates `kibo.json` with a `none` default and one `none` entry per manifest, both on disk and written this run |
| `_ensureKiboJson` with a partial file | Keeps the existing values (including `warm`) and adds the missing nested manifest |
| `_ensureKiboJson` with nothing to add | File content unchanged, and no remark |

`test/e2e.test.js` runs end to end and offline. It runs the real action sub-generator through yeoman-test with its prompts answered, then runs the real `grunt manifest` from the `grunt-mozu-appdev-sync` dev dependency (with `grunt@1.6.3`, matching the sample app) on that output:

| Case | Expect |
|---|---|
| Generate a storefront action | `kibo.json` = `{ contextReuse: "none", functions: { storefront manifest: none } }` |
| Regenerate onto an app whose storefront entry is `warm`, adding a storefront action and a carts action | storefront stays `warm`, carts is added as `none` |
| `grunt manifest` on the generated app | Exit 0, `exports` holds the generated action, and `arcjs` is keyed by `./dist/storefront.manifest.all.js`, with no `attestation` |

The test copies each generated app into its own temp directory, because yeoman-test deletes its directory on the next run. It symlinks the repo's grunt and plugin into the app, because grunt-cli only runs a local grunt. It deletes everything on `process` exit, because Node 16's runner doesn't call a top-level `after`.

`npm test` (33 tests) passes on Node 18, 20, 22 and 24. `engines` is `^18.17.0 || >=20.5.0`, which is what the generator's own dependencies (`yeoman-generator` 7, `yeoman-environment` 4) require.

## 5. Decisions log

| # | Decision |
|---|---|
| D1 | The build output is authoritative. An `arcjs` block written outside the build is not preserved |
| D2 | Path separators are not normalized. `files` keys use the same string as `exports[].virtualPath` |
| D3 | `nodeVersion` is not exposed. The revert of `677afa6` was intentional |
| D4 | `attestation` is never emitted |
| D5 | The config lives in `kibo.json` only. The manifest-file option was dropped |
| D6 | Missing config is a **hard failure** (`grunt.fail.fatal`), not a warning: a missing file, a missing top-level value or a missing bundle entry |
| D7 | New bundles default to `"none"`, both from the generator and as the blank answer in `--kibo-init` |
| D8 | The task lives in `grunt-mozu-appdev-sync` (2.5.0), not in a file copied into each app. Every generated Gruntfile already loads that plugin, so fixes ship by version bump. A project's own `manifest` task still wins (grunt registration order) |

## 6. Known issues and follow-ups

- **Fixed: JSON import across Node versions.** `generators/action/index.js` and `utils/helpers.js` imported `action-definitions.json` with `assert { type: "json" }`, which Node 22+ rejects. The newer `with` syntax isn't accepted on Node 16 to 18.19. Both files now load the JSON with `createRequire`, which works on every supported version.
- **Dead CI:** `appveyor.yml` targets Node 4/5 and should be retired, or replaced with a matrix of Node 18 to 24 running `npm test`.
- **Pre-existing bug, not fixed: action names passed as arguments are ignored.** `yo mozu-actions:action <actionName…>` should skip the prompts.
  - `_prompting` reads `self.actionNames`, but yeoman-generator 7 stores arguments in `this.options.actionNames`. That name is also an option used as the default for the prompts.
  - So the arguments are dropped. With `--skip-prompts`, `configuring()` then crashes (`Cannot read properties of undefined (reading 'map')`). The dead branch also calls an undefined `done()`.
  - The end-to-end test answers the prompts instead. A fix needs a decision on how to separate the argument from the option, so it doesn't change how the app generator calls `composeWith`.
- **Not covered:** the full `yo mozu-actions` app generator. It inherits prompts and an `npm install` from `generator-mozu-app`. The action sub-generator, the app generator's `_deps` call and the Gruntfile config are tested directly, and the plugin's task is tested in its own repo.
