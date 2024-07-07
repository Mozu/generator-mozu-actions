const supportedTestFrameworks = {
  mocha: {
    name: 'Mocha',
    install: ['mocha', 'grunt-mocha-test'],
    taskName: 'mochaTest',
    taskConfig: {
      all: {
        clearRequireCache: true,
        src: ['assets/test/**/*.js'],
      },
    },
  },
  // Uncomment and adjust the following section to add support for Nodeunit
  // nodeunit: {
  //   name: 'Nodeunit',
  //   install: ['grunt-contrib-nodeunit'],
  //   taskName: 'nodeunit',
  //   taskConfig: {
  //     all: ['assets/test/**/*.js'],
  //   },
  // },
};

export default supportedTestFrameworks;