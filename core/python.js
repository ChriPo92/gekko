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
var execute = (ctx, callback, params) => {
  // this is the baseTradingMethod, because arrow functions
  let socket = ctx.pythonIO;
  var pythonCallback = function(pythonReturn) {
    var err = pythonReturn["err"],
      res = pythonReturn["res"];
    //log.debug("pythonCallback " + err + " " + res);
    if(err) return callback(err, null);
    callback(null, res);
  };
  // TODO: multiple Python Indicators probably don't work due to different execution times in python
  // if the emitter sends a callback this could also be executed somewhere; change null
  socket.emit("node-message", params, null);
  //log.debug("node-message send");
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
    // TODO: find out why .bind(ctx) does not work here
    return (data, callback) => execute(params["ctx"], callback, {
      name: "test",
      startIdx: 0,
      endIdx: data.close.length - 1,
      timestamp: data.timestamp,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      vwp: data.vwp,
      volume: data.volume,
      trades: data.trades
    });
  }
};

methods.PoloniexNN = {
  requires: ["period", "inputTimesteps"],
  create: (params) => {
  verifyParams('PoloniexNN', params);
  // TODO: find out why .bind(ctx) does not work here
  //this.pythonIO.emit("initiate-method", params); this does not work yet
  return (data, callback) => execute(params["ctx"], callback, {
    name: "PoloniexNN",
    timestamp: data.timestamp
    });
  }
};


module.exports = methods;
