var fs = require('fs');
var path = require('path');
var needle = require('needle');
var LATEST_DEFS_URL = process.env.ACTION_DEFS_URL || "http://aus02niserv001.dev.volusion.com/Mozu.InstalledApplications.WebApi/platform/extensions/actionsManifest";

needle.get(LATEST_DEFS_URL, { parse_response: false }, function(error, response) {
  if (error) throw new Error("Retrieval of definitions at " + LATEST_DEFS_URL + " failed: " + error);

  if (response.statusCode !== 200) {
    throw new Error("Retrieval of definitions at " + LATEST_DEFS_URL + " failed: " + response.body);
  }

  var actions;
  try {
    actions = JSON.parse(response.body);
  } catch(e) {
    throw new Error("Parsing of definitions response as JSON failed with: " + e + ", body was " + response.body);
  }

  var domains = actions.reduce(function(result, action) {
    return (action.domain && result.indexOf(action.domain) === -1) ? result.concat(action.domain) : result;
  }, []);

  var actionDefsFilename = path.resolve(__dirname, '../generators/action/action-definitions.json');

  var actionDefsFileContents = JSON.stringify({
    domains: domains,
    actions: actions
  }, null, 2);

  fs.writeFile(actionDefsFilename, actionDefsFileContents, 'utf-8', function(e) {
    if (e) throw new Error("Writing action-definitions.json failed: " + e);
    console.log("Writing action-definitions.json succeeded!");
  })

});