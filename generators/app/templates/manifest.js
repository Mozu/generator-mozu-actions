var path = require('path');
module.exports = function(grunt) {
    grunt.registerMultiTask('manifest', 'Compiles the `functions.json` manifest for the Kibo Api Extension Framework to read which custom functions are extended.', function () {
        // Node.js major pin stamped on every export for the ArcJs runner.
        // Precedence: per-function manifest entry (index[key].nodeVersion) >
        // app-level "nodeVersion" in mozu.config.json > default 24.
        // Set null/0 at any level to leave functions unpinned (runner default).
        var appNodeVersion = grunt.config('mozuconfig.nodeVersion');
        var manifest = this.files.reduce(function (functionsManifest, conf) {
            var index = require('../' + conf.src[0].replace(/\.js$/,''));
            return functionsManifest.concat(Object.keys(index).map(function (key) {
                var entry = {
                    id: key,
                    virtualPath: './' + path.relative('assets', conf.dest),
                    actionId: index[key].actionName
                };
                var nodeVersion = index[key].nodeVersion !== undefined ? index[key].nodeVersion
                    : appNodeVersion !== undefined ? appNodeVersion
                    : 24;
                if (nodeVersion) {
                    entry.nodeVersion = nodeVersion;
                }
                return entry;
            }));
        }, []);
        grunt.file.write('./assets/functions.json', JSON.stringify({ exports: manifest }, null, 2));
        grunt.log.ok('Wrote ' + manifest.length + ' custom functions to functions.json');
    });
};