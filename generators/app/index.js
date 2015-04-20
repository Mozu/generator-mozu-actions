'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var mosay = require('mosay');
var semver = require('semver');
var XDMetadata = require('mozuxd-metadata');
var quickGitHits = require('quick-git-hits');

var helpers = require('../../utils/helpers');

var supportedTestFrameworks = require('../../utils/supported-test-frameworks');

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

    this.option('skip-prompts', {
      type: 'Boolean',
      desc: 'Skip prompts. Only use this option if you are re-running the generator!',
      defaults: false
    });

    this.option('skip-install', {
      type: Boolean,
      desc: 'Skip install step. You will have to run `npm install` manually.',
      defaults: false
    });

    this.option('quick', {
      type: 'Boolean',
      desc: 'Skip prompts step and install step. Reruns copy methods and that\'s it.',
      defaults: false
    });

  },

  initializing: function() {
      var done = this.async();
      this.config.save();
      try {
        this._package = this.fs.readJSON(this.destinationPath('package.json'), {});
      } catch(e) {
        this._package = {};
      }
      quickGitHits.detectDirectory(this.destinationPath(), function(err, result) {
        if (err) {
          throw err;
        }
        helpers.addAsPrivateProps(this, result);
        done();
      }.bind(this));
      if (this.options.quick) {
        this.options['skip-install'] = this.options['skip-prompts'] = true;
      }

      require('update-notifier')({ pkg: require('../../package.json') }).notify();

  },

  prompting: function() {
    var done = this.async();

    var message;
    if (this.options['skip-prompts']) {
      if (!this.config.get('domains')) {
        message = 'You cannot skip prompts if you have never run this generator in the current directory! Run again without the --skip-prompts or --quick options.';
        this.log(mosay(message));
        throw new Error(message);
      }
      message = 'Skipping prompts step because --skip-prompts was specified. Reinstalling generator...';
    } else {
      message = 'Follow the prompts to scaffold a Mozu Extension package. You\'ll get a directory structure, action file skeletons, and a test framework!';
    }

    this.log(mosay(message));

    var prompts = [{
      type: 'input',
      name: 'name',
      message: 'Name your extension:',
      default: this._package.name || this.appname,
      filter: helpers.trimString,
      validate: function(name) {
        return !!name.match(/^[A-Za-z0-9\-_\.]+$/) || 'That may not be a legal npm package name.';
      }
    }, {
      type: 'input',
      name: 'description',
      message: 'Short description:',
      default: this._package.description || 'A Mozu Extension.'
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
      type: 'list',
      name: 'testFramework',
      message: 'Choose test framework',
      choices: [{
        name: 'Nodeunit',
        value: 'nodeunit'
      }, {
        name: 'Mocha',
        value: 'mocha'
      }, {
        name: 'None/Manual',
        value: false
      }],
      default: this.config.get('testFramework')
    }];

    if (this.options['skip-prompts']) {
      prompts.forEach(function(prompt) {
        this['_' + prompt.name] = (typeof prompt.default === 'function') ? prompt.default() : prompt.default;
      }.bind(this));
      done();
    } else {

      this.prompt(prompts, function(props) {

        Object.keys(props).forEach(function(key) {
          this['_' + key] = props[key];
        }, this);


        if (!this._testFramework) {
          this.log('\n' + chalk.bold.red('Unit tests are strongly recommended.') + ' If you prefer a framework this generator does not support, or framework-free tests, you can still use the ' + chalk.bold('mozuxd-simulator') + ' module to simulate a server-side environment for your action implementations.\n');
        }

        this.composeWith('mozu-extension:action', {
          options: {
            name: this._name,
            description: this._description,
            internal: this.options.internal,
            testFramework: this._testFramework,
            overwriteAll: true
          }
        });
        done();

      }.bind(this));
    }
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
    mozuconfig: function() {
      if (!this.options['skip-prompts']) {
        this.fs.writeJSON(
          this.destinationPath('mozu.config.json'),
          {
            appKey: this._developerAppKey,
            sharedSecret: this._developerSharedSecret,
            baseUrl: 'https://' + (this._homePod || 'home.mozu.com'),
            developerAccountId: this._developerAccountId,
            developerAccount: {
              emailAddress: this._developerAccountLogin
            },
            workingApplicationKey: this._applicationKey
          }
        );
        this.config.set('homePod', this._homePod || 'home.mozu.com');
        this.config.set('applicationKey', this._applicationKey);
        this.config.set('testFramework', this._testFramework);
      }
    }
  },

  writing: {

    files: function() {

      this.fs.copy(
        this.templatePath('Gruntfile.js'),
        this.destinationPath('Gruntfile.js')
      );

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
          'mozuxd-simulator',
          'time-grunt'
        ], {
          saveDev: true
        });
      }
    },

    repo: function() {
      var done = this.async();

      if (this._createGit) {
        quickGitHits.createRepoInDirectory(this.destinationPath(), { repositoryUrl: this._repositoryUrl }, function(err) {
          if (err) {
            throw err;
          }
          helpers.remark(this, 'Created git repository');
          if (this._repositoryUrl) {
            helpers.remark(this, 'Added remote ' + this._repositoryUrl + ' to git repository');
          }
          done();
        }.bind(this));
      } else {
        done();
      }
    }
  }


});