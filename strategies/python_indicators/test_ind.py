# -*- coding: utf-8 -*-
"""
Created on Wed Feb 21 14:23:47 2018

@author: christoph
"""

import pandas as pd
import numpy as np
from keras.models import load_model

def main(data):
    print("shit")
    if len(data) < 20:
        return
    else:
        data = np.array(data[-20:]).reshape((1, 20, 1))
    model = load_model("/home/christoph/Code/JavaScript & Node/gekko/strategies/python_indicators/models/LSTM_Model_sl_daily.h5")
    print(data)
    print(model.predict(data))
    
if __name__ == "__main__":
    main([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3])
