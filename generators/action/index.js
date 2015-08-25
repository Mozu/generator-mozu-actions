'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var inquirer = require('inquirer');
var actionDefs = require('./action-definitions.json');
var helpers = require('generator-mozu-app').helpers;
helpers = helpers.merge(helpers, require('../../utils/helpers'));

var supportedTestFrameworks = require('../../utils/supported-test-frameworks');

function getActionType(actionName) {
  return actionName.split('.')[0];
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

  },

  initializing: function() {
    this.config.save();
    this._availableActions = this.options.internal ? 
      actionDefs.actions : 
      actionDefs.actions.filter(function(action) {
        return !action.beta;
      });
    this._actionsMap = this._availableActions.reduce(function(memo, action) {
      memo[action.action] = action;
      return memo;
    }, {});
  },

  prompting: function() {

    function createActionName(action) {
      return {
        name: action,
        value: action
      };
    }

    var self = this;

    var done = this.async();

    var prompts;

    var actionNameArgs = this.actionNames;

    if (actionNameArgs) {

      this._actionNames = [];
      this._domains = [];

      actionNameArgs.forEach(function(name) {
        var domain = helpers.getDomainFromActionName(name);
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
        choices: actionDefs.domains,
        validate: function(chosen) {
          return chosen.length > 0 || 'Please choose at least one domain to scaffold.';
        },
        default: this.options.domains || this.config.get('domains')
      }, {
        type: 'checkbox',
        name: 'actionNames',
        message: 'Choose one or more actions to scaffold.',
        choices: function(props) {
          return props.domains.reduce(function(choices, domain) {
            return choices.concat([new inquirer.Separator('- Domain ' + chalk.bold(domain))].concat(self._availableActions.filter(function(action) {
              return action.action.substring( action.action.indexOf('.') + 1 ).indexOf(domain) === 0;
            }).map(function(action) {
              return createActionName(action.action, domain);
            })));
          }, []);
        },
        default: this.options.actionNames || this.config.get('actionNames')
      }];

      helpers.promptAndSaveResponse(this, prompts, done);

    }

  },

  configuring: function() {
    this._actions = this._actionNames.map(function(name) {
      return {
        name: name,
        domain: this._actionsMap[name].domain
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
        var implPath = self.destinationPath('assets/src/domains/' + domain + '/' + action.name + '.js');
        if ((self.options.overwriteAll || !self.fs.exists(implPath)) && (doNotWrite.indexOf(action.name) === -1)) {
          self.fs.copyTpl(
            self.templatePath('_action_implementation.jst'),
            implPath, {
              action: action,
              actionType: getActionType(action.name),
              context: JSON.stringify(self._actionsMap[action.name].context, null, 2)
            }
          );
        }
      });
    });

    if (this.options.testFramework !== "manual") {

      requirements = supportedTestFrameworks[this.options.testFramework];

      if (!requirements) {
        throw new Error('Unsupported test framework: ' + this.options.testFramework);
      }

      helpers.remark(this, 'Installing ' + this.options.testFramework);
      this._actions.forEach(function(action) {

        var testPath = this.destinationPath('assets/test/' + action.name + '.t.js');
        var actionType = getActionType(action.name);
        var actionConfig = this._actionsMap[action.name];

        if (this.options.overwriteAll || !this.fs.exists(testPath)) {

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
    }
  } 
});