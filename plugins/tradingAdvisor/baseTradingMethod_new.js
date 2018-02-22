const _ = require('lodash');
const fs = require('fs');
const util = require('../../core/util');
const config = util.getConfig();
const dirs = util.dirs();
const log = require(dirs.core + 'log');
const async = require("async");
const pyshell = require("python-shell");
const Promise = require("bluebird");

const ENV = util.gekkoEnv();
const mode = util.gekkoMode();
const startTime = util.getStartTime();

const talib = require(dirs.core + 'talib');
const tulind = require(dirs.core + 'tulind');
const python = require(dirs.core + 'python');
const indicatorsPath = dirs.methods + 'indicators/';
const indicatorFiles = fs.readdirSync(indicatorsPath);
const Indicators = {};
const allIndicators = {};

_.forEach(indicatorFiles, function(indicator) {
  const indicatorName = indicator.split(".")[0];
  if (indicatorName[0] !== "_")
    try {
      Indicators[indicatorName] = require(indicatorsPath + indicator);
    } catch (e) {
      log.error("Failed to load indicator", indicatorName);
    }
});

_.forEach({"gekko": Indicators, "talib": talib, "tulip": tulind, "python": python},
          function(value, key){
  if (value == null) {
    log.warn(key.toUpperCase() + " indicators could not be loaded, they will be unavailable.");
  }
  allIndicators[key] = {
    "name": key,
    "lib": value,
    "allowed": _.keys(value),
    "registered": {}
  }
});

const py_options = {
  mode: 'text',
  pythonPath: '/usr/bin/python3',
  pythonOptions: ["-u"], // get print results in real-time
  scriptPath: dirs.plugins + "tradingAdvisor/"
};

const startPythonServer = function () {
  pyshell.run("python_server.py", py_options, function (err, res) {
    if (err) throw err;
    log.debug(res);
  })
};

var Base = function(settings) {
  _.bindAll(this);

  // properties
  this.age = 0;
  this.processedTicks = 0;
  this.setup = false;
  this.settings = settings;
  this.tradingAdvisor = config.tradingAdvisor;
  // defaults
  this.tickQueue = async.queue(function(candle, callback) {
    log.debug(candle);
    callback();
  }, 1); // give the correct function here

  this.requiredHistory = 0;
  this.priceValue = 'close';
  this.asyncTick = false;
  this.candlePropsCacheSize = 1000;
  this.deferredTicks = [];
  this.pythonConnection = {
    "IOServer": null,
    "IOSocket": null,
    "connected": false
  };

  // register the references to the indicators object
  this.indicators = allIndicators.gekko["registered"];
  this.talibIndicators = allIndicators.talib["registered"];
  this.tulipIndicators = allIndicators.tulip["registered"];
  this.pythonIndicators = allIndicators.python["registered"];

  //this._prevAdvice; what's that supposed to do?

  this.candleProps = {
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

  if(!config.debug || !this.log)
    this.log = function() {};

  // initiate the connection to Python if required and possible
  if (_.size(this.pythonIndicators) && python !== null) {
    this.initiatePythonConnection()
  }
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
  this.age++;

  if(this.asyncTick) {
    this.candleProps.open.push(candle.open);
    this.candleProps.high.push(candle.high);
    this.candleProps.low.push(candle.low);
    this.candleProps.close.push(candle.close);
    this.candleProps.volume.push(candle.volume);
    this.candleProps.vwp.push(candle.vwp);
    this.candleProps.trades.push(candle.trades);

    if(this.age > this.candlePropsCacheSize) {
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
  this.updateAllIndicators(candle);

  this.propagateTick(candle);
  // update the trading method
  this.propagateCustomCandle(candle);
};

Base.prototype.propagateTick = function(candle) {
  // TODO: not overhauled yet
  this.candle = candle;

  this.update(candle);

  const isAllowedToCheck = this.requiredHistory <= this.age;

  // in live mode we might receive more candles
  // than minimally needed. In that case check
  // whether candle start time is > startTime
  let isPremature;

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
  const done = this.age === this.processedTicks;
  if(done && this.finishCb)
    this.finishCb();
};

if(ENV !== 'child-process') {
  Base.prototype.propagateCustomCandle = _.noop;
} else {
  Base.prototype.propagateCustomCandle = function (candle) {
    process.send({
      type: 'candle',
      candle: candle
    });
  };
}

Base.prototype.pushCandleToQueue = function (candle) {
  this.tickQueue.push(function (callback) {
    this.CandleHandler(candle);
    callback()
  })
};

Base.prototype.updateAllIndicators = function (candle) {
  _.forEach(allIndicators, (values, key) => {
    if (values["name"] === "gekko"){
      // gekko indicators use different procedures
      _.forEach(values["registered"], function(i) {
        if(i.input === 'price')
          i.update(candle[this.priceValue]);
        if(i.input === 'candle')
          i.update(candle);
      }, this);
    } else {
      _.forEach(values["registered"], async (indicator) => {
        let res = await indicator.run(this.candleProps);
        if (values["name"] === "python") {
          indicator.result = res
        } else {
          indicator.result = _.mapValues(res, v => _.last(v))
        }
      })
    }
  })
};

Base.prototype.initiatePythonConnection = function () {
  if (this.pythonConnection["IOServer"] == null)
    this.pythonConnection["IOServer"] = require("socket.io")(8000);

  this.pythonConnection["IOServer"].on("connection", (socket) => {
    socket.on("disconnect",  (reason) => {
      // TODO: check if this was expected to happen, if not restart server or retry connection
      log.debug("Python Server disconnected because: " + reason);
      if(this.pythonConnection["connected"]) {
        this.pythonConnection["connected"] = false;
        this.pythonConnection["IOSocket"] = null;
      }
    });

    socket.on('error', (error) => {
      log.error(error);
    });

    socket.emit("connection"); // for some reason this has to be emitted manually
    this.pythonConnection["IOSocket"] = socket;
    this.pythonConnection["connected"] = true;
    log.info("Python interface connected");
  });
  startPythonServer()
};

Base.prototype.terminatePythonConnection = function () {
  this.pythonConnection["IOSocket"].emit("terminate");
  this.pythonConnection["IOSocket"].disconnect();
  this.pythonConnection["IOServer"].close(function () {
    log.info("Python Server disconnected");
  });
  this.pythonConnection["connected"] = false;
};

Base.prototype.addIndicatorHandler = function (library, name, type, parameters) {
  let indicator = allIndicators[library];
  if(this.setup)
    util.die('Can only add indicators in the init method!');
  if(!indicator["lib"])
    util.die(indicator["name"] + ' indicators are not enabled');
  if(!_.contains(indicator["allowed"], type))
    util.die('I do not know the indicator ' + type);

  if (library === "gekko") {
    indicator["registered"] = new indicator[type](parameters);
  }
  else {
    // TODO: check if the value is changed inside the Base.prototype too
    indicator["registered"][name] = {
      run: Promise.promisify(indicator["lib"][type].create(parameters)),
      result: NaN
    }
  }
};

Base.prototype.addIndicator = function (name, type, parameters) {
  this.addIndicatorHandler("gekko", name, type, parameters);
};

Base.prototype.addPythonIndicator = function (name, type, parameters) {
  parameters["ctx"] = this;
  this.addIndicatorHandler("python", name, type, parameters);
};

Base.prototype.addTalibIndicator = function (name, type, parameters) {
  this.addIndicatorHandler("talib", name, type, parameters);
};

Base.prototype.addTulipIndicator = function (name, type, parameters) {
  this.addIndicatorHandler("tulip", name, type, parameters);
};

Base.prototype.processTrade = function(trade) {
  this.onTrade(trade);
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

Base.prototype.finish = function(done) {
  log.debug("gekko tries to finish");
  log.debug(this.age , this.processedTicks);
  //log.debug(this.deferredTicks);
  if(!_.size(this.tickQueue) && this.age === this.processedTicks) {
    this.end();
    if (this.pythonConnection["connected"]) {
      this.terminatePythonConnection();
    }
    return done();
  }
  // TODO: add a callback to tickQueue that is executed upon finish and calls this.finish()
  // we are not done, register cb
  // and call after we are..
  //log.debug(this.pythonIO);
  this.finishCb = done;
  if (_.size(this.deferredTicks) && !this.connectedToPython && _.size(this.pythonIndicators)) {
    // there are still ticks to be worked
    util.die("PYTHON ERROR: Connection unintentionally severed")
    // TODO: work something out for when the python server unexpectedly quits
    // TODO: reboot server if it is not running
    // TODO: check if the ordering of the ticks is inevitably always the same
    //return this.tick(this.deferredTicks.shift())
  }
};
