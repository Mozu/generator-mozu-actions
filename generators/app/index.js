'use strict';
var chalk = require('chalk');

var mozuAppGenerator = require('generator-mozu-app');
var helpers = mozuAppGenerator.helpers.merge(mozuAppGenerator.helpers, require('../../utils/helpers'));

var supportedTestFrameworks = require('../../utils/supported-test-frameworks');

module.exports = mozuAppGenerator.extend({



  initializing: function() {

    var parent = mozuAppGenerator.prototype.initializing;

    require('update-notifier')({ pkg: require('../../package.json'), updateCheckInterval: 1}).notify({ defer: false });

    parent.acquireGitStatus.call(this);
    parent.displayMozuBanner.call(this, 'Follow the prompts to scaffold a Mozu Application that contains Actions. You\'ll get a directory structure, action file skeletons, and a test framework!');

  },

  prompting: helpers.merge({}, mozuAppGenerator.prototype.prompting, {
    zang: function() {
      var done = this.async();

      var prompts = [{
        type: 'list',
        name: 'testFramework',
        message: 'Choose a test framework:',
        choices: [{
          name: 'Mocha',
          value: 'mocha'
        }, {
          name: 'None/Manual',
          value: 'manual'
        }],
        default: this.config.get('testFramework')
      }, {
        type: 'confirm',
        name: 'enableOnInstall',
        message: 'Enable actions on install? ' + chalk.yellow('(This will add a custom function to the embedded.platform.applications.install action.)')
      }];

      helpers.promptAndSaveResponse(this, prompts, function() {

        if (this._testFramework === 'manual') {
          this.log('\n' + chalk.bold.red('Unit tests are strongly recommended.') + ' If you prefer a framework this generator does not support, or framework-free tests, you can still use the ' + chalk.bold('mozu-action-simulator') + ' module to simulate a server-side environment for your action implementations.\n');
        }

        var preconfiguredActions = [];

        if (this._enableOnInstall) preconfiguredActions.push({
          actionId: 'embedded.platform.applications.install',
          functionIds: ['embedded.platform.applications.install']
        });

        process.stdout.write(' '); // hack to kick off the console for the subprocess
        this.composeWith('mozu-actions:action', {
          options: helpers.createActionOptions(this, preconfiguredActions)
        });
        done();
      }.bind(this));
    }
  }),

  configuring: helpers.merge({}, mozuAppGenerator.prototype.configuring, {
    rc: function() {
      this.config.set('testFramework', this._testFramework);
    }
  }),

  writing: helpers.merge({}, mozuAppGenerator.prototype.writing, {

    dotfiles: function() {
      ['editorconfig', 'jshintrc', 'gitignore'].forEach(function(filename) {
        this.fs.copy(
          this.templatePath(filename),
          this.destinationPath('.' + filename)
        );
      }, this);
    },

    packagejson: function() {
      this.fs.writeJSON(
        this.destinationPath('package.json'), helpers.merge(
          this._package,
          this.fs.readJSON('package.json'),
          {
            scripts: {
              test: 'grunt test'
            }
          }
        )); 
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

      var self = this;

      var taskConfig = this.fs.readJSON(this.templatePath('gruntfile-config.json'));

      var existingLines = this.fs.read(this.destinationPath('Gruntfile.js'), { defaults: '' })
        .split('\n')
        .map(function(l) {
          return l.trim();
      });

      [
        "require('load-grunt-tasks')(grunt);",
        "require('time-grunt')(grunt);",
        "grunt.loadTasks('./tasks');"
      ].forEach(function(line) {
        if (existingLines.indexOf(line) === -1) {
          self.gruntfile.prependJavaScript(line);
        }
      });

      if (existingLines.every(function(line) {
        return line.indexOf('mozuconfig') == -1 && line.indexOf("require('./mozu.config.json')") == -1;
      })) {
        this.gruntfile.insertConfig('mozuconfig', "grunt.file.readJSON('./mozu.config.json')");
      }

      Object.keys(taskConfig.configs).forEach(function(name) {
        self.gruntfile.insertConfig(name, JSON.stringify(taskConfig.configs[name], null, 2));
      });

      Object.keys(taskConfig.tasks).forEach(function(name) {
        self.gruntfile.registerTask(name, taskConfig.tasks[name]);
      });

      this.fs.copy(
        this.templatePath('manifest.js'),
        this.destinationPath('tasks/manifest.js'));
    },

    enableOnInstall: function() {
      if (this._enableOnInstall) {
        this.fs.copy(
          this.templatePath('enableactions.js'),
          this.destinationPath('assets/src/domains/platform.applications/embedded.platform.applications.install.js'));
      }
    },

    tests: function() {
      this.log(this._testFramework)
      if (this._testFramework !== 'manual') {
        var requirements = supportedTestFrameworks[this._testFramework];
        if (!requirements) {
          throw new Error('Unsupported test framework: ' + this.options.testFramework);
        }
        this.gruntfile.insertConfig(requirements.taskName, JSON.stringify(requirements.taskConfig));
        this.gruntfile.registerTask('test', requirements.taskName);
        this.gruntfile.registerTask('build', 'test'); // should append
        if (!this.options['skip-install']) {
          this.npmInstall(requirements.install, { saveDev: true });
        }
      }
    } 

  }),

  install: helpers.merge({}, mozuAppGenerator.prototype.install, {

    deps: function() {
      if (!this.options['skip-install']) {
        this.npmInstall([
          'grunt',
          'grunt-browserify',
          'grunt-contrib-jshint',
          'grunt-contrib-watch',
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

  })

});
