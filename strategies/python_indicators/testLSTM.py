# -*- coding: utf-8 -*-
"""
Created on Wed Feb 21 16:07:08 2018

@author: christoph
"""
from .base_indicator import KerasNetwork
from .Poloniex_Historical_Data import get_historical_data_Poloniex
from .Preprocess_Hist_Data import prep_hist_poloniex_data
import numpy as np
import os
import pickle


class TestLSTM(KerasNetwork):
    def __init__(self):
        super().__init__(20, 1, 86400, "models/LSTM_Model_sl_daily.h5",
                         candle_cols=["open"])
        self.scaler_min = -0.042659725958124686
        self.scaler_scale = 5.420319423087738e-05

    def _process_data(self, candle, add_data):
        candle = candle[-self.input_steps:]
        candle = np.array(candle).reshape([1, self.input_steps,
                                           self.output_steps])
        return candle

    def _calculate_indicator(self, data):
        scaled_data = (data * self.scaler_scale) + self.scaler_min
        res = self.model.predict(scaled_data)
        return ((res - self.scaler_min) / self.scaler_scale)[0, 0]


class PoloniexLSTM(KerasNetwork):
    def __init__(self, pst_stps, ftr_stps, period, altcoins=[]):
        sclr_pth, mdl_pth = None, None
        for f in os.listdir("models/"):
            s = f.split(".")
            if s[0].endswith(str(period)) and s[1] == "pkl":
                sclr_pth = f
            elif s[0].endswith(str(period)) and s[1] == "h5":
                mdl_pth = f
        super().__init__(pst_stps, ftr_stps, mdl_pth,
                         candle_cols=["timestamp"], only_gekko_candles=False)
        self.scaler = pickle.load(sclr_pth)
        self.altcoins = altcoins

    def _retrieve_hist_data(self, timestamp):
        start = timestamp - self.input_steps * self.period
        end = timestamp - self.period
        self.history = get_historical_data_Poloniex(start, end, self.period,
                                                    self.altcoins)

    def _get_needed_data(self, candle):
        # TODO: check if it is needed to obtain tick after history
        start = timestamp - self.period
        new_tick = get_historical_data_Poloniex(start, timestamp, self.period,
                                                self.altcoins)
        return new_tick

    def _process_data(self, candle, add_data):
        if self.only_gekko_candles:
            return candle
        else:
            self.history.append(add_data)  # probably doesnt work
            X, y = prep_hist_poloniex_data(self.history, self.input_steps,
                                           self.output_steps, self.altcoins,
                                           ["BTC"], self.scaler)
            