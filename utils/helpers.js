module.exports = {
  addAsPrivateProps: function(target, source) {
    Object.keys(source).forEach(function(key) {
      target['_' + key] = source[key];
    });
  },
  trimString: function(str) {
    return str.trim();
  }
}