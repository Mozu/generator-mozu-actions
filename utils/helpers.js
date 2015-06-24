'use strict';

var uniq = require('lodash.uniq');
var actionDefs = require('mozu-metadata').actionDefinitions;

var helpers = module.exports = {
  getDomainFromActionName: function(name) {
    name = name.split('.').slice(1).join('.');
    return actionDefs.domains.reduce(function(match, domain) {
      if (name.indexOf(domain) === 0) {
        return domain;
      }
      return match;
    }); 
  },
  createActionOptions: function(self, preconfiguredActions) {
    preconfiguredActions = preconfiguredActions || [];
    var domains = self.config.get('domains') || [];
    var actionNames = self.config.get('actionNames') || [];
    var allActionNames = uniq(actionNames.concat(preconfiguredActions));
    var preconfiguredDomains = uniq(domains.concat(preconfiguredActions.map(helpers.getDomainFromActionName)));
    return {
      name: self._name,
      'skip-prompts': self.options['skip-prompts'],
      description: self._description,
      internal: self.options.internal,
      testFramework: self._testFramework,
      overwriteAll: true,
      actionNames: allActionNames,
      doNotWrite: preconfiguredActions,
      domains: preconfiguredDomains
    }
  }
};