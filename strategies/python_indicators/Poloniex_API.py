import urllib
import pandas as pd
import json
import time
import hmac,hashlib
from urllib.request import urlopen, Request
from datetime import datetime


def createTimeStamp(datestr, format="%Y-%m-%d %H:%M:%S"):
    return time.mktime(time.strptime(datestr, format))

class poloniex:
    def __init__(self, APIKey, Secret):
        self.APIKey = APIKey
        self.Secret = Secret

    def post_process(self, before):
        after = before

        # Add timestamps if there isnt one but is a datetime
        if('return' in after):
            if(isinstance(after['return'], list)):
                for x in xrange(0, len(after['return'])):
                    if(isinstance(after['return'][x], dict)):
                        if('datetime' in after['return'][x] and 'timestamp' not in after['return'][x]):
                            after['return'][x]['timestamp'] = float(createTimeStamp(after['return'][x]['datetime']))
                            
        return after

    def api_query(self, command, req={}):
        
        public = 'https://poloniex.com/public?command='
        if(command == "returnTicker" or command == "return24Volume"):
            ret = pd.read_json(public + command)
            return ret
        elif(command == "returnOrderBook"):
            ret = pd.read_json(public + command + '&currencyPair=' + str(req['currencyPair']))
            return ret
        elif(command == "returnMarketTradeHistory"):
            ret = pd.read_json(public + "returnTradeHistory" + '&currencyPair=' + str(req['currencyPair']))
            return ret
        elif(command == "returnChartData"):
            if isinstance(req["start"], pd.Timestamp):
                start = req["start"].timestamp()
                end = req["end"].timestamp()
            else:
                start = datetime.strptime(str(req['start']),
                                          '%Y-%m-%d').timestamp()
                end = datetime.strptime(str(req['end']), 
                                        '%Y-%m-%d') if str(req['end']) != "now" else datetime.now()
                end = end.timestamp()
            ret = pd.read_json(public + command +
                               "&currencyPair={}&start={}&end={}&period={}".format(req["currencyPair"],
                               start, end, req['period']))
            return ret.set_index(pd.to_datetime(ret["date"]))
        else:
            # TODO: This probably won't work
            req['command'] = command
            req['nonce'] = int(time.time()*1000)
            post_data = urllib.urlencode(req)

            sign = hmac.new(self.Secret, post_data, hashlib.sha512).hexdigest()
            headers = {
                'Sign': sign,
                'Key': self.APIKey
            }

            ret = pd.read_json('https://poloniex.com/tradingApi', post_data, headers)
            jsonRet = json.loads(ret.read())
            return self.post_process(jsonRet)

    def returnTicker(self):
        return self.api_query("returnTicker")

    def return24Volume(self):
        return self.api_query("return24Volume")

    def returnOrderBook(self, currencyPair):
        return self.api_query("returnOrderBook",
                              {'currencyPair': currencyPair})

    def returnMarketTradeHistory(self, currencyPair):
        return self.api_query("returnMarketTradeHistory",
                              {'currencyPair': currencyPair})

    def returnChartData(self, currencyPair, start, end="now", period=86400):
        return self.api_query("returnChartData", {"currencyPair": currencyPair,
                                                  "start": start, "end": end,
                                                  "period": period})

    # Returns all of your balances.
    # Outputs: 
    # {"BTC":"0.59098578","LTC":"3.31117268", ... }
    def returnBalances(self):
        return self.api_query('returnBalances')

    # Returns your open orders for a given market, specified by the "currencyPair" POST parameter, e.g. "BTC_XCP"
    # Inputs:
    # currencyPair  The currency pair e.g. "BTC_XCP"
    # Outputs: 
    # orderNumber   The order number
    # type          sell or buy
    # rate          Price the order is selling or buying at
    # Amount        Quantity of order
    # total         Total value of order (price * quantity)
    def returnOpenOrders(self,currencyPair):
        return self.api_query('returnOpenOrders',{"currencyPair":currencyPair})


    # Returns your trade history for a given market, specified by the "currencyPair" POST parameter
    # Inputs:
    # currencyPair  The currency pair e.g. "BTC_XCP"
    # Outputs: 
    # date          Date in the form: "2014-02-19 03:44:59"
    # rate          Price the order is selling or buying at
    # amount        Quantity of order
    # total         Total value of order (price * quantity)
    # type          sell or buy
    def returnTradeHistory(self,currencyPair):
        return self.api_query('returnTradeHistory',{"currencyPair":currencyPair})

    # Places a buy order in a given market. Required POST parameters are "currencyPair", "rate", and "amount". If successful, the method will return the order number.
    # Inputs:
    # currencyPair  The curreny pair
    # rate          price the order is buying at
    # amount        Amount of coins to buy
    # Outputs: 
    # orderNumber   The order number
    def buy(self,currencyPair,rate,amount):
        return self.api_query('buy',{"currencyPair":currencyPair,"rate":rate,"amount":amount})

    # Places a sell order in a given market. Required POST parameters are "currencyPair", "rate", and "amount". If successful, the method will return the order number.
    # Inputs:
    # currencyPair  The curreny pair
    # rate          price the order is selling at
    # amount        Amount of coins to sell
    # Outputs: 
    # orderNumber   The order number
    def sell(self,currencyPair,rate,amount):
        return self.api_query('sell',{"currencyPair":currencyPair,"rate":rate,"amount":amount})

    # Cancels an order you have placed in a given market. Required POST parameters are "currencyPair" and "orderNumber".
    # Inputs:
    # currencyPair  The curreny pair
    # orderNumber   The order number to cancel
    # Outputs: 
    # succes        1 or 0
    def cancel(self,currencyPair,orderNumber):
        return self.api_query('cancelOrder',{"currencyPair":currencyPair,"orderNumber":orderNumber})

    # Immediately places a withdrawal for a given currency, with no email confirmation. In order to use this method, the withdrawal privilege must be enabled for your API key. Required POST parameters are "currency", "amount", and "address". Sample output: {"response":"Withdrew 2398 NXT."} 
    # Inputs:
    # currency      The currency to withdraw
    # amount        The amount of this coin to withdraw
    # address       The withdrawal address
    # Outputs: 
    # response      Text containing message about the withdrawal
    def withdraw(self, currency, amount, address):
        return self.api_query('withdraw',{"currency":currency, "amount":amount, "address":address})

if __name__ == "__main__":
    polo = poloniex(None, None)
    print(polo.returnChartData("USDT_BCH", '2017-01-01', "now", 300)["weightedAverage"])