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

export default class extends mozuAppGenerator {
  initializing() {
    updateNotifier({ pkg: packageJson, updateCheckInterval: 1 }).notify({
      defer: false,
    });

    super._acquireGitStatus();
    super._displayMozuBanner(
      "Follow the prompts to scaffold a Mozu Application that contains Actions. You'll get a directory structure, action file skeletons, and a test framework!"
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

  writing() {
    //super.writing();
    this._dotfiles();
    this._packagejson();
    this._readme();
    this._gruntfile();
    this._enableOnInstallFn();
    this._tests();
  }

  _dotfiles() {
    ["editorconfig", "jshintrc", "gitignore"].forEach((filename) => {
      this.fs.copy(
        this.templatePath(filename),
        this.destinationPath(`.${filename}`)
      );
    });
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
    const taskConfig = this.fs.readJSON(
      this.templatePath("gruntfile-config.json")
    );

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

    this.fs.copy(
      this.templatePath("manifest.js"),
      this.destinationPath("tasks/manifest.js")
    );
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
    if (!this.options["skip-install"]) {
      return await this.addDevDependencies([
        "grunt",
        "grunt-browserify",
        "grunt-contrib-jshint",
        "grunt-contrib-watch",
        "grunt-mozu-appdev-sync",
        "load-grunt-tasks",
        "mozu-action-helpers",
        "mozu-action-simulator",
        "time-grunt",
      ]);
    }
  }
}
