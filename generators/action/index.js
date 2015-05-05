'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var inquirer = require('inquirer');
var XDMetadata = require('mozuxd-metadata');
var actionDefs = XDMetadata.actionDefinitions;

var helpers = require('../../utils/helpers');

var supportedTestFrameworks = require('../../utils/supported-test-frameworks');

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
      type: String
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

  },

  initializing: function() {
    this.config.save();
    this._actionsMap = actionDefs.actions.reduce(function(memo, action) {
      action.domain = actionDefs.domains.reduce(function(match, domain) {
        if (action.action.substring( action.action.indexOf('.') + 1 ).indexOf(domain) === 0) {
          return domain;
        }
        return match;
      });
      memo[action.action] = action;
      return memo;
    }, {});
    require('update-notifier')({ pkg: require('../../package.json') }).notify();
  },

  prompting: function() {

    function createActionName(action) {
      return {
        name: action,
        value: action
      };
    }

    var done = this.async();

    var prompts;

    var actionNameArgs = this.actionNames;

    if (actionNameArgs) {

      this._actionNames = [];
      this._domains = [];

      actionNameArgs.forEach(function(name) {
        var domain = actionDefs.domains.reduce(function(match, domain) {
          return name.substring(name.indexof('.')+1).indexOf(domain) === 0 ? domain : match;
        }, null);
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
        default: this.config.get('domains')
      }, {
        type: 'checkbox',
        name: 'actionNames',
        message: 'Choose one or more actions to scaffold.',
        choices: function(props) {
          return props.domains.reduce(function(choices, domain) {
            return choices.concat([new inquirer.Separator('- Domain ' + chalk.bold(domain))].concat(actionDefs.actions.filter(function(action) {
              return action.action.substring( action.action.indexOf('.') + 1 ).indexOf(domain) === 0;
            }).map(function(action) {
              return createActionName(action.action, domain);
            })));
          }, []);
        },
        default: this.config.get('actionNames')
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

    this.fs.copyTpl(
      this.templatePath('_entry_index.jst'),
      this.destinationPath('assets/src/index.js'),
      {
        actions: this._actions
      }
    );

    this._domains.forEach(function(domain) {
      var thisDomainsActions = self._actions.filter(function(action) {
        return action.domain === domain;
      });
      thisDomainsActions.forEach(function(action) {
        var implPath = self.destinationPath('assets/src/domains/' + domain + '/' + action.name + '.js');
        if (self.options.overwriteAll || !self.fs.exists(implPath)) {
          self.fs.copyTpl(
            self.templatePath('_action_implementation.jst'),
            implPath, {
              action: action,
              context: JSON.stringify(self._actionsMap[action.name].context, null, 2)
            }
          );
        }
      });
    });

    if (this.options.testFramework) {

      requirements = supportedTestFrameworks[this.options.testFramework];

      if (!this.options.name) {
        throw new Error('Missing project name.');
      }
      if (!this.options.description) {
        throw new Error('Missing project description.');
      }
      if (!requirements) {
        throw new Error('Unsupported test framework: ' + this.options.testFramework);
      }

      helpers.remark(this, 'Installing ' + this.options.testFramework);
      this._actions.forEach(function(action) {

        var testPath = this.destinationPath('assets/test/' + action.name + '.t.js');

        if (this.options.overwriteAll || !this.fs.exists(testPath)) {

          try {
            this.fs.copyTpl(
              this.templatePath('test/' + this.options.testFramework + '.jst'),
              testPath,
              {
                name: this.options.name,
                description: this.options.description,
                action: action, 
                actionConfig: this._actionsMap[action.name]
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