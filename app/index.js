'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var mosay = require('mosay');
var inquirer = require('inquirer');
var semver = require('semver');
var XDMetadata = require('mozuxd-metadata');

module.exports = yeoman.generators.Base.extend({

  prompting: function () {
    var done = this.async();

    // Have Yeoman greet the user.
    this.log(mosay(
      'Follow the prompts to scaffold a Mozu Extension package. You\'ll get a directory structure, action file skeletons, and a test framework!'
    ));

    var prompts = [
      {
        type: 'input',
        name: 'name',
        message: 'Name your extension:',
        default: this.appname,
        store: true
      },
      {
        type: 'input',
        name: 'version',
        message: 'Initial version:',
        default: '0.1.0',
        validate: function(ver) {
          return semver.valid(ver) || "Please supply a valid semantic version of the form <major>.<minor>.<patch>[-annotation]. Examples: '0.1.0', '3.21.103', '3.9.22-alt'";
        },
        store: true
      }
      {
        type: 'checkbox',
        name: 'domains',
        message: 'Choose domains:',
        choices: Object.keys(XDMetadata.domains),
        validate: function(chosen) {
          return chosen.length > 0 || "Please choose at least one domain to scaffold."
        }
      }, {
        type: 'checkbox',
        name: 'actions',
        message: "Choose one or more actions to scaffold.",
        choices: function(props) {
          return props.domains.reduce(function(choices, domain, index) {
            return choices.concat([new inquirer.Separator('- Domain ' + chalk.bold(domain))].concat(Object.keys(XDMetadata.domains[domain].actions).map(function(actionName) {
                return {
                  name: actionName,
                  value: {
                    domain: domain,
                    name: domain + "." + actionName
                  }
                };
            })));
          }, []);
        }

      }, {
        type: 'list',
        name: 'testFramework',
        message: 'Choose test framework',
        choices: [
          {
            name: 'Nodeunit',
            value: 'nodeunit'
          },
          {
            name: 'Mocha',
            value: 'mocha'
          },
          {
            name: 'tape',
            value: 'tape'
          },
          {
            name: 'None/Manual',
            value: false
          }
        ],
        store: true
      }
    ];

    this.prompt(prompts, function (props) {
      this._name = props.name;
      this._version = props.version;
      this._domains = props.domains;
      this._actions = props.actions;
      this.testFramework = props.testFramework;

      if (!this.testFramework) {
        this.log(chalk.bold.red('Unit tests are strongly recommended.') + ' If you prefer a framework this generator does not support, or framework-free tests, you can still use the ' + chalk.bold('mozuxd-simulator') + ' module to simulate a server-side environment for your action implementations.');
      }

      done();
    }.bind(this));
  },

  writing: {
    app: function () {
      this.fs.copyTpl(
        this.templatePath('_package.json'),
        this.destinationPath('package.json'),
        {
          name: this._name,
          version: this_version
        }
      );
    },

    tests: function () {
      if (this.testFramework) {
        this.log('Installing ' + this.testFramework.name);
        this._actions.forEach(function(action) {
            this.fs.copyTpl(
            this.templatePath('tests/' + this.testFramework.value + '.jst'),
            this.destinationPath('test/' + action.name + '.t.js'),
            XDMetadata.domains[action.domain].actions[action.name]
          );
        });
        this.npmInstall([this.testFramework.value], { saveDev: true });
      }
    },

    projectfiles: function () {
      this.fs.copy(
        this.templatePath('editorconfig'),
        this.destinationPath('.editorconfig')
      );
      this.fs.copy(
        this.templatePath('jshintrc'),
        this.destinationPath('.jshintrc')
      );

      var self = this;
      this._domains.forEach(function(domain) {
        self.fs.copyTpl(
          self.templatePath('_domain_index.jst'),
          self.destinationPath('domains/' + domain + '/index.js'),
          { actions: self._actions.filter(function(action) {
            return action.domain === domain;
            })
          }        
        );
      })
    },
  },

  install: function () {
    if (!this.options['skip-install']) this.npmInstall();
  }
});
