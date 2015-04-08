var merge = require('lodash.merge');
var chalk = require('chalk');
module.exports = {
  addAsPrivateProps: function(target, source) {
    Object.keys(source).forEach(function(key) {
      target['_' + key] = source[key];
    });
  },
  trimString: function(str) {
    return str.trim();
  },
  trimAll: function(obj) {
    return Object.keys(obj).reduce(function(result, k) {
      result[k] = (typeof obj[k] === "string") ? obj[k].trim() : obj[k];
      return result;
    }, {});
  },
  merge: merge,
  remark: function(ctx, str) {
    ctx.log(chalk.green('>> ') + str + '\n');
  },
  lament: function(ctx, str) {
    ctx.log(chalk.bold.red(str + '\n'));
  }
}