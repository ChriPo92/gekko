var _ = require('lodash');
var log = require("./log");

// validate that python3 is installed, if not we'll throw an excepion which will
// prevent further loading or out outside this module
// TODO: check that python and all needed dependecies are actully installed
try {
  var pyshell = require("python-shell");
} catch (e) {
  module.exports = null;
  return;
}

var pyError = 'Gekko was unable to configure python indicator:\n\t';

// Wrapper that executes a python indicator
var execute = function(socket, callback, params) {
  // talib callback style since talib-v1.0.3
  var pythonCallback = function(pythonReturn) {
    var err = pythonReturn["err"],
      res = pythonReturn["res"];
    log.debug("pythonCallback " + err + " " + res);
    if(err) return callback(err);
    callback(null, res);
  };


  socket.emit("node-message", params);
  log.debug("node-message send");
  socket.once("python-message", pythonCallback);
};

// Helper that makes sure all required parameters
// for a specific python indicator are present.
var verifyParams = (methodName, params) => {
  var requiredParams = methods[methodName].requires;

  _.each(requiredParams, paramName => {
    if(!_.has(params, paramName))
  throw pyError + methodName + ' requires ' + paramName + '.';

  var val = params[paramName];

  if(!_.isNumber(val))
    throw pyError + paramName + ' needs to be a number';
});
}

var methods = {};

methods.test = {
  requires: [],
  create: (params) => {
    verifyParams('test', params);
    return (socket, data, callback) => execute(socket, callback, {
      name: "test",
      startIdx: 0,
      endIdx: data.close.length - 1,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close
    });
  }
}


module.exports = methods;
