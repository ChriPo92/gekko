# -*- coding: utf-8 -*-
"""
Created on Wed Feb 21 15:42:22 2018

@author: christoph

Baseclass for a Python Indicator
"""
import os.path as osp
import numpy as np
import pandas as pd
from keras.models import load_model


class BaseIndicator(object):
    """
    Base for all Python indicators. All indicators should inherit from
    this class

    Parameters
        ----
        data1 : float-Array
            Ein 2 X N float-Array mit dem Koordinatensaetz\n
            d1[0] ra-Werte\n
            d1[1] dec-Werte
        data2 : float-Array
            Ein 2 X N float-Array mit dem zweiten Koordiantensatz\n
            Anloge Aufteilung wie bei d1
        error : Boolean
            Ausgabe mit Fehlder des Fit's oder ohne\n
            Default ist False fuer nicht ausgabe
    Return
        ------
        Parameter fuer die Rotation
    """
    def __init__(self):
        self.only_gekko_candles = None
        self.parameters = []
        print("Base is initialized!")

    def calculate(self):
        raise NotImplementedError


class KerasNetwork(BaseIndicator):
    def __init__(self, inpt_tmstps, outpt_tmstps, rel_model_path,
                 only_gekko_candles=True, candle_cols = None, parameters=[]):
        all_candle_cols = ['close', 'endIdx', 'high', 'low', 'name',
                           'open', 'startIdx']
        self.only_gekko_candles = only_gekko_candles
        self.parameters = parameters
        self.input_steps = inpt_tmstps
        self.output_steps = outpt_tmstps
        abs_model_path = osp.join(osp.dirname(osp.realpath(__file__)),
                                  rel_model_path)
        self.model = load_model(abs_model_path)
        if candle_cols is None:
            self.candle_cols = all_candle_cols
        else:
            self.candle_cols = candle_cols
        self.last_endIdx = -1

    def calculate(self, candle):
        if self.last_endIdx + 1 != candle["endIdx"][0]:
            raise ValueError("Wrong candle was send!")
        else:
            self.last_endIdx = candle["endIdx"][0]
        candle = candle[self.candle_cols]
        if candle.shape[0] < self.input_steps:
            return
        if not self.only_gekko_candles:
            add_data = self._get_needed_data(candle)
        else:
            add_data = None
        full_data = self._select_data(candle, add_data)
        # TODO: Add support for pandas as output
        return self._calculate_indicator(full_data)

    def _get_needed_data(self, candle):
        """
        If not only gekko's OHCV candles are needed, add support to get the
        needed data.
        """
        raise NotImplementedError

    def _select_data(self, candle, add_data):
        """
        Select and unify the data needed for a Keras model to predict and
        return in a suitable manner, i.e. of shape [1, input_timesteps,
        output_timesteps]
        """
        raise NotImplementedError

    def _calculate_indicator(self, data):
        """
        As the data has to be scaled for most Neural Networks to perform well,
        a simple model.predict(full_data) is not enough. This most likely
        involves adding custom scaling mechanism depending on the model used.
        """
        #  TODO: make the scaling automatic or develop some kind of standard
        raise NotImplementedError