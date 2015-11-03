'use strict';

var uniq = require('lodash.uniq');
var savedActionDefinitions = require('../action-definitions.json')

var helpers = module.exports = {
  getDomainFromActionName: function(actionDefs, name) {
    name = name.split('.').slice(1).join('.');
    return actionDefs.domains.reduce(function(match, domain) {
      if (name.indexOf(domain) === 0) {
        return domain;
      }
      return match;
    }); 
  },
  createActionOptions: function(self, preconfiguredFunctions, actionDefs) {
    preconfiguredFunctions = preconfiguredFunctions || [];
    var domains = self.config.get('domains') || [];
    var actionNames = self.config.get('actionNames') || [];
    var allActionNames = uniq(actionNames.concat(
      preconfiguredFunctions.map(function(def) {
        return def.actionId;
      })));
    var preconfiguredDomains = uniq(
      domains.concat(
        preconfiguredFunctions.map(function(def) {
          return helpers.getDomainFromActionName(
            actionDefs || savedActionDefinitions,
            def.actionId
          );
        })
      )
    );
    return {
      'skip-prompts': self.options['skip-prompts'],
      internal: self.options.internal,
      testFramework: self._testFramework,
      overwriteAll: true,
      actionNames: allActionNames,
      preconfigured: preconfiguredFunctions,
      domains: preconfiguredDomains
    }
  }
};
