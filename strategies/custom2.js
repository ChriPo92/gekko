// This is a basic example strategy for Gekko.
// For more information on everything please refer
// to this document:
//
// https://gekko.wizb.it/docs/strategies/creating_a_strategy.html
//
// The example below is pretty bad investment advice: on every new candle there is
// a 10% chance it will recommend to change your position (to either
// long or short).

var log = require('../core/log');
var pyshell = require("python-shell");
var options = {
  mode: 'text',
  pythonPath: '/usr/bin/python3',
  pythonOptions: ["-u"], // get print results in real-time
  scriptPath: '/home/christoph/Code/Python/CryptoBot/'
};
var waitForFirst = require("wait-for-event").waitForFirst;
// Let's create our own strat
var strat = {};

// Prepare everything our method needs
strat.init = function() {
  this.input = 'candle';
  this.currentTrend = 'long';
  this.requiredHistory = 0;
  //this.hasSyncIndicators = true;
  this.asyncTick = true;
  this.io = require("socket.io")(8000);
  /*pyshell.run("py_ml.py", options, function (err, res) {
    if (err) log.debug( err);
    // results is an array consisting of messages collected during execution
    console.log('results: %j', res);
  });*/
  this.io.on("connection", function(socket){
    log.debug("node socket connected");
    socket.on('python-message', function( fromPython ) {
      log.debug(fromPython);
    });
  });
  const emitters = [this.io];
  waitForFirst("connection", emitters, function () {
    log.debug("waited for connection")
  })
};

// What happens on every new candle?
strat.update = function(candle) {
  log.debug("strat.update() called");
  this.io.emit("node-message", candle.start);
  setTimeout(function(){}, 1000);
 /* waitForFirst("python-message", [this.io],function () {
    log.debug("waited for connection")
  })*/
};

// For debugging purposes.
strat.log = function() {

}

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function() {
  log.debug("strat.check() called");
  // Only continue if we have a new update.
  if(!this.toUpdate)
    return;

  if(this.currentTrend === 'long') {

    // If it was long, set it to short
    this.currentTrend = 'short';
    this.advice('short');

  } else {

    // If it was short, set it to long
    this.currentTrend = 'long';
    this.advice('long');

  }
}

module.exports = strat;
