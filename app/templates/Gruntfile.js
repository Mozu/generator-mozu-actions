module.exports = function (grunt) {
    require('load-grunt-tasks')(grunt);
    require('time-grunt')(grunt);
    var watchAdapter = require('grunt-mozu-appdev-sync/watch-adapter');
    grunt.initConfig({
        pkg: require('./package.json'),
        mozuconfig: require('./mozu.config.json'),
        jshint: {
            normal: ['./assets/src/**/*.js'],
            continuous: {
                options: { force: true },
                src: '<%= jshint.normal %>'
            }
        },
        browserify: {
            all: {
                dest: './assets/dist/app.js',
                src: ['./assets/src/index.js'],
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
                options: { action: 'delete' },
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
                options: { action: 'deleteAll' },
                src: '<%= mozusync.upload.src %>'
            }
        },
        watch: {
            options: { spawn: false },
            src: {
                files: '<%= jshint.normal %>',
                tasks: [
                    'jshint:continuous',
                    'browserify:all',
                    'manifest'
                ]
            },
            sync: {
                files: ['assets/**/*'],
                tasks: [
                    'mozusync:upload',
                    'mozusync:del'
                ]
            }
        }
    });
    grunt.loadNpmTasks('grunt-debug-task');

    var path = require('path');
    grunt.registerTask('manifest', 'Compiles the `functions.json` manifest for the Mozu Extensions Framework to read which custom functions are extended.', function() {
        var conf = grunt.config.get('browserify').all;
        var manifest = conf.src.reduce(function(functionsManifest, indexFile) {
            var index = require(indexFile);
            return functionsManifest.concat(Object.keys(index).map(function(key) {
               return {
                id: key,
                virtualPath: './' + path.relative('assets', conf.dest),
                actionId: index[key].actionName
               }; 
            }));
        }, []);
        grunt.file.write('./assets/functions.json', JSON.stringify({ exports: manifest }, null, 2));
        grunt.log.ok('Wrote ' + manifest.length + ' custom functions to functions.json');
    });

    watchAdapter(grunt, {
        src: 'mozusync.upload.src',
        action: 'upload',
        always: ['<%= browserify.all.dest %>','./assets/functions.json']
    });
    watchAdapter(grunt, {
        src: 'mozusync.del.remove',
        action: 'delete'
    });
    grunt.registerTask('test', []);
    grunt.registerTask('default', [
        'jshint:normal',
        'browserify:all',
        'manifest',
        'test',
        'mozusync:upload'
    ]);
    grunt.registerTask('reset', [
        'mozusync:wipe',
        'mozusync:upload'
    ]);
    grunt.registerTask('cont', ['watch']);
    grunt.registerTask('c', ['watch']);
    grunt.registerTask('w', ['watch']);
};