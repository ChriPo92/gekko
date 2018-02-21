# -*- coding: utf-8 -*-
"""
Created on Tue Feb 20 12:53:17 2018

@author: ChriPo92
"""
import sys
from socketIO_client_nexus import SocketIO, LoggingNamespace
import numpy as np
import pandas as pd
import time
sys.path.insert(0, '../../strategies')
import python_indicators as pyind

lstm = None

def on_connect():
    global lstm
    print('connect')
    lstm = pyind.TestLSTM()
    print(lstm)


def on_disconnect():
    socketIO.emit("disconnect")
    print('disconnect')


def on_reconnect():
    print('reconnect')


def on_node_message(params, callback):
    df = pd.DataFrame(params)
    result = lstm.calculate(df)
    if result is not None:
        result = float(result)
#    print('on_aaa_response', type(result))
    socketIO.emit('python-message', {"err": None, "res": result})


def exit_IO():
    print("trying to exit")
#    socketIO.disconnect()
    sys.exit()

try:
    socketIO = SocketIO('localhost', 8000, LoggingNamespace)
    socketIO.on('connection', on_connect)
    socketIO.on('disconnect', on_disconnect)
    socketIO.on('reconnect', on_reconnect)
    socketIO.on("terminate", exit_IO)
    
    # Listen
    aaa = None
    socketIO.on('node-message', on_node_message)
    
    #socketIO.emit('aaa')
    socketIO.wait()
    
    
    # Stop listening
    #socketIO.off('aaa_response')
    #socketIO.emit('aaa')
    #socketIO.wait(seconds=1)
    #
    ## Listen only once
    #socketIO.once('aaa_response', on_aaa_response)
    #socketIO.emit('aaa')  # Activate aaa_response
    #socketIO.emit('aaa')  # Ignore
    #socketIO.wait(seconds=1)
except Exception as e:
    socketIO.disconnect()
    raise