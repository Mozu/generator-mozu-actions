'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var mosay = require('mosay');
var inquirer = require('inquirer');
var semver = require('semver');
var XDMetadata = require('mozuxd-metadata');
var buffspawn = require('buffered-spawn');
var quickGitHits = require('quick-git-hits');

var helpers = require('../utils/helpers');


module.exports = yeoman.generators.Base.extend({


   // note: arguments and options should be defined in the constructor.
  constructor: function () {
    yeoman.generators.Base.apply(this, arguments);

    // This option adds support for non-production environments
    this.option('internal', {
      type: 'Boolean',
      defaults: false,
      hide: true
    });
  },

    initializing: function() {
      var done = this.async();
      this.config.save();
      this._package = this.fs.readJSON('./package.json', {});
      quickGitHits.detectDirectory(this.destinationPath(), function(err, result) {
        if (err) throw err;
        helpers.addAsPrivateProps(this, result);
        done();
      }.bind(this));
  },

  prompting: function() {
    var done = this.async();

    this.log(mosay(
      'Follow the prompts to scaffold a Mozu Extension package. You\'ll get a directory structure, action file skeletons, and a test framework!'
    ));

    var prompts = [{
      type: 'input',
      name: 'name',
      message: 'Name your extension:',
      default: this._package.name || this.appname,
      filter: helpers.trimString,
      validate: function(name) {
        return !!name.match(/^[A-Za-z0-9\-_\.]+$/) || "That may not be a legal npm package name.";
      }
    }, {
      type: 'input',
      name: 'description',
      message: 'Short description:',
      default: this._package.description || "A Mozu Extension."
    }, {
      type: 'input',
      name: 'version',
      message: 'Initial version:',
      default: this._package.version || "0.1.0",
      filter: helpers.trimString,
      validate: function(ver) {
        return !!semver.valid(ver) || "Please supply a valid semantic version of the form major.minor.patch-annotation.\n\nExamples: 0.1.0, 3.21.103, 3.9.22-alt";
      }
    }, {
      type: 'list',
      name: 'homePod',
      message: 'Select Mozu environment:',
      default: this.config.get('homePod') || 'home.mozu.com',
      choices: Object.keys(XDMetadata.environments).map(function(envName) {
        return {
          name: envName,
          value: XDMetadata.environments[envName].homeDomain
        };
      }),
      when: function() {
        return this.options.internal;
      }.bind(this)
    }, {
      type: 'input',
      name: 'applicationKey',
      message: 'Developer Center Application Key for this extension:',
      filter: helpers.trimString,
      default: this.config.get('applicationKey')
    }, {
      type: 'input',
      name: 'developerAccountId',
      message: 'Developer Account ID:',
      filter: helpers.trimString,
      store: true
    }, {
      type: 'input',
      name: 'developerAccountLogin',
      message: 'Developer Account login email:',
      filter: helpers.trimString,
      store: true
    }, {
      type: 'password',
      name: 'developerAccountPassword',
      message: 'Developer Account login password:',
      filter: helpers.trimString
    }, { 
      type: 'input',
      name: 'developerAppKey',
      message: 'Application Key for your sync app:',
      filter: helpers.trimString,
      store: true
    }, { 
      type: 'password',
      name: 'developerSharedSecret',
      message: 'Shared Secret for your sync app:',
      filter: helpers.trimString,
      store: true
    }, {
      type: 'confirm',
      name: 'createGit',
      message: 'Create Git repository?',
      filter: helpers.trimString,
      when: (function() {
        return this._gitInstalled && !this._inGitRepo;
      }.bind(this))
    }, {
      type: 'input',
      name: 'repositoryUrl',
      message: 'Repository URL:',
      default: this._detectedRepositoryUrl,
      filter: helpers.trimString,
      when: function(props) {
        return props.createGit;
      }
    }, {
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

    }
    // , 
    // {
    //   type: 'list',
    //   name: 'testFramework',
    //   message: 'Choose test framework',
    //   choices: [{
    //     name: 'Nodeunit',
    //     value: 'nodeunit'
    //   }, {
    //     name: 'Mocha',
    //     value: 'mocha'
    //   }, {
    //     name: 'None/Manual',
    //     value: false
    //   }]
    // }
    ];

    this.prompt(prompts, function(props) {

      Object.keys(props).forEach(function(key) {
        this['_' + key] = props[key];
      }, this);

      // if (!this._testFramework || !this._testFramework.value) {
      //   this.log("\n" + chalk.bold.red('Unit tests are strongly recommended.') + ' If you prefer a framework this generator does not support, or framework-free tests, you can still use the ' + chalk.bold('mozuxd-simulator') + ' module to simulate a server-side environment for your action implementations.\n');
      // }

      done();

    }.bind(this));
  },

  configuring: {
    dotfiles: function() {
      ['editorconfig', 'jshintrc', 'gitignore'].forEach(function(filename) {
        this.fs.copy(
          this.templatePath(filename),
          this.destinationPath('.' + filename)
        );
      }, this);
    },
    app: function() {
      this.fs.copyTpl(
        this.templatePath('_package.json.tpt'),
        this.destinationPath('package.json'), {
          name: this._name,
          version: this._version,
          description: this._description,
          repository: this._repositoryUrl
        }
      );
      this.fs.copyTpl(
        this.templatePath('_README.md.tpt'),
        this.destinationPath('README.md'), {
          name: this._name,
          version: this._version,
          description: this._description,
          actions: this._actions
        }
      )
    },
    mozuconfig: function() {

      this.fs.writeJSON(
        this.destinationPath('mozu.config.json'),
        {
          appKey: this._developerAppKey,
          sharedSecret: this._developerSharedSecret,
          baseUrl: 'https://' + (this._homePod || 'home.mozu.com'),
          developerAccountId: this._developerAccountId,
          developerAccount: {
            emailAddress: this._developerAccountLogin,
            password: this._developerAccountPassword
          },
          workingApplicationKey: this._applicationKey
        }
      );
      this.config.set('homePod', this._homePod || 'home.mozu.com');
      this.config.set('applicationKey', this._applicationKey);
    }
  },

  writing: {

    files: function() {

      var self = this;
      this.fs.copyTpl(
        this.templatePath('_entry_index.jst'),
        this.destinationPath('src/index.js'),
        {
          actions: this._actions
        }
      );

      this.fs.copy(
        this.templatePath('Gruntfile.js'),
        this.destinationPath('Gruntfile.js')
      );

      this.fs.writeJSON(
        this.destinationPath('assets/dist/functions.json'), 
        this._actions.reduce(function(memo, action){
          memo.exports.push({
            id: action.name,
            virtualPath: './dist/app.js' ,
            actionId: action.name
          });
          return memo;
        }, {exports: []}));

      this._domains.forEach(function(domain) {
        var thisDomainsActions = self._actions.filter(function(action) {
          return action.domain === domain;
        });
        thisDomainsActions.forEach(function(action) {
          self.fs.copyTpl(
            self.templatePath('_action_implementation.jst'),
            self.destinationPath('src/domains/' + domain + '/' + action.name + '.js'), {
              action: action,
              context: JSON.stringify(XDMetadata.domains[action.domain].actions[action.name.replace(RegExp('^' + action.domain + '\.'), '')].context, null, 2)
            }
          )
        });
      });
    },

    // gruntfile: function() {

    //   this.gruntfile.insertConfig('pkg', 'require("./package.json")');

    //   this.gruntfile.insertConfig('jshint', JSON.stringify({
    //     all: [
    //       'src/**/*.js'
    //     ]
    //   }));

    //   var browserifyTaskConfig = {
    //     files: {
    //       './assets/dist/app.js': ['./src/index.js']
    //     },
    //     options: {
    //       browserifyOptions: {
    //         standalone: 'index',
    //         commondir: false,
    //         builtins: ['stream', 'util', 'path', 'url', 'string_decoder', 'events', 'net', 'punycode', 'querystring', 'dgram', 'dns', 'assert', 'tls'],
    //         insertGlobals: false,
    //         detectGlobals: false
    //       }
    //     }
    //   };

    //   var watchifyTaskConfig = JSON.parse(JSON.stringify(browserifyTaskConfig));
    //   watchifyTaskConfig.options.watch = true;
    //   watchifyTaskConfig.options.keepAlive = true;

    //   this.gruntfile.insertConfig('browserify', JSON.stringify({
    //     all: browserifyTaskConfig,
    //     watch: watchifyTaskConfig
    //   }));

    //   this.gruntfile.registerTask('default', ['jshint','browserify:all']);
    //   this.gruntfile.registerTask('continuous', ['browserify:watch']);
    //   this.gruntfile.registerTask('cont', ['continuous']);
    //   this.gruntfile.registerTask('c', ['continuous']);
    //   this.gruntfile.registerTask('w', ['continuous']);
    // },

    tests: function() {
      // if (this._testFramework) {
      //   this.log('Installing ' + this._testFramework.name);
      //   this._actions.forEach(function(action) {
      //       this.fs.copyTpl(
      //       this.templatePath('tests/' + this._testFramework.value + '.jst'),
      //       this.destinationPath('test/' + action.name + '.t.js'),
      //       XDMetadata.domains[action.domain].actions[action.name]
      //     );
      //   });
      //   this.npmInstall([this._testFramework.value], { saveDev: true });
      // }
    }

  },

  install: {

    deps: function() {
      if (!this.options['skip-install']) {
        this.npmInstall([
          'grunt-browserify',
          'grunt-contrib-jshint',
          'grunt-contrib-watch',
          'grunt-debug-task',
          //'grunt-mozu-appdev-sync',
          'load-grunt-tasks',
          'time-grunt'
        ], {
          saveDev: true
        });
        this.npmInstall();
      }
    },

    repo: function() {
      var done = this.async();

      if (this._createGit) {
        quickGitHits.createRepoInDirectory(this.destinationPath(), { repositoryUrl: this._repositoryUrl }, function(err) {
          if (err) throw err;
          this.log('Created git repository');
          if (this._repositoryUrl) {
            this.log('Added remote ' + this._repositoryUrl + ' to git repository');
          }
          done();
        }.bind(this));
      } else {
        done();
      }
    }
  }
});