module.exports = function (grunt) {
  require('load-grunt-tasks')(grunt);
  require('time-grunt')(grunt);
  var watchAdapter = require('grunt-mozu-appdev-sync/watch-adapter');
  grunt.initConfig({
    pkg: require('./package.json'),
    mozuconfig: require('./mozu.config.json'),
    jshint: { 
      normal: ['./src/**/*.js'],
      continuous: {
        options: {
          force: true
        },
        src: '<%= jshint.normal %>'
      }
    },
    browserify: {
      all: { 
        dest: './assets/dist/app.js',
        src: ['./src/index.js'],
        options: {
          browserifyOptions: {
            standalone: 'index',
            commondir: false,
            builtins: [
              'stream',
              'util',
              'path',
              'url',
              'string_decoder',
              'events',
              'net',
              'punycode',
              'querystring',
              'dgram',
              'dns',
              'assert',
              'tls'
            ],
            insertGlobals: false,
            detectGlobals: false
          }
        }
      },
      watch: {
        src: '<%= browserify.all.src %>',
        dest: '<%= browserify.all.dest %>',
        options: {
          browserifyOptions: '<%= browserify.all.options.browserifyOptions %>',
          watch: true,
          keepAlive: false
        }
      }
    },
    mozusync: {
      options: {
        applicationKey: '<%= mozuconfig.workingApplicationKey %>',
        context: '<%= mozuconfig %>'
      },
      upload: {
        options: {
          action: 'upload',
          noclobber: true
        },
        src: ['./assets/**/*'], 
        filter: 'isFile'
      },
      del: {
        options: {
          action: 'delete'
        },
        src: '<%= mozusync.upload.src %>',
        filter: 'isFile',
        // grunt's "files" object doesn't work for deletes,
        // since it automatically filters patterns that don't
        // match existing files. but for the task to work, we
        // need to match on deleted files! so use the "remove"
        // array in exactly the same way, as a list of files.
        remove: []
      },
      wipe: {
        options: {
          action: 'deleteAll'
        },
        src: '<%= mozusync.upload.src %>'
      }
    },
    watch: {
      options: {
        spawn: false
      },
      src: {
        files: '<%= jshint.normal %>',
        tasks: ['jshint:continuous']
      },
      sync: {
        files: ['assets/', 'assets/**/*'],
        tasks: ['mozusync:upload','mozusync:del']
      }
    }
  });


  grunt.loadNpmTasks('grunt-mozu-appdev-sync');
  grunt.loadNpmTasks('grunt-debug-task');

  watchAdapter(grunt, {
    src: 'mozusync.upload.src',
    action: 'upload'
  });

  watchAdapter(grunt, {
    src: 'mozusync.del.remove',
    action: 'delete'
  });

  grunt.registerTask('default', [
    'jshint:normal',
    'browserify:all',
    'mozusync:upload'
  ]);
  grunt.registerTask('reset', ['mozusync:wipe','mozusync:upload']);
  grunt.registerTask('continuous', ['browserify:watch', 'watch']);
  grunt.registerTask('cont', ['continuous']);
  grunt.registerTask('c', ['continuous']);
  grunt.registerTask('w', ['continuous']);
};