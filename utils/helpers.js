'use strict';

var uniq = require('lodash.uniq');
var savedActionDefinitions = require('../action-definitions.json')

var helpers = module.exports = {
  getDomainFromActionName: function(actionDefs, name) {
    name = name.split('*').slice(1).join('*');
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
    helpers.convertToAsterisks(domains);
    var actionNames = self.config.get('actionNames') || [];
    helpers.convertToAsterisks(actionNames);
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
  },
  replacePeriod: function(value) {
   return value.replace(/\./g, '*');
  },
  convertToAsterisks: function (values) {
    if (Array.isArray(values) && values.length > 0) {
      values.forEach(function(name, i, actionNames) {
        return actionNames[i] = helpers.replacePeriod(name);
      });
      return values;
    }

    if (typeof(values) === 'object') {
      Object.keys(values).forEach(function(key){
        var correctedKey = helpers.replacePeriod(key);
        if(key === correctedKey) {
          return;
        }
        Object.defineProperty(values, correctedKey, Object.getOwnPropertyDescriptor(values, key));
        delete values[key];
        values[correctedKey].forEach(function(value, i) {
          return values[correctedKey][i] = helpers.replacePeriod(value);
        })
      });
      return values;
    }

    return values;
  },
  replaceAsterisk: function(value) {
   return value.replace(/\*/g, '.');
  },
  convertToPeriods: function (values) {
    if (Array.isArray(values) && values.length > 0) {
      values.forEach(function(name, i, actionNames) {
        return actionNames[i] = helpers.replaceAsterisk(name);
      });
      return values;
    }

    if (typeof(values) === 'object') {
      Object.keys(values).forEach(function(key){
        var correctedKey = helpers.replaceAsterisk(key);
        if(key === correctedKey) {
          return;
        }
        Object.defineProperty(values, correctedKey, Object.getOwnPropertyDescriptor(values, key));
        delete values[key];
        values[correctedKey].forEach(function(value, i) {
          return values[correctedKey][i] = helpers.replaceAsterisk(value);
        })
      });
      return values;
    }
    return values;
  }
};
