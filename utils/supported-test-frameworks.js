module.exports = {
  'mocha': {
    name: 'Mocha',
    install: ['mocha','grunt-mocha-test'],
    taskName: 'mochaTest',
    taskConfig: {
      all: {
        clearRequireCache: true,
        src: ['assets/test/**/*.js']
      }
    }
  // },
  // 'nodeunit': {
  //   name: 'Nodeunit',
  //   install: ['grunt-contrib-nodeunit'],
  //   taskName: 'nodeunit',
  //   taskConfig: {
  //     all: ['assets/test/**/*.js']
  //   }
  }
};
