'use strict';

var path = require('path');
var assert = require('assert');
var yassert = require('yeoman-assert');
var helpers = require('yeoman-test');
var os = require('os');

describe('mozu-actions generator', function () {
  before(function (done) {
    helpers.run(path.join(__dirname, '../generators/app'))
      .withOptions({
        'skip-install': true,
        'skip-app': true
      })
      .withPrompts({
        someOption: true
      })
      .on('error', function(e) { assert.fail(e) })
      .on('end', done);
  });

  it('creates files', function () {
    yassert.file([
      'package.json',
      '.editorconfig',
      '.jshintrc'
    ]);
  });
});
