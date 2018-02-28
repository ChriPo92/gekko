# -*- coding: utf-8 -*-
"""
Created on Wed Feb 21 16:07:08 2018

@author: christoph
"""
from .base_indicator import KerasNetwork, fromTimestampToSec
from .Poloniex_Historical_Data import get_historical_data_Poloniex
from .Preprocess_Hist_Data import prep_hist_poloniex_data, pandas_MinMaxScaler
import numpy as np
import pandas as pd
import os
import dill


class TestLSTM(KerasNetwork):
    def __init__(self):
        super().__init__(20, 1, 86400, "models/LSTM_Model_sl_daily.h5",
                         candle_cols=["open"])
        self.scaler_min = -0.042659725958124686
        self.scaler_scale = 5.420319423087738e-05

    def _process_data(self, candle, add_data):
        candle = candle[-self.input_steps:]
        # has to be of shape (#time series to investigate, #input_step,
        #                     #input_features)
        candle = np.array(candle).reshape([1, self.input_steps,
                                           1])
        return candle

    def _calculate_indicator(self, data):
        scaled_data = (data * self.scaler_scale) + self.scaler_min
        res = self.model.predict(scaled_data)
        return ((res - self.scaler_min) / self.scaler_scale)[0, 0]


class PoloniexLSTM(KerasNetwork):
    def __init__(self, input_stps, output_stps, period, altcoins=[]):
        sclr_pth, mdl_pth = None, None
        dir_path = os.path.dirname(os.path.realpath(__file__))
        for f in os.listdir(dir_path + "/models/"):
            s = f.split(".")
            if s[0].endswith(str(period)) and s[1] == "pkl":
                sclr_pth = os.path.join(dir_path, "models/", f)
            elif s[0].endswith(str(period)) and s[1] == "h5":
                mdl_pth = "models/" + f
        super().__init__(input_stps, period, mdl_pth, outpt_tmstps=output_stps,
                         candle_cols=["timestamp"], only_gekko_candles=False)
        with open(sclr_pth, "rb") as scaler:
            """
            This is not a nice solution, and only works if
            pandas_MinMaxScaler is imported in the main script and
            dill.settings["recurse"] = True in the script that pickles the
            scaler
            """
            self.scaler = dill.load(scaler)
        self.altcoins = altcoins

    def _retrieve_hist_data(self, timestamp):
        timestamps = fromTimestampToSec(timestamp)
        start = timestamps[0] - self.input_steps * self.period
        end = timestamps[0] - self.period
        self.history = get_historical_data_Poloniex(start, end, self.period,
                                                    self.altcoins)

    def _get_needed_data(self, candle):
        # TODO: check if it is needed to obtain tick after history
        # TODO: if tick timestamp is not compatible with the downloadable
        # ticks at Poloniex, the accuracy of the "historical" data decreases
        # and the tick from gekko might be newer. This gets worse the larger
        # the period of the ticks gets.
        timestamp = fromTimestampToSec(candle["timestamp"])[-1]
        start = timestamp - self.period
        new_tick = get_historical_data_Poloniex(start, timestamp, self.period,
                                                self.altcoins)
        return new_tick

    def _process_data(self, candle, add_data):
        if self.only_gekko_candles:
            return candle
        else:
            self.history = self.history.append(add_data)
            X = prep_hist_poloniex_data(self.history, self.input_steps,
                                        self.altcoins, ["BTC"], self.scaler)
            return X

    def _calculate_indicator(self, data):
        columns = self._createMultIndex()
        ind = pd.to_datetime(data["date"]+self.period*1e9, utc=True)
        result = pd.DataFrame(self.model.predict(data), columns=columns,
                              index=ind)
        return self.scaler.partial_inverse_transform(result)

    def _createMultIndex(self):
        times = ["t+%i" % (i+1) for i in range(self.output_steps)]
        output = ["BTC"]  # check if this is always the case, might be changed
        levels = [times, output]
        labels = [range(self.output_steps),
                  [0 for i in range(self.output_steps)]]
        names = ["time", "coin"]
        return pd.MultiIndex(levels=levels, labels=labels, names=names)
        