var _ = require('lodash');
var fs = require('fs');
var util = require('../../core/util');
var config = util.getConfig();
var dirs = util.dirs();
var log = require(dirs.core + 'log');

var ENV = util.gekkoEnv();
var mode = util.gekkoMode();
var startTime = util.getStartTime();

var talib = require(dirs.core + 'talib');
if(talib == null) {
  log.warn('TALIB indicators could not be loaded, they will be unavailable.');
}

var tulind = require(dirs.core + 'tulind');
if(tulind == null) {
  log.warn('TULIP indicators could not be loaded, they will be unavailable.');
}

var python = require(dirs.core + 'python');
if(python == null) {
  log.warn('PYTHON indicators could not be loaded, they will be unavailable.');
}

var py_options = {
  mode: 'text',
  pythonPath: '/usr/bin/python3',
  pythonOptions: ["-u"], // get print results in real-time
  scriptPath: dirs.plugins + "tradingAdvisor/"
};

var indicatorsPath = dirs.methods + 'indicators/';
var indicatorFiles = fs.readdirSync(indicatorsPath);
var Indicators = {};

_.each(indicatorFiles, function(indicator) {
  const indicatorName = indicator.split(".")[0];
  if (indicatorName[0] != "_")
    try {
      Indicators[indicatorName] = require(indicatorsPath + indicator);
    } catch (e) {
      log.error("Failed to load indicator", indicatorName);
    }
});

var allowedIndicators = _.keys(Indicators);
var allowedTalibIndicators = _.keys(talib);
var allowedTulipIndicators = _.keys(tulind);
var allowedPythonIndicators = _.keys(python);

var Base = function(settings) {
  _.bindAll(this);

  // properties
  this.age = 0;
  this.processedTicks = 0;
  this.setup = false;
  this.settings = settings;
  this.tradingAdvisor = config.tradingAdvisor;
  // defaults
  this.requiredHistory = 0;
  this.priceValue = 'close';
  this.indicators = {};
  this.talibIndicators = {};
  this.tulipIndicators = {};
  this.pythonIndicators ={};
  this.asyncTick = false;
  this.candlePropsCacheSize = 1000;
  this.deferredTicks = [];
  this.pythonIO = null;
  this.connectedToPython = false; //maybe this will be needed at some point

  this._prevAdvice;

  this.candleProps = {
    timestamp: [],
    open: [],
    high: [],
    low: [],
    close: [],
    volume: [],
    vwp: [],
    trades: []
  };

  // make sure we have all methods
  _.each(['init', 'check'], function(fn) {
    if(!this[fn])
      util.die('No ' + fn + ' function in this trading method found.')
  }, this);

  if(!this.update)
    this.update = function() {};

  if(!this.end)
    this.end = function() {};

  if(!this.onTrade)
    this.onTrade = function() {};

  // let's run the implemented starting point
  this.init();

  log.debug(_.size(this.pythonIndicators), python !== null);
  if (_.size(this.pythonIndicators) && python !== null) {
    var io = require("socket.io")(8000);
    io.on("connection", (socket) => {
      socket.on("disconnect",  (reason) => {
        // TODO: check if this was expected to happen, if not restart server or retry connection
        log.debug("Python Server disconnected because: " + reason);
        if(this.connectedToPython) this.connectedToPython = false;
      });
      socket.on('error', (error) => {
        log.debug(error);
      });
      socket.emit("connection"); // for some reason this has to be emitted manually
      this.pythonIO = socket;
      log.info("Python interface connected");
      this.connectedToPython = true;
      // if there are deferred ticks, handle them
      if(_.size(this.deferredTicks))
        this.tick(this.deferredTicks.shift())
    });
    /*
    var pyshell = require("python-shell");
    pyshell.run("python_server.py", py_options, function (err, res) {
      if (err) throw err;
      log.debug(res);
    })*/
  }

  if(!config.debug || !this.log)
    this.log = function() {};

  this.setup = true;

  if(_.size(this.talibIndicators) || _.size(this.tulipIndicators) ||
     _.size(this.pythonIndicators))
    this.asyncTick = true;

  if(_.size(this.indicators))
    this.hasSyncIndicators = true;
};

// teach our base trading method events
util.makeEventEmitter(Base);

Base.prototype.tick = function(candle) {
  if(
    this.asyncTick &&
    (this.hasSyncIndicators || this.connectedToPython) &&
    this.age !== this.processedTicks
  ) {
    // Gekko will call talib and run strat
    // functions when talib is done, but by
    // this time the sync indicators might be
    // updated with future candles.
    //
    // See @link: https://github.com/askmike/gekko/issues/837#issuecomment-316549691
    return this.deferredTicks.push(candle);
  }
  if (
    _.size(this.pythonIndicators) && !this.connectedToPython
  ){
    /* if a python indicator is loaded but the connection to the
    python server is not yet established
    */
    return this.deferredTicks.push(candle);
  }

  this.age++;

  if(this.asyncTick) {
    this.candleProps.timestamp.push(candle.start.unix());
    this.candleProps.open.push(candle.open);
    this.candleProps.high.push(candle.high);
    this.candleProps.low.push(candle.low);
    this.candleProps.close.push(candle.close);
    this.candleProps.volume.push(candle.volume);
    this.candleProps.vwp.push(candle.vwp);
    this.candleProps.trades.push(candle.trades);

    if(this.age > this.candlePropsCacheSize) {
      this.candleProps.timestamp.shift();
      this.candleProps.open.shift();
      this.candleProps.high.shift();
      this.candleProps.low.shift();
      this.candleProps.close.shift();
      this.candleProps.volume.shift();
      this.candleProps.vwp.shift();
      this.candleProps.trades.shift();
    }
  }

  // update all indicators
  var price = candle[this.priceValue];
  _.each(this.indicators, function(i) {
    if(i.input === 'price')
      i.update(price);
    if(i.input === 'candle')
      i.update(candle);
  },this);

  // update the trading method
  if(!this.asyncTick) {
    this.propogateTick(candle);
  } else {

    var next = _.after(
      _.size(this.talibIndicators) + _.size(this.tulipIndicators) +
      _.size(this.pythonIndicators),
      () => this.propogateTick(candle)
    );

    var basectx = this;

    // handle result from talib
    var talibResultHandler = function(err, result) {
      if(err)
        util.die('TALIB ERROR:', err);

      // fn is bound to indicator
      this.result = _.mapValues(result, v => _.last(v));
      next(candle);
    };

    // handle result from talib
    _.each(
      this.talibIndicators,
      indicator => indicator.run(
        basectx.candleProps,
        talibResultHandler.bind(indicator)
      )
  );

    // handle result from tulip
    var tulindResultHandler = function(err, result) {
      if(err)
        util.die('TULIP ERROR:', err);

      // fn is bound to indicator
      this.result = _.mapValues(result, v => _.last(v));
      next(candle);
    };

    // handle result from tulip indicators
    _.each(
      this.tulipIndicators,
      indicator => indicator.run(
        basectx.candleProps,
        tulindResultHandler.bind(indicator)
      )
  );
    // handle results from python indicators
    var pythonResultHandler = function (err, result) {
      if (err){
        util.die("PYTHON ERROR:", err);
      }
      //log.debug("Result Handler " + err + " " + result);
      //fn is bound to indicator
      this.result = result;
      next(candle)
    };
    // handle result from python indicators


    _.each(
      this.pythonIndicators,
      indicator => indicator.run(
        basectx.candleProps,
        pythonResultHandler.bind(indicator)
        // "this" has to be bound here to access it in the python indicator
    ))

  }

  this.propogateCustomCandle(candle);
};

// if this is a child process the parent might
// be interested in the custom candle.
if(ENV !== 'child-process') {
  Base.prototype.propogateCustomCandle = _.noop;
} else {
  Base.prototype.propogateCustomCandle = function(candle) {
    process.send({
      type: 'candle',
      candle: candle
    });
  }
}

Base.prototype.propogateTick = function(candle) {
  this.candle = candle;

  this.update(candle);

  var isAllowedToCheck = this.requiredHistory <= this.age;

  // in live mode we might receive more candles
  // than minimally needed. In that case check
  // whether candle start time is > startTime
  var isPremature;

  if(mode === 'realtime'){
    // Subtract number of minutes in current candle for instant start
    let startTimeMinusCandleSize = startTime.clone();
    startTimeMinusCandleSize.subtract(this.tradingAdvisor.candleSize, "minutes");

    isPremature = candle.start < startTimeMinusCandleSize;
  }
  else{
    isPremature = false;
  }

  if(isAllowedToCheck && !isPremature) {
    this.log(candle);
    this.check(candle);
  }
  this.processedTicks++;

  if(
    this.asyncTick &&
    (this.hasSyncIndicators || this.connectedToPython)&&
    this.deferredTicks.length
  ) {
    return this.tick(this.deferredTicks.shift())
  }

  // are we totally finished?
  var done = this.age === this.processedTicks;
  if(done && this.finishCb)
    this.finishCb();
};

Base.prototype.processTrade = function(trade) {
  this.onTrade(trade);
};

Base.prototype.addTalibIndicator = function(name, type, parameters) {
  if(!talib)
    util.die('Talib is not enabled');

  if(!_.contains(allowedTalibIndicators, type))
    util.die('I do not know the talib indicator ' + type);

  if(this.setup)
    util.die('Can only add talib indicators in the init method!');

  var basectx = this;

  this.talibIndicators[name] = {
    run: talib[type].create(parameters),
    result: NaN
  }
};

Base.prototype.addTulipIndicator = function(name, type, parameters) {
  if(!tulind)
  util.die('Tulip indicators is not enabled');

  if(!_.contains(allowedTulipIndicators, type))
    util.die('I do not know the tulip indicator ' + type);

  if(this.setup)
    util.die('Can only add tulip indicators in the init method!');

  var basectx = this;

  this.tulipIndicators[name] = {
    run: tulind[type].create(parameters),
    result: NaN
  }
};

Base.prototype.addPythonIndicator = function(name, type, parameters) {
  if(!python)
    util.die('Python indicators are not enabled');

  //if(!_.contains(allowedPythonIndicators, type))
    //util.die('I do not know the python indicator ' + type);

  if(this.setup)
    util.die('Can only add python indicators in the init method!');

  var basectx = this;
  parameters["ctx"] = this;
  this.pythonIndicators[name] = {
    run: python[type].create(parameters),
    result: NaN
  }
};

Base.prototype.addIndicator = function(name, type, parameters) {
  if(!_.contains(allowedIndicators, type))
    util.die('I do not know the indicator ' + type);

  if(this.setup)
    util.die('Can only add indicators in the init method!');

  this.indicators[name] = new Indicators[type](parameters);

  // some indicators need a price stream, others need full candles
};

Base.prototype.advice = function(newPosition, _candle) {
  // ignore soft advice coming from legacy
  // strategies.
  if(!newPosition)
    return;

  // ignore if advice equals previous advice
  if(newPosition === this._prevAdvice)
    return;

  // cache the candle this advice is based on
  if(_candle)
    var candle = _candle;
  else
    var candle = this.candle;

  this._prevAdvice = newPosition;

  _.defer(function() {
    this.emit('advice', {
      recommendation: newPosition,
      portfolio: 1,
      candle
    });
  }.bind(this));
};

// Because the trading method might be async we need
// to be sure we only stop after all candles are
// processed.
Base.prototype.finish = function(done) {
  log.debug("gekko tries to finish");
  log.debug(this.age , this.processedTicks);
  //log.debug(this.deferredTicks);
  if(!this.asyncTick) {
    this.end();
    return done();
  }

  if(this.age === this.processedTicks) {
    this.end();
    if(this.connectedToPython) {
      this.pythonIO.emit("terminate");
      this.connectedToPython = false;
    }
    return done();
  }
  // this prevents the tradingMethod to exit without terminating the PythonServer
  let hybridCallback = () => {
    if(this.connectedToPython) {
      this.pythonIO.emit("terminate");
      this.connectedToPython = false;
    }
    done()
  };
  // we are not done, register cb
  // and call after we are..
  //log.debug(this.pythonIO);
  this.finishCb = hybridCallback;
  if (_.size(this.deferredTicks) && !this.connectedToPython && _.size(this.pythonIndicators)) {
    // there are still ticks to be worked
    log.debug("killing in the name of finish");
    util.die("PYTHON ERROR: Connection unintentionally severed")
    // TODO: work something out for when the python server unexpectedly quits
    // TODO: reboot server if it is not running
    // TODO: check if the ordering of the ticks is inevitably always the same
    //return this.tick(this.deferredTicks.shift())
  }
};

module.exports = Base;
