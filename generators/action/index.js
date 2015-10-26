'use strict';
var yeoman = require('yeoman-generator');
var glob = require('glob');
var acorn = require('acorn');
var acornWalk = require('acorn/dist/walk');
var chalk = require('chalk');
var inquirer = require('inquirer');
var actionDefs = require('../../action-definitions.json');
var getActionDefs = require('mozu-metadata/utils/get-action-defs');
var helpers = require('generator-mozu-app').helpers;
helpers = helpers.merge(helpers, require('../../utils/helpers'));

var supportedTestFrameworks = require('../../utils/supported-test-frameworks');

function getActionType(actionName) {
  return actionName.split('.')[0];
}

function createActionName(action) {
  return {
    name: action,
    value: action
  };
}

module.exports = yeoman.generators.Base.extend({

  constructor: function() {
    yeoman.generators.Base.apply(this, arguments);

    this.argument('actionNames', {
      desc: 'Names of the actions to scaffold. Can be used as a command-line argument in lieu of the prompts.',
      type: Array,
      required: false
    });

    this.option('testFramework', {
      desc: 'Name of the test framework to use when scaffolding test templates. Options include: ' + Object.keys(supportedTestFrameworks).join(', '),
      type: String,
      defaults: this.config.get('testFramework') || "manual"
    });

    this.option('internal', {
      type: 'Boolean',
      defaults: false,
      hide: true
    });

    this.option('name', {
      type: String,
      defaults: this.config.get('name'),
      hide: true
    });

    this.option('description', {
      type: String,
      defaults: this.config.get('description'),
      hide: true
    });

    this.option('overwriteAll', {
      type: Boolean,
      defaults: false,
      hide: true
    });

    this.option('doNotWrite', {
      type: Array,
      required: false,
      hide: true
    });

    this.option('actionNames', {
      type: Array,
      required: false,
      hide: true
    });

    this.option('domains', {
      type: Array,
      required: false,
      hide: true
    });

    this.option('definitions', {
      type: String,
      required: false,
      hide: true
    });

  },

  initializing: {
    detectAvailable: function() {
      var self = this;
      var done = this.async();
      this.config.save();
      if (this.options.internal) {
        getActionDefs({
          url: this.options.definitions
        }).then(function(defs) {
          self._actionDefs = defs;
          self._availableActions = defs.actions;
        }).catch(function() {
          self._actionDefs = actionDefs;
          self._availableActions = actionDefs.actions;
        }).then(createActionsMap);
      } else {
        self._actionDefs = actionDefs;
        self._availableActions = actionDefs.actions.filter(function(action) {
          return !action.beta;
        });
        createActionsMap();
      }
      function createActionsMap() {
        self._actionsMap = self._availableActions.reduce(function(memo, action) {
          memo[action.action] = action;
          return memo;
        }, {});
        done();
      }
    },
    detectExisting: function() {
      var self = this;
      var manifestFilenames = glob.sync(this.destinationPath('**/*.manifest.js'));
      
      var detectedActionNames = manifestFilenames.reduce(function(detected, filename) {
        var source;
        // in case implementations are broken,
        // avoid running them and just read out metadata
        try {
          source = self.fs.read(filename);

          acornWalk.simple(acorn.parse(source), {
            Property: function(node) {
              if (node.key.name === "actionName") {
                detected.push(node.value.value);
              }
            }
          });

          return detected;

        } catch(e) {
          helpers.remark(self, "Unable to parse " + filename + " to detect implemented actions. Won't be detecting any actions in there! " + e);
          throw e;
        }
      }, []);

      this.implementedActions = detectedActionNames;

    }
  },

  prompting: {

    getActions: function() {

      function actionIsInDomain(name, domain) {
        var withoutType = name.split('.').slice(1).join('.');
        return withoutType.indexOf(domain) === 0;
      }

      var self = this;

      var done = this.async();

      var prompts;

      var actionNameArgs = this.actionNames;

      if (actionNameArgs) {

        this._actionNames = [];
        this._domains = [];

        actionNameArgs.forEach(function(name) {
          var domain = helpers.getDomainFromActionName(self._actionDefs, name);
          if (!domain) {
            throw new Error('No domain found for action name ' + name + '. It appears to be an invalid action.');
          }
          if (this._domains.indexOf(domain) === -1) {
            this._domains.push(domain);
          }
          this._actionNames.push(createActionName(name, domain));
        });

        done();

      } else {

        prompts = [{
          type: 'checkbox',
          name: 'domains',
          message: 'Choose domains:',
          choices: self._actionDefs.domains,
          validate: function(chosen) {
            return chosen.length > 0 || 'Please choose at least one domain to scaffold.';
          },
        default: this.options.domains || this.config.get('domains')
        }].concat(self._actionDefs.domains.map(function(domain) {
          return {
            type: 'checkbox',
            name: domain,
            message: 'Actions for domain ' + chalk.bold(domain),
            choices: self._availableActions.filter(function(action) {
              return actionIsInDomain(action.action, domain);
            }).map(function(action) {
              return createActionName(action.action, domain);
            }),
            default: (self.options.actionNames || self.implementedActions).filter(function(name) {
              return actionIsInDomain(name, domain);
            }),
            when: function(props) {
              return props.domains.indexOf(domain) !== -1;
            }
          };
        }));

        // multiple custom function support
        prompts.push({
          type: 'list',
          name: 'createMultiple',
          message: 'Create multiple custom functions per action, or one ' +
                   'custom function per action? (You can manually change ' +
                   'this later.)',
          choices: [
            {
              name: 'One (simple mode)',
              value: false
            },
            {
              name: 'Multiple (advanced mode)',
              value: "yes"
            }
          ],
          default: function(answers) {
            return answers.storefront &&
                   ['http.storefront.routes',
                    'hypr.storefront.tags',
                    'hypr.storefront.filters']
                   .some(function(shouldBeMultiple) {
                     return !!~answers.storefront.indexOf(shouldBeMultiple);
                   }) && "yes";
          },
          when: function(answers) {
            return answers.domains.some(function(domain) {
              return answers[domain].some(function(action) {
                return self._actionsMap[action]
                        .supportsMultipleCustomFunctions;
              })
            });
          }
        });

        if (!this.options['skip-prompts']) {
          this.prompt(prompts, function(answers) {
            self._domains = answers.domains;
            delete answers.domains;
            self._createMultiple = answers.createMultiple;
            delete answers.createMultiple;
            self._actionNames = Object.keys(answers).reduce(function(m, k) {
              return m.concat(answers[k]);
            }, []);
            done();
          });
        }

      }

    }, 
    createMultipleActionsFor: function() {
      var self = this;
      var done;
      if (self._createMultiple) {
        done = self.async();
        self.prompt([
          {
            type: 'checkbox',
            name: 'createMultipleFor',
            message: 'Create multiple custom functions for which actions?',
            choices: self._actionNames.filter(function(action) {
              return self._actionsMap[action].supportsMultipleCustomFunctions;
            }).map(createActionName)
          }
        ], function(answers) {
          self._createMultipleFor = answers.createMultipleFor;
          done();
        });
      }
    },
    getMultipleActionNames: function() {
      var self = this;
      var done;
      var seenNames = {};
      if (self._createMultipleFor && self._createMultipleFor.length > 0) {
        done = self.async();
        helpers.remark(this, 
                       'For each of the following actions, please provide ' +
                       'a list of custom function names.\nThey must be ' + 
                       'unique, comma separated, and contain no spaces.');
        helpers.remark(this,
                       'For instance, to create three custom functions ' +
                       'named "alpha", "beta", and "gamma", type ' +
                        chalk.yellow('alpha,beta,gamma') + '.');
        self.prompt(
          self._createMultipleFor.map(function(name) {
            return {
              type: 'input',
              name: name,
              message: 'Custom function names for ' + chalk.bold.yellow(name) +
                       ':',
              validate: function(value) { 
                if (!value || value.length == 0) {
                  return 'Please enter at least one name for a custom ' +
                         'function.';
                }
                var seen = value.split(',').filter(function(v) {
                  return !!seenNames[v];
                });
                switch (seen.length) {
                  case 0:
                    return true;
                  case 1:
                    return 'You have already used the custom function name ' +
                           chalk.yellow(seen[0]) + '. Please select a ' +
                           'different name.';
                  default:
                    return 'You have already used the custom function ' +
                           'names ' + chalk.yellow(seen.join(', ')) + '. ' +
                           ' Please select different names.'
                }
              },
              filter: function(value) { 
                // big cheat but helps with validation;
                // a side effect in the filter function, where we keep track
                // of custom function names we have already seen.
                var values = value.split(',').map(function(v) {
                  v = v.trim();
                  seenNames[v] = true;
                  return v;
                });
                return values;
              }
            }
          }),
          function(answers) {
            self._multipleCustomFunctions = answers;
            done();
          }
        )
      } else {
        self._multipleCustomFunctions = {};
      }
    }
  },

  configuring: function() {
    this._actions = this._actionNames.map(function(name) {
      return {
        name: name,
        domain: this._actionsMap[name].domain,
        customFunctionNames: this._multipleCustomFunctions[name] || [name]
      };
    }.bind(this));
    this.config.set('domains', this._domains);
    this.config.set('actionNames', this._actionNames);
  },

  writing: function() {

    var self = this;
    var requirements;
    var doNotWrite = self.options.doNotWrite || [];

    this._domains.forEach(function(domain) {
      var thisDomainsActions = self._actions.filter(function(action) {
        return action.domain === domain;
      });
      self.fs.copyTpl(
        self.templatePath('_manifest.jst'),
        self.destinationPath('assets/src/' + domain + '.manifest.js'),
        {
          actions: thisDomainsActions
        });
      thisDomainsActions.forEach(function(action) {
        action.customFunctionNames.forEach(function(customFunctionName) {
          var implPath = self.destinationPath('assets/src/domains/' + 
                         domain + '/' + customFunctionName + '.js');
          if ((self.options.overwriteAll || !self.fs.exists(implPath)) &&
              (doNotWrite.indexOf(action.name) === -1)) {
            self.fs.copyTpl(
              self.templatePath('_action_implementation.jst'),
              implPath, {
                action: action,
                actionType: getActionType(action.name),
                context: JSON.stringify(self._actionsMap[action.name].context, null, 2)
              }
            );
          }
        })
      });
    });

    if (this.options.testFramework !== "manual") {

      requirements = supportedTestFrameworks[this.options.testFramework];

      if (!requirements) {
        throw new Error('Unsupported test framework: ' + this.options.testFramework);
      }

      helpers.remark(this, 'Installing ' + this.options.testFramework);
      this._actions.forEach(function(action) {
        action.customFunctionNames.forEach(function(customFunctionName) {

          var testPath = this.destinationPath(
            'assets/test/' + customFunctionName + '.t.js');
          var actionType = getActionType(action.name);
          var actionConfig = this._actionsMap[action.name];

          if ((doNotWrite.indexOf(action.name) === -1) &&
              (this.options.overwriteAll || !this.fs.exists(testPath))) {

            try {
              this.fs.copyTpl(
                this.templatePath('test/' + this.options.testFramework + '_' + actionType + '.jst'),
                testPath,
                {
                  action: action, 
                  context: actionConfig.context
                }
              );
            } catch(e) {
              helpers.lament(this, 'There was an error creating unit tests. This may mean that there is missing metadata for one or more of the actions you chose.');
              if (this.options.internal) {
                helpers.lament(this, 'Examine the mozuxd-metadata package to make sure there is complete metadata for the context object for this action: ' + action.name + '. The original error is: ');
              } else {
                helpers.lament(this, 'Please contact Mozu Support to report this issue writing tests for action ' + action.name + ':');
              }
              throw e;
            }
          }

        }.bind(this));

      }.bind(this));
    }
  } 
});
