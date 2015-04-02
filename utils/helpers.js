var merge = require('lodash.merge');
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
  merge: merge
}