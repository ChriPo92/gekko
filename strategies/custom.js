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

// Let's create our own strat
var strat = {};


// Prepare everything our method needs
strat.init = function() {

  this.input = 'candle';
  this.currentTrend = 'long';
  this.requiredHistory = 5;
  this.addPythonIndicator("test", "test", []);
};

// What happens on every new candle?
strat.update = function(candle) {
  log.debug(this.pythonIndicators["test"].result)
};



// For debugging purposes.
strat.log = function() {
  //log.debug('calculated random number:');

};

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function() {

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
};

module.exports = strat;
