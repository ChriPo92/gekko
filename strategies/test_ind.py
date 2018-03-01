# -*- coding: utf-8 -*-
"""
Created on Wed Feb 21 14:23:47 2018

@author: christoph
"""

import python_indicators as pi
from python_indicators import pandas_MinMaxScaler
from python_indicators.base_indicator import fromTimestampToSec
import pandas as pd

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
   lstm = pi.PoloniexLSTM(30, 3, 1800)
#   print(pd.Timestamp("2017-11-10 17:37:00"))
   df = pd.DataFrame({"timestamp": [pd.Timestamp("2017-11-10 17:37:00")]})
   print(lstm.calculate(df))
   df2 = pd.DataFrame({"timestamp": [pd.Timestamp("2017-11-10 17:37:00"),
                                     pd.Timestamp("2017-11-10 18:07:00")]})
   print(lstm.calculate(df2))
   
