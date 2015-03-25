/*
 * grunt-mozu-appdev-sync
 * 
 *
 * Copyright (c) 2015 James Zetlen, Volusion Inc.
 * Licensed under the MIT license.
 */

'use strict';

var humanize = require('humanize');

var appDevUtils = require('../mozu-appdev-utils');

var customErrors = {
  INVALID_CREDENTIALS: 'Invalid credentials. Please check your mozu.config.json file to see that you are using the right developer account, application key, shared secret, and environment.'
};
function getCustomMessage(err) {
  var errorCode = err.errorCode || err.originalError && err.originalError.errorCode;
  if (errorCode) {
    return customErrors[errorCode];
  }
  return err.toString();
}

module.exports = function (grunt) {

  function line(len) {
    return grunt.util.linefeed + grunt.util.repeat(len, '-');
  }

  var actions = {
    upload: {
      run: function(util, options, context, progress) {
        return util.uploadFiles(context.filesSrc, options, progress);
      },
      presentTense: 'Uploading',
      pastTense: 'Uploaded',
      columnHeaders: grunt.log.table([50,10,20], ['file','size','type']) + line(50+10+20),
      logline: function (r) {
        return grunt.log.table([50,10,20], [r.path, humanize.filesize(r.sizeInBytes), r.type]);
      },
      needsToRun: function(options, context) {
        return context.filesSrc.length > 0;
      }
    },
    "delete": {
      run: function(util, options, context, progress) {
        return util.deleteFiles(context.data.remove, options, progress);
      },
      presentTense: 'Deleting',
      pastTense: 'Deleted',
      columnHeaders: grunt.log.table([40], ['file']) + line(40),
      logline: function (r) {
        return grunt.log.table([40], ["deleted " + r.path]);
      },
      needsToRun: function(options, context) {
        return context.data.remove.length > 0;
      }
    },
    "rename": {
      run: function(util, options, context, progress) {

        var filespecs = context.files.map(function(file){
          return {
            oldFullPath: file.src[0],
            newFullPath: file.dest
          };
        });

        return util.renameFiles(filespecs, options, progress)
      },
      presentTense: 'Renaming',
      pastTense: 'Renamed',
      columnHeaders: grunt.log.table([40,40], ['old path','new path']) + line(40+40),
      logline: function(r) {
        return grunt.log.table([40,40], [r.oldPath, r.newPath]);
      },
      needsToRun: function(options, context) {
        return context.filesSrc.length > 0;
      }
    },
    "deleteAll": {
      run: function(util, options, context, progress) {
        return util.deleteAllFiles(options, progress);
      },
      presentTense: 'Deleting all!',
      pastTense: 'Deleted',
      columnHeaders: grunt.log.table([40], ['file']) + line(40),
      logline: function (r) {
        return grunt.log.table([40], ["deleted " + r.path]);
      },
      needsToRun: function() {
        return true;
      }
    }
  };

  function suffering(e) {
    grunt.fail.fatal(e.body || e);
  }

  function tableHead(action) {
    return action.presentTense + " progress:" + grunt.util.linefeed + grunt.util.linefeed + action.columnHeaders;
  }

  grunt.registerMultiTask('mozusync', 'Syncs a local project with the Mozu Developer Center.', function () {

    var done = this.async();

    var total = {
      num: 0,
      size: 0
    };

    var options = this.options({
      action: 'upload'
    });

    var appdev = appDevUtils(options.applicationKey, options.context);

    var action = actions[options.action];

    if (!action) {
      grunt.fail.fatal("Unknown mozusync action " + options.action + ".\nSpecify a valid action in your task config options under the `action` property. \nValid actions are: " + grunt.log.wordlist(Object.keys(actions)));
    }

    if (action.needsToRun(options, this)) {
      grunt.log.subhead(tableHead(action));

      appdev.preauthenticate().then(function() {
        return action.run(appdev, options, this, log).then(joy, suffering);
      }.bind(this)).otherwise(function(err) {
        grunt.fail.fatal(grunt.log.wraptext(67, getCustomMessage(err)));
      });
    } else {
      grunt.log.ok(action.presentTense + ' canceled; no qualifying files were found.');
      done();
    }

    function log(r) {
      if (r.before) {
        grunt.verbose.writeln(action.presentTense + " " + JSON.stringify(r.before));
      } else {
        grunt.log.writeln(action.logline(r.after));
        total.num += 1;
        total.size += r.sizeInBytes;
      }
      return r;
    }

    function backpat() {
      var selfcongratulation = action.pastTense + " " + total.num + " " + grunt.util.pluralize(total.num,'file/files');
      if (total.size) {
        selfcongratulation += " for a total of " + humanize.filesize(total.size);
      }
      grunt.log.write(grunt.util.linefeed).ok(selfcongratulation + " in application \"" + options.applicationKey + "\"")
    }

    function notify() {
      grunt.event.emit('mozusync:' + options.action + ":complete");
    }

    function joy() {
      backpat();
      notify();
      done();
    }

  });

};
