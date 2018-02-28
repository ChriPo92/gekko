# -*- coding: utf-8 -*-
"""
Created on Tue Feb 13 18:26:50 2018

@author: christoph
"""
import pandas as pd
import xarray as xa
import sklearn.preprocessing as prep



class pandas_MinMaxScaler(prep.MinMaxScaler):
    def __init__(self, feature_range=(0, 1), copy=True):
        super().__init__(feature_range, copy)
        self.index = None
        self.columns = None

    def fit(self, X, y=None):
        if isinstance(X, pd.DataFrame):
            self.index = X.index
            self.columns = X.columns
        fit = super().fit(X, y)
        self.scale_ = pd.DataFrame(self.scale_, index=self.columns).T
        self.min_ = pd.DataFrame(self.min_, index=self.columns).T
        return fit

    def transform(self, X):
        ret = super().transform(X)
        if isinstance(X, pd.DataFrame):
            ret = pd.DataFrame(ret, index=X.index, columns=X.columns)
        return ret

    def inverse_transform(self, X):
        ret = super().inverse_transform(X)
        if isinstance(X, pd.DataFrame):
            ret = pd.DataFrame(ret, index=X.index, columns=X.columns)
        return ret

    def partial_inverse_transform(self, X):
        if not isinstance(X, pd.DataFrame):
            return self.inverse_transform(X)
        else:
            new = []
            for col in set(X.columns.get_level_values("coin").values):
                try:                
                    sub = X.xs(col, level="coin", axis=1)
                except AttributeError:
                    sub = X[col]
                sub = ((sub-self.min_[col].values[0]) /
                       self.scale_[col].values[0])
                new.append(sub)
            return pd.concat(new,
                             keys=X.columns.get_level_values("coin").values,
                             names=["coin", "date"]).unstack(0)


def series_to_supervised(data, n_in=1, dropnan=True):
    if not isinstance(data, pd.DataFrame):
        df = pd.DataFrame(data)
    else:
        df = data
    n_vars = df.shape[1]
    cols, names = list(), list()
    # input sequence (t-n, ... t-1)
    for i in range(n_in-1, -1, -1):
        cols.append(df.shift(i))
        if i == 0:
            names += [("t", '%s' % j) for j in df.columns.values]
        else:
            names += [("t-%d" % i, '%s' % j) for j in df.columns.values]
    # put it all together
    agg = pd.concat(cols, axis=1)
    index = pd.MultiIndex.from_tuples(names, names=("time", "coin"))
    agg.columns = index
    # drop rows with NaN values
    if dropnan:
        agg.dropna(inplace=True)
    return agg.stack(level=["time", "coin"]).to_xarray()


def select_features(da, inpt_ftrs=[], outpt_ftrs=[]):
    if not isinstance(da, xa.DataArray):
        return
    # time t is not used as forecast data in real
    # time application, therefore it is taken as X column. This can should be
    # taken into account when training networks. There time t can be used as
    # future value already.
    x_times = da.coords["time"].values
    if len(inpt_ftrs):
        x_coins = []
        for ftr in inpt_ftrs:
            if ftr in da.coords["coin"].values:
                x_coins.append(ftr)
    else:
        x_coins = da.coords["coin"].values
    X = da.sel(coin=x_coins, time=x_times)
    return X


def prep_hist_poloniex_data(df, past_timesteps, input_features,
                            output_features, scaler):
    if df.isnull().sum().sum() > 0:
        raise ValueError("NaNs in Data")
    scaled_df = pd.DataFrame(scaler.transform(df), index=df.index,
                             columns=df.columns)
    supervised_da = series_to_supervised(scaled_df, past_timesteps)
    X = select_features(supervised_da, outpt_ftrs=output_features,
                        inpt_ftrs=input_features)
    return X

