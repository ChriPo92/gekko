# -*- coding: utf-8 -*-
"""
Created on Wed Feb 21 16:07:08 2018

@author: christoph
"""
from .base_indicator import KerasNetwork
import numpy as np

class TestLSTM(KerasNetwork):
    def __init__(self):
        super().__init__(20, 1, "models/LSTM_Model_sl_daily.h5",
                         candle_cols = ["open"])
        self.scaler_min = -0.042659725958124686
        self.scaler_scale = 5.420319423087738e-05
    
    def _select_data(self, candle, add_data):
        candle = candle[-self.input_steps:]
        candle = np.array(candle).reshape([1, self.input_steps,
                                           self.output_steps])
        return candle
    
    def _calculate_indicator(self, data):
        scaled_data = (data * self.scaler_scale) + self.scaler_min
        res = self.model.predict(scaled_data)
        return ((res - self.scaler_min) / self.scaler_scale)[0, 0]