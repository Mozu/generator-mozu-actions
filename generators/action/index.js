import uniq from "lodash.uniq";
import Generator from "yeoman-generator";
import * as glob from "glob";
import * as acorn from "acorn";
import * as acornWalk from "acorn-walk";
import chalk from "chalk";
import actionDefsPeriod from "../../action-definitions.json" assert { type: "json" };
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
      type: "Boolean",
      defaults: false,
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

      if (this.options.internal) {
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
          return !action.beta;
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
