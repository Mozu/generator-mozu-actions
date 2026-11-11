"use strict";

import chalk from "chalk";
import updateNotifier from "update-notifier";
import mozuAppGenerator from "generator-mozu-app";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import localHelpers from "../../utils/helpers.js";
import genHelpers from "generator-mozu-app/utils/helpers.js";
import supportedTestFrameworks from "../../utils/supported-test-frameworks.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const helpers = {
  ...genHelpers,
  ...localHelpers,
};

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
);

// True when the Gruntfile text configures `key` (a config key such as `eslint: {` or a task such as 'eslint:normal'),
// as opposed to merely mentioning it in a comment or string.
function isConfigured(gruntfile, key) {
  return new RegExp("(^|[{,])\\s*['\"]?" + key + "['\"]?\\s*:|['\"]" + key + ":(normal|continuous)['\"]", "m").test(gruntfile);
}

export default class extends mozuAppGenerator {
  initializing() {
    updateNotifier({ pkg: packageJson, updateCheckInterval: 1 }).notify({
      defer: false,
    });

    super._acquireGitStatus();
    super._displayMozuBanner(
      "Follow the prompts to scaffold a Kibo Application that contains Api Extensions. You'll get a directory structure, action file skeletons, and a test framework!"
    );
  }

  async prompting() {
    await super.prompting();
    await this._zang();
  }

  _zang() {
    let generator = this;
    return new Promise((resolve, reject) => {
      const prompts = [
        {
          type: "list",
          name: "testFramework",
          message: "Choose a test framework:",
          choices: [
            {
              name: "Mocha",
              value: "mocha",
            },
            {
              name: "None/Manual",
              value: "manual",
            },
          ],
          default: generator.config.get("testFramework"),
        },
        {
          type: "confirm",
          name: "enableOnInstall",
          message: `Enable actions on install? ${chalk.yellow(
            "(This will add a custom function to the embedded.platform.applications.install action.)"
          )}`,
        },
      ];

      helpers.promptAndSaveResponse(generator, prompts, function () {
        if (generator._testFramework === "manual") {
          generator.log(
            `\n${chalk.bold.red(
              "Unit tests are strongly recommended."
            )} If you prefer a framework this generator does not support, or framework-free tests, you can still use the ${chalk.bold(
              "mozu-action-simulator"
            )} module to simulate a server-side environment for your action implementations.\n`
          );
        }

        const preconfiguredActions = [];

        if (generator._enableOnInstall)
          preconfiguredActions.push({
            actionId: "embedded.platform.applications.install",
            functionIds: ["embedded.platform.applications.install"],
          });

        process.stdout.write(" "); // hack to kick off the console for the subprocess
        const options = helpers.createActionOptions(generator, preconfiguredActions);
        generator.composeWith("mozu-actions:action", [], options).then(() => {
          resolve();
        });
      });
    });
  }

  configuring() {
    super.configuring();
    this._rc();
  }

  _rc() {
    this.config.set("testFramework", this._testFramework);
  }

  // Which linter this run wires up, decided by what the existing Gruntfile CONFIGURES (a mention in a comment or a
  // leftover dependency is not enough). The generator never switches an existing app's linter or rewrites the
  // author's lint setup: re-running it would otherwise put two linters side by side or reference targets that do not exist.
  //   "eslint" new app (no Gruntfile at all): ESLint, full wiring
  //   "jshint" the Gruntfile has the layout older versions generated (jshint with `normal` and `continuous` targets): keep it
  //   "kept"   the author has their own lint setup (eslint, or jshint with other targets), or a Gruntfile we cannot read
  //            (Gruntfile.cjs / .coffee): no lint steps are written, their lint config is left alone
  //   "none"   an existing Gruntfile with no linter: none is added
  _detectLintTool() {
    const read = (f) => this.fs.read(this.destinationPath(f), { defaults: "" }) || "";
    const gruntfile = read("Gruntfile.js");
    if (!gruntfile.trim()) {
      const other = ["Gruntfile.cjs", "Gruntfile.coffee"].some((f) => read(f).trim());
      return other ? "kept" : "eslint";
    }
    if (isConfigured(gruntfile, "eslint")) {
      return "kept";
    }
    if (isConfigured(gruntfile, "jshint")) {
      const standard = /['"]?normal['"]?\s*:/.test(gruntfile) && /['"]?continuous['"]?\s*:/.test(gruntfile);
      return standard ? "jshint" : "kept";
    }
    return "none";
  }

  // The dev dependencies this run adds. Lint packages only for the linter it wires up.
  _devDependencies() {
    const lint =
      this._lintTool === "eslint" ? ["eslint@^9", "grunt-eslint@^25"] : this._lintTool === "jshint" ? ["grunt-contrib-jshint"] : [];
    return [
      "grunt",
      "grunt-browserify",
      ...lint, // ESLint 9 and grunt-eslint 25 need Node 18.18, 20.9 or 21.1+
      "grunt-contrib-watch",
      // 2.5.0+ provides the `manifest` task (kibo.json -> functions.json); apps no longer carry tasks/manifest.js.
      "grunt-mozu-appdev-sync@^2.5.0",
      "load-grunt-tasks",
      "mozu-action-helpers",
      "mozu-action-simulator",
      "time-grunt",
    ];
  }

  writing() {
    //super.writing();
    this._lintTool = this._detectLintTool();
    this._dotfiles();
    this._packagejson();
    this._readme();
    this._gruntfile();
    this._enableOnInstallFn();
    this._tests();
  }

  _dotfiles() {
    ["editorconfig", "gitignore"].concat(this._lintTool === "jshint" ? ["jshintrc"] : []).forEach((filename) => {
      // an author's own .jshintrc is theirs: only the first run writes it
      if (filename === "jshintrc" && this.fs.exists(this.destinationPath(".jshintrc"))) {
        return;
      }
      this.fs.copy(
        this.templatePath(filename),
        this.destinationPath(`.${filename}`)
      );
    });
    const hasEslintConfig = ["js", "mjs", "cjs"].some((e) => this.fs.exists(this.destinationPath("eslint.config." + e)));
    if (this._lintTool === "eslint" && !hasEslintConfig) {
      this.fs.copy(this.templatePath("eslint.config.js"), this.destinationPath("eslint.config.js"));
    }
  }

  _packagejson() {
    this._package.devDependencies = {};
    this.fs.writeJSON(
      this.destinationPath("package.json"),
      helpers.merge(this._package, this.fs.readJSON("package.json"), {
        scripts: {
          test: "grunt test",
        },
      })
    );
  }

  _readme() {
    this.fs.copyTpl(
      this.templatePath("_README.md.tpt"),
      this.destinationPath("README.md"),
      {
        name: this._name,
        version: this._version,
        description: this._description,
      }
    );
  }

  _gruntfile() {
    const self = this;
    let taskConfig = this.fs.readJSON(
      this.templatePath("gruntfile-config.json")
    );
    // The template is written for ESLint. Anything else adapts it to the linter the app already has.
    if (this._lintTool !== "eslint") {
      delete taskConfig.configs.eslint; // never overwrite an existing eslint block, never add one to a lint-less app
    }
    if (this._lintTool === "jshint") {
      taskConfig = JSON.parse(
        JSON.stringify(taskConfig).replace(/eslint\.normal\.src/g, "jshint.normal").replace(/eslint:/g, "jshint:")
      );
      helpers.remark(
        this,
        "This app lints with jshint (grunt-contrib-jshint), which cannot parse modern syntax such as `?.` or `#private` fields. " +
          "To switch to ESLint, see the README."
      );
    } else if (this._lintTool !== "eslint") {
      // "kept" and "none": no lint step is written, because we cannot know the author's target names (or there is no linter).
      const notLint = (t) => !t.startsWith("eslint:");
      taskConfig.tasks.build = taskConfig.tasks.build.filter(notLint);
      const gruntfileText = this.fs.read(this.destinationPath("Gruntfile.js"), { defaults: "" }) || "";
      if (this._lintTool === "kept" && isConfigured(gruntfileText, "watch")) {
        delete taskConfig.configs.watch; // the author's own watch config (with their lint step) stays
      } else {
        taskConfig.configs.watch.src.tasks = taskConfig.configs.watch.src.tasks.filter(notLint);
        taskConfig.configs.watch.src.files = ["./assets/src/**/*.js"];
      }
    }
    if (this._lintTool === "none") {
      helpers.remark(this, "This Gruntfile has no linter, so none was added. To add ESLint, see the README.");
    }

    const existingLines = this.fs
      .read(this.destinationPath("Gruntfile.js"), { defaults: "" })
      .split("\n")
      .map((l) => l.trim());

    [
      "require('load-grunt-tasks')(grunt);",
      "require('time-grunt')(grunt);",
      "grunt.loadTasks('./tasks');",
    ].forEach((line) => {
      if (!existingLines.includes(line)) {
        self.gruntfile.prependJavaScript(line);
      }
    });

    if (
      existingLines.every(
        (line) =>
          !line.includes("mozuconfig") &&
          !line.includes("require('./mozu.config.json')")
      )
    ) {
      this.gruntfile.insertConfig(
        "mozuconfig",
        "grunt.file.readJSON('./mozu.config.json')"
      );
    }

    Object.keys(taskConfig.configs).forEach((name) => {
      self.gruntfile.insertConfig(
        name,
        JSON.stringify(taskConfig.configs[name], null, 2)
      );
    });

    Object.keys(taskConfig.tasks).forEach((name) => {
      self.gruntfile.registerTask(name, taskConfig.tasks[name]);
    });

  }

  _enableOnInstallFn() {
    if (this._enableOnInstall) {
      this.fs.copy(
        this.templatePath("enableactions.js"),
        this.destinationPath(
          "assets/src/domains/platform.applications/embedded.platform.applications.install.js"
        )
      );
    }
  }

  _tests() {
    this.log(this._testFramework);
    if (this._testFramework !== "manual") {
      const requirements = supportedTestFrameworks[this._testFramework];
      if (!requirements) {
        throw new Error(
          `Unsupported test framework: ${this.options.testFramework}`
        );
      }
      this.gruntfile.insertConfig(
        requirements.taskName,
        JSON.stringify(requirements.taskConfig)
      );
      this.gruntfile.registerTask("test", requirements.taskName);
      this.gruntfile.registerTask("build", "test"); // should append
      if (!this.options["skip-install"]) {
        this.log("installing test framework");
        this.addDevDependencies(requirements.install);
      }
    }
  }

  async install() {
    //super.install();
    return await this._deps();
  }

  async _deps() {
    const deps = this._devDependencies();
    if (!this.options["skip-install"]) {
      return await this.addDevDependencies(deps);
    }
    helpers.remark(
      this,
      "skip-install: not added: " + deps.join(", ") + '. Install them before running "grunt build" ' +
        '(grunt-mozu-appdev-sync provides the "manifest" task).'
    );
  }
}
