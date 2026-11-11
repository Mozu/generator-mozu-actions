import uniq from "lodash.uniq";
import Generator from "yeoman-generator";
import * as glob from "glob";
import * as acorn from "acorn";
import * as acornWalk from "acorn-walk";
import chalk from "chalk";
import path from "path";
import { createRequire } from "module";
// createRequire instead of an import attribute: Node 16-21 need `assert`, Node 22+ only accept `with`.
const actionDefsPeriod = createRequire(import.meta.url)("../../action-definitions.json");
const actionDefsAsterisks = JSON.parse(
  JSON.stringify(actionDefsPeriod).replace(/\./g, "*")
);

import pkg from "mozu-metadata";
const { getActionDefinitions } = pkg;
import localHelpers from "../../utils/helpers.js";
import genHelpers from "generator-mozu-app/utils/helpers.js";

const helpers = {
  ...genHelpers,
  ...localHelpers,
};

const supportedTestFrameworks = {
  mocha: {
    name: "Mocha",
    install: ["mocha", "grunt-mocha-test"],
    taskName: "mochaTest",
    taskConfig: {
      all: {
        clearRequireCache: true,
        src: ["assets/test/**/*.js"],
      },
    },
  },
};

function getActionType(actionName) {
  return actionName.split(".")[0];
}

function createActionName(action) {
  return {
    name: action,
    value: action,
  };
}

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.argument("actionNames", {
      desc: "Names of the actions to scaffold. Can be used as a command-line argument in lieu of the prompts.",
      type: Array,
      required: false,
    });

    this.option("testFramework", {
      desc:
        "Name of the test framework to use when scaffolding test templates. Options include: " +
        Object.keys(supportedTestFrameworks).join(", "),
      type: String,
      defaults: this.config.get("testFramework") || "manual",
    });

   
    this.option("internal", {
      type: Boolean,
      defaults: true,
      default: true,
      hide: true,
    });

    this.option("name", {
      type: String,
      defaults: this.config.get("name"),
      hide: true,
    });

    this.option("description", {
      type: String,
      defaults: this.config.get("description"),
      hide: true,
    });

    this.option("overwriteAll", {
      type: Boolean,
      defaults: false,
      hide: true,
    });

    this.option("preconfigured", {
      type: Array,
      required: false,
      hide: true,
    });

    this.option("actionNames", {
      type: Array,
      required: false,
      hide: true,
    });

    this.option("domains", {
      type: Array,
      required: false,
      hide: true,
    });

    this.option("definitions", {
      type: String,
      required: false,
      hide: true,
    });
  }

  async initializing() {
    await this._detectAvailable();
    this._detectExisting();
  }
  _detectAvailable() {
    var self = this;

    return new Promise((resolve, reject) => {
      this.config.save();
      const usingInternal =this.options.internal; 
      if (1==2) {
        getActionDefinitions({
          url: this.options.definitions,
        })
          .then(function (defs) {
            self._actionDefs = defs;
            self._availableActions = defs.actions;
          })
          .catch(function () {
            self._actionDefs = actionDefsAsterisks;
            self._availableActions = actionDefsAsterisks.actions;
          })
          .then(createActionsMap);
      } else {
        self._actionDefs = actionDefsAsterisks;
        self._availableActions = actionDefsAsterisks.actions.filter(function (
          action
        ) {
          return usingInternal || !action.beta;
        });
        self._actionDefs.domains = actionDefsAsterisks.domains.filter(function (
          domain
        ) {
          return !!self._availableActions.find(function (action) {
            return action.domain === domain;
          });
        });

        createActionsMap();

        self._actionDefsPeriod = actionDefsPeriod;
        self._availableActionsPeriod = actionDefsPeriod.actions.filter(
          function (action) {
            return !action.beta;
          }
        );
        self._actionDefsPeriod.domains = actionDefsPeriod.domains.filter(
          function (domain) {
            return !!self._availableActionsPeriod.find(function (action) {
              return action.domain === domain;
            });
          }
        );
        createActionsMapPeriod();
      }
      function createActionsMap() {
        self._actionsMap = self._availableActions.reduce(function (
          memo,
          action
        ) {
          memo[action.action] = action;
          return memo;
        },
        {});
        resolve();
      }
      function createActionsMapPeriod() {
        self._actionsMapPeriod = self._availableActionsPeriod.reduce(function (
          memo,
          action
        ) {
          memo[action.action] = action;
          return memo;
        },
        {});
        resolve();
      }
    });
  }
  _detectExisting() {
    var self = this;
    var manifestFilenames = glob.sync(this.destinationPath("**/*.manifest.js"));

    var detectedCustomFunctions = manifestFilenames.reduce(function (
      detected,
      filename
    ) {
      var source;
      // in case implementations are broken,
      // avoid running them and just read out metadata
      try {
        source = self.fs.read(filename);

        acornWalk.simple(acorn.parse(source), {
          ExpressionStatement: function (node) {
            if (
              node.expression.left.object &&
              node.expression.left.object.name === "module" &&
              node.expression.left.property &&
              node.expression.left.property.name === "exports"
            ) {
              node.expression.right.properties.forEach(function (prop) {
                var actionName = prop.value.properties.reduce(function (
                  found,
                  pr
                ) {
                  return pr.key.name === "actionName" ? pr.value.value : found;
                },
                null);
                if (!detected[actionName]) {
                  detected[actionName] = [];
                }
                detected[actionName].push(prop.key.value);
              });
            }
          },
        });

        return detected;
      } catch (e) {
        helpers.remark(
          self,
          "Unable to parse " +
            filename +
            " to detect implemented actions. Won't be detecting any actions in there! " +
            e
        );
        throw e;
      }
    },
    {});

    this.implementedCustomFunctions = detectedCustomFunctions;
  }

  async prompting() {
    await this._getActions();
    await this._createMultipleActionsFor();
    await this._getMultipleActionNames();
  }

  async _getActions() {
    function actionIsInDomain(name, domain) {
      var withoutType = name.split("*").slice(1).join("*");
      return withoutType.indexOf(domain) === 0;
    }

    var self = this;

    // return new Promise((resolve, reject) => {
    var prompts;

    var actionNameArgs = self.actionNames;

    var defaults;

    if (actionNameArgs) {
      self._actionNames = [];
      self._domains = [];

      actionNameArgs.forEach(function (name) {
        var domain = helpers.getDomainFromActionName(self._actionDefs, name);
        if (!domain) {
          throw new Error(
            "No domain found for action name " +
              name +
              ". It appears to be an invalid action."
          );
        }
        if (self._domains.indexOf(domain) === -1) {
          self._domains.push(domain);
        }
        self._actionNames.push(createActionName(name, domain));
      });

      done();
    } else {
      defaults =
        self.options.actionNames ||
        (self.implementedCustomFunctions
          ? Object.keys(self.implementedCustomFunctions)
          : []);

      prompts = [
        {
          type: "checkbox",
          name: "domains",
          message: "Choose domains:",
          choices: self._actionDefs.domains,
          validate: function (chosen) {
            return (
              chosen.length > 0 ||
              "Please choose at least one domain to scaffold."
            );
          },
          default: self.options.domains || self.config.get("domains"),
        },
      ].concat(
        self._actionDefs.domains.map(function (domain) {
          return {
            type: "checkbox",
            name: domain,
            message: "Actions for domain " + chalk.bold(domain),
            choices: self._availableActions
              .filter(function (action) {
                return actionIsInDomain(action.action, domain);
              })
              .map(function (action) {
                return createActionName(action.action, domain);
              }),
            default: defaults.filter(function (name) {
              return actionIsInDomain(name, domain);
            }),
            when: function (props) {
              return props.domains.indexOf(domain) !== -1;
            },
          };
        })
      );

      // multiple custom function support
      prompts.push({
        type: "list",
        name: "createMultiple",
        message:
          "Create multiple custom functions per action, or one " +
          "custom function per action? (You can manually change " +
          "this later.)",
        choices: [
          {
            name: "One (simple mode)",
            value: false,
          },
          {
            name: "Multiple (advanced mode)",
            value: "yes",
          },
        ],
        default: function (answers) {
          if (
            self.implementedCustomFunctions &&
            Object.keys(self.implementedCustomFunctions).some(function (a) {
              return self.implementedCustomFunctions[a].length > 1;
            })
          ) {
            return "yes";
          }
          return (
            answers.storefront &&
            [
              "http.storefront.routes",
              "hypr.storefront.tags",
              "hypr.storefront.filters",
            ].some(function (shouldBeMultiple) {
              return !!~answers.storefront.indexOf(shouldBeMultiple);
            }) &&
            "yes"
          );
        },
        when: function (answers) {
          return answers.domains.some(function (domain) {
            return answers[domain].some(function (action) {
              return self._actionsMap[action].supportsMultipleCustomFunctions;
            });
          });
        },
      });

      if (!self.options["skip-prompts"]) {
        const answers = await self.prompt(prompts);

        self._domains = answers.domains;
        delete answers.domains;
        self._createMultiple = answers.createMultiple;
        delete answers.createMultiple;
        self._actionNames = Object.keys(answers).reduce(function (m, k) {
          return m.concat(answers[k]);
        }, []);
      }
    }
    // });
  }
  async _createMultipleActionsFor() {
    var self = this;
    // return new Promise((resolve, reject) => {
    if (self._createMultiple) {
      const answers = await self.prompt([
        {
          type: "checkbox",
          name: "createMultipleFor",
          message: "Create multiple custom functions for which actions?",
          choices: self._actionNames
            .filter(function (action) {
              return self._actionsMap[action].supportsMultipleCustomFunctions;
            })
            .map(createActionName),
        },
      ]);
      self._createMultipleFor = answers.createMultipleFor;
    }
    // });
  }
  async _getMultipleActionNames() {
    var self = this;

    var seenNames = {};
    if (self._createMultipleFor && self._createMultipleFor.length > 0) {
      helpers.remark(
        self,
        "For each of the following actions, please provide " +
          "a list of custom function names.\nThey must be " +
          "unique, comma separated, and contain no spaces."
      );
      helpers.remark(
        self,
        "For instance, to create three custom functions " +
          'named "alpha", "beta", and "gamma", type ' +
          chalk.yellow("alpha,beta,gamma") +
          "."
      );
      const answers = await self.prompt(
        self._createMultipleFor.map(function (name) {
          return {
            type: "input",
            name: name,
            message:
              "Custom function names for " + chalk.bold.yellow(name) + ":",
            default:
              self.implementedCustomFunctions &&
              self.implementedCustomFunctions[name] &&
              self.implementedCustomFunctions[name].join(","),
            validate: function (value) {
              if (!value || value.length == 0) {
                return (
                  "Please enter at least one name for a custom " + "function."
                );
              }
              return true;
            },
            filter: function (value) {
              // big cheat but helps with validation;
              // a side effect in the filter function, where we keep track
              // of custom function names we have already seen.
              var values = value.split(",").map(function (v) {
                v = v.trim();
                seenNames[v] = true;
                return v;
              });
              return values;
            },
          };
        })
      );

      helpers.convertToPeriods(answers);
      self._multipleCustomFunctions = answers;
      resolve();
    } else {
      self._multipleCustomFunctions = {};
    }
  }

  configuring() {
    let preconfigured = (this.options.preconfigured || []).slice();
    helpers.convertToPeriods(this._actionNames);
    helpers.convertToPeriods(this._domains);
    this._actions = this._actionNames.map(
      function (name) {
        let functionNames = this._multipleCustomFunctions[name] || [name];
        preconfigured.forEach(function (def) {
          if (def.actionId === name) {
            functionNames = uniq(functionNames.concat(def.functionIds));
          }
        });
        return {
          name: name,
          domain: this._actionsMapPeriod[name].domain,
          customFunctionNames: functionNames,
        };
      }.bind(this)
    );

    this.config.set("domains", this._domains);
    this.config.set("actionNames", this._actionNames);
  }

  // kibo.json is required by the manifest grunt task (grunt-mozu-appdev-sync): a top-level contextReuse plus an
  // entry per bundle. New entries default to "none"; "warm" is the author's call after an audit.
  // Never changes an existing value, never writes a file that needs nothing, never overwrites a file it cannot read.
  _ensureKiboJson(manifestsWrittenNow) {
    const file = this.destinationPath("kibo.json");
    const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    const valid = (v) => typeof v === "string" && ["warm", "none"].includes(v.trim().toLowerCase());
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const leftAlone = "The generator did not change it.";

    let config;
    try {
      config = this.fs.readJSON(file, {});
    } catch (e) {
      return helpers.lament(this, "kibo.json is not valid JSON (" + e.message + "); fix it by hand. " + leftAlone, e);
    }
    if (!isObj(config)) {
      return helpers.lament(this, "kibo.json is not a JSON object; fix it by hand. " + leftAlone);
    }
    if (config.functions !== undefined && !isObj(config.functions)) {
      return helpers.lament(this, 'kibo.json: "functions" is not an object; fix it by hand. ' + leftAlone);
    }

    const problems = [];
    let changed = false;
    if (config.contextReuse === undefined) {
      // contextReuse first, so a new file reads top-down; an existing file keeps its key order.
      // fromEntries (not Object.assign) so an own "__proto__" key survives.
      config = Object.fromEntries([["contextReuse", "none"], ...Object.entries(config)]);
      changed = true;
    } else if (!valid(config.contextReuse)) {
      problems.push('top-level "contextReuse" ' + JSON.stringify(config.contextReuse));
    }
    if (config.functions === undefined) {
      config.functions = {};
    }

    const added = [];
    const onDisk = glob
      .sync("assets/src/**/*.manifest.js", { cwd: this.destinationPath(), nocase: false }) // grunt's glob is case-sensitive
      .map((p) => p.split(path.sep).join("/"));
    uniq(onDisk.concat(manifestsWrittenNow)).forEach((src) => {
      if (!own(config.functions, src)) {
        config.functions[src] = { contextReuse: "none" };
        added.push(src);
      } else if (!isObj(config.functions[src]) || !valid(config.functions[src].contextReuse)) {
        problems.push('"' + src + '" ' + JSON.stringify(config.functions[src]));
      }
    });

    if (changed || added.length) {
      this.fs.writeJSON(file, config);
    }
    if (changed || added.length) {
      helpers.remark(
        this,
        "kibo.json: added " + (changed ? 'top-level contextReuse "none"' + (added.length ? " and entries for " : "") : "") + added.join(", ") +
          (added.length ? ' with contextReuse "none"' : "") + '. Set "warm" only after the bundle passes the ArcJs shared-context audit.'
      );
    }
    if (problems.length) {
      helpers.lament(
        this,
        "kibo.json has values the build rejects (left as they are): " + problems.join("; ") +
          '. Each needs { "contextReuse": "warm" | "none" }.'
      );
    }
  }

  // A task named "manifest" in the app's own tasks (every app generated before grunt-mozu-appdev-sync 2.5.0 has
  // tasks/manifest.js) is registered first and wins, so the plugin's task never runs and kibo.json is ignored.
  // Looks in tasks/, in every folder the Gruntfile loads with grunt.loadTasks('<dir>'), and in the Gruntfile.
  // A task whose name is built at run time cannot be found this way; the plugin's grunt-time warning is the backstop.
  _warnLocalManifestTask() {
    const registers = /register(Multi)?Task\s*\(\s*(['"`])manifest\2/g;
    const read = (f) => this.fs.read(this.destinationPath(f), { defaults: "" }) || "";
    // A match counts unless its own line starts with a comment marker. No comment stripping: that mis-handled
    // "//" inside strings and "/*" inside globs, and could hide a real registration.
    const live = (src) => {
      for (const m of src.matchAll(registers)) {
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        if (!/^\s*(\/\/|\/?\*)/.test(src.slice(lineStart, m.index))) { return true; }
      }
      return false;
    };
    // Same files grunt loads: Gruntfile.{js,cjs}, and *.{js,cjs} of tasks/ and of each loadTasks('<dir>') folder.
    const gruntfiles = ["Gruntfile.js", "Gruntfile.cjs"];
    const dirs = ["tasks"];
    for (const g of gruntfiles) {
      for (const m of read(g).matchAll(/loadTasks\s*\(\s*(['"`])([^'"`]+)\1/g)) {
        const dir = path.posix.normalize(m[2].replace(/\\/g, "/")).replace(/^\.\//, "").replace(/\/$/, "");
        if (dir && !dirs.includes(dir)) { dirs.push(dir); }
      }
    }
    const files = dirs
      .flatMap((d) => glob.sync((d === "." ? "" : d + "/") + "*.{js,cjs}", { cwd: this.destinationPath(), nocase: false }))
      .concat(gruntfiles);
    const hits = uniq(files).filter((f) => live(read(f)));
    if (hits.length) {
      helpers.lament(
        this,
        hits.join(", ") + ' registers its own "manifest" task. It overrides grunt-mozu-appdev-sync, so kibo.json is IGNORED ' +
          'and functions.json gets no arcjs block. Remove that task (carry over local changes first), set grunt-mozu-appdev-sync to ^2.5.0, ' +
          'then run "grunt build --kibo-init". See the README.'
      );
    }
  }

  writing() {
    var self = this;
    var requirements;
    var doNotWrite = (self.options.preconfigured || []).reduce(function (
      functionIds,
      def
    ) {
      return functionIds.concat(def.functionIds);
    },
    []);

    self._domains.forEach(function (domain) {
      var thisDomainsActions = self._actions.filter(function (action) {
        return action.domain === domain;
      });
      self.fs.copyTpl(
        self.templatePath("_manifest.jst"),
        self.destinationPath("assets/src/" + domain + ".manifest.js"),
        {
          actions: thisDomainsActions,
        }
      );
      thisDomainsActions.forEach(function (action) {
        action.customFunctionNames.forEach(function (customFunctionName) {
          var implPath = self.destinationPath(
            "assets/src/domains/" + domain + "/" + customFunctionName + ".js"
          );
          if (
            (self.options.overwriteAll || !self.fs.exists(implPath)) &&
            doNotWrite.indexOf(customFunctionName) === -1
          ) {
            self.fs.copyTpl(
              self.templatePath("_action_implementation.jst"),
              implPath,
              {
                action: action,
                actionType: getActionType(action.name),
                context: JSON.stringify(
                  self._actionsMapPeriod[action.name].context,
                  null,
                  2
                ),
              }
            );
          }
        });
      });
    });

    self._ensureKiboJson(
      self._domains.map((domain) => "assets/src/" + domain + ".manifest.js")
    );
    self._warnLocalManifestTask();

    if (self.options.testFramework&& self.options.testFramework !== "manual") {
      requirements = supportedTestFrameworks[self.options.testFramework];

      if (!requirements) {
        this.log(
          "Unsupported test framework: " + self.options.testFramework
        );
      }

      helpers.remark(self, "Installing " + self.options.testFramework);
      self._actions.forEach(
        function (action) {
          action.customFunctionNames.forEach(
            function (customFunctionName) {
              var testPath = self.destinationPath(
                "assets/test/" + customFunctionName + ".t.js"
              );
              var actionType = getActionType(action.name);
              var actionConfig = self._actionsMapPeriod[action.name];

              if (
                doNotWrite.indexOf(customFunctionName) === -1 &&
                (self.options.overwriteAll || !self.fs.exists(testPath))
              ) {
                try {
                  self.fs.copyTpl(
                    self.templatePath(
                      "test/" +
                        self.options.testFramework +
                        "_" +
                        actionType +
                        ".jst"
                    ),
                    testPath,
                    {
                      functionId: customFunctionName,
                      action: action,
                      context: actionConfig.context,
                    }
                  );
                } catch (e) {
                  helpers.lament(
                    self,
                    "There was an error creating unit tests. This may mean that there is missing metadata for one or more of the actions you chose."
                  );
                  if (self.options.internal) {
                    helpers.lament(
                      self,
                      "Examine the mozuxd-metadata package to make sure there is complete metadata for the context object for this action: " +
                        action.name +
                        ". The original error is: "
                    );
                  } else {
                    helpers.lament(
                      self,
                      "Please contact Kibo Support to report this issue writing tests for action " +
                        action.name +
                        ":"
                    );
                  }
                  throw e;
                }
              }
            }.bind(self)
          );
        }.bind(self)
      );
    }
  }
}
