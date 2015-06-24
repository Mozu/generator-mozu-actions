'use strict';
var chalk = require('chalk');
var semver = require('semver');

var mozuAppGenerator = require('generator-mozu-app');
var helpers = mozuAppGenerator.helpers.merge(mozuAppGenerator.helpers, require('../../utils/helpers'));

var supportedTestFrameworks = require('../../utils/supported-test-frameworks');

module.exports = mozuAppGenerator.extend({

  initializing: function() {

    require('update-notifier')({ pkg: require('../../package.json'), updateCheckInterval: 1}).notify({ defer: false });

    this.composeWith('mozu-app', {
      options: helpers.merge(this.options, {
        intro: 'Follow the prompts to scaffold a Mozu Application that contains Actions. You\'ll get a directory structure, action file skeletons, and a test framework!'
      })
    }, {
      local: require.resolve('generator-mozu-app')
    });

  },

  prompting: function() {

    var done = this.async();

    var prompts = [{
      type: 'input',
      name: 'name',
      message: 'Name this Mozu Application (no spaces):',
      default: this._package.name || this.appname,
      filter: helpers.trimString,
      validate: function(name) {
        return !!name.match(/^[A-Za-z0-9\-_\.]+$/) || 'That may not be a legal npm package name.';
      }
    }, {
      type: 'input',
      name: 'description',
      message: 'Short description:',
      default: this._package.description || 'A Mozu Application containing Actions.'
    }, {
      type: 'input',
      name: 'version',
      message: 'Initial version:',
      default: this._package.version || '0.1.0',
      filter: helpers.trimString,
      validate: function(ver) {
        return !!semver.valid(ver) || 'Please supply a valid semantic version of the form major.minor.patch-annotation.\n\nExamples: 0.1.0, 3.21.103, 3.9.22-alt';
      }
    }, {
      type: 'input',
      name: 'applicationKey',
      message: 'Developer Center Application Key for this Application:',
      filter: helpers.trimString,
      default: this.config.get('applicationKey')
    }, {
      type: 'list',
      name: 'testFramework',
      message: 'Choose a test framework:',
      choices: [{
        name: 'Mocha',
        value: 'mocha'
      }, {
        name: 'None/Manual',
        value: false
      }],
      default: this.config.get('testFramework')
    }, {
      type: 'confirm',
      name: 'enableOnInstall',
      message: 'Enable actions on install? ' + chalk.yellow('(This will add a custom function to the embedded.platform.applications.install action.)')
    }];

    helpers.promptAndSaveResponse(this, prompts, function() {

      if (!this._testFramework) {
        this.log('\n' + chalk.bold.red('Unit tests are strongly recommended.') + ' If you prefer a framework this generator does not support, or framework-free tests, you can still use the ' + chalk.bold('mozu-action-simulator') + ' module to simulate a server-side environment for your action implementations.\n');
      }

      var preconfiguredActions = [];

      if (this._enableOnInstall) preconfiguredActions.push('embedded.platform.applications.install');

      process.stdout.write(' '); // hack to kick off the console for the subprocess
      this.composeWith('mozu-actions:action', {
        options: helpers.createActionOptions(this, preconfiguredActions)
      });
      done();

    }.bind(this));
  },

  configuring: {
    rc: function() {
      this.config.set('applicationKey', this._applicationKey);
      this.config.set('testFramework', this._testFramework);
    }
  },

  writing: {

    dotfiles: function() {
      ['editorconfig', 'jshintrc', 'gitignore'].forEach(function(filename) {
        this.fs.copy(
          this.templatePath(filename),
          this.destinationPath('.' + filename)
        );
      }, this);
    },

    packagejson: function() {

      var newPkg = {
        name: this._name,
        version: this._version,
        description: this._description
      };

      if (this._repositoryUrl) {
        newPkg.repository = {
          type: 'git',
          url: this._repositoryUrl
        };
      }

      if (this._testFramework) {
        newPkg.scripts = {
          test: 'grunt test'
        };
      }

      this.fs.writeJSON(
        this.destinationPath('package.json'),
        helpers.merge(
          helpers.trimAll(newPkg),
          this._package
        )
      );
    },

    readme: function() {
      this.fs.copyTpl(
        this.templatePath('_README.md.tpt'),
        this.destinationPath('README.md'), {
          name: this._name,
          version: this._version,
          description: this._description,
        }
      );
    },

    gruntfile: function() {

      this.fs.copy(
        this.templatePath('Gruntfile.js'),
        this.destinationPath('Gruntfile.js')
      );

    },

    addWorkingKey: function() {
      var jsonPath = this.destinationPath('mozu.config.json');
      var mozuConfigJson = this.fs.readJSON(jsonPath);
      mozuConfigJson.workingApplicationKey = this._applicationKey;
      this.fs.writeJSON(jsonPath, mozuConfigJson, null, 2);
    },

    enableOnInstall: function() {
      if (this._enableOnInstall) {
        this.fs.copy(
          this.templatePath('enableactions.js'),
          this.destinationPath('/assets/src/domains/platform.applications/embedded.platform.applications.install.js'));
      }
    },

    tests: function() {
      if (this._testFramework) {
        var requirements = supportedTestFrameworks[this._testFramework];
        if (!requirements) {
          throw new Error('Unsupported test framework: ' + this.options.testFramework);
        }
        this.gruntfile.insertConfig(requirements.taskName, JSON.stringify(requirements.taskConfig));
        this.gruntfile.registerTask('test', requirements.taskName);
        if (!this.options['skip-install']) {
          this.npmInstall(requirements.install, { saveDev: true });
        }
      }
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
          'grunt-mozu-appdev-sync',
          'load-grunt-tasks',
          'mozu-action-helpers',
          'mozu-action-simulator',
          'time-grunt'
        ], {
          saveDev: true
        });
      }
    }

  }

});