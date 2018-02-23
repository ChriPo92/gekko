# -*- coding: utf-8 -*-
"""
Created on Thu Feb  8 13:39:56 2018

@author: christoph
"""

import pandas as pd
from datetime import datetime
from .Poloniex_API import poloniex

start_date = '2017-01-01'  # get data from the start of 2016
end_date = "now"  # up until today
period = 300

def merge_dfs_on_column(dataframes, labels, col):
    '''Merge a single column of each dataframe into a new combined dataframe'''
    series_dict = {}
    for label in labels:
        print(label)
        series_dict[label] = dataframes[label][col]
    return pd.DataFrame(series_dict)


def get_historical_data_Poloniex(start_date='2017-01-01', end_date="now",
                                 period=300, coins=[]):
    """
        Fetch table data directly from Poloniex and save all altcoin_USD to a
        pickle file

        Parameters
            ----

            start_date : timestamp of the required starting point

            end_date : timestamp of the required end point or now for the current timestamp

            period : number of seconds of each candle
    """
    polo = poloniex(None, None)
    altcoins = ['BTC', 'ETC', 'XRP', 'ETH', 'STR', 'LTC', 'ZEC', 'NXT',
                "XMR", "REP", "DASH"]
    if len(coins):
        if not all([coin in altcoins for coin in coins]):
            raise ValueError("Coin does not exist")
    else:
        coins = altcoins
    altcoin_data = {}
    for coin in coins:
        print("start downloading %s" % coin)
        coinpair = 'USDT_{}'.format(coin)
        crypto_price_df = polo.returnChartData(coinpair, start_date, end_date,
                                               period)
        altcoin_data[coin] = crypto_price_df
    combined_df = merge_dfs_on_column(altcoin_data,
                                      list(altcoin_data.keys()),
                                      'weightedAverage')
    return combined_df
