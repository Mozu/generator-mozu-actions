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
                files: [{
                        expand: true,
                        cwd: 'assets/src/',
                        src: ['**/*.manifest.js'],
                        dest: 'assets/dist/',
                        ext: '.all.js',
                        extDot: 'first'
                    }],
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
                            'tls',
                            'crypto'
                        ],
                        insertGlobals: false,
                        detectGlobals: false
                    }
                }
            }
        },
        manifest: { all: { files: '<%= browserify.all.files %>' } },
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
    grunt.registerMultiTask('manifest', 'Compiles the `functions.json` manifest for the Mozu Actions Framework to read which custom functions are extended.', function () {
        var manifest = this.files.reduce(function (functionsManifest, conf) {
            var index = require('./' + conf.src[0]);
            return functionsManifest.concat(Object.keys(index).map(function (key) {
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
        always: ['./assets/functions.json']
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