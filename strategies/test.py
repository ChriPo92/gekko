# -*- coding: utf-8 -*-
"""
Created on Sat Feb 17 10:23:36 2018

@author: christoph
"""

import pickle
with open("/home/christoph/Code/JavaScript & Node/gekko/strategies/python_indicators/models/scaler_sl_1800.pkl", "rb") as o:
    scaler = pickle.load(o)
scaler = pickle.load("/home/christoph/Code/JavaScript & Node/gekko/strategies/python_indicators/models/scaler_sl_1800.pkl")
