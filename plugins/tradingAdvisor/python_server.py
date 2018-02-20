# -*- coding: utf-8 -*-
"""
Created on Tue Feb 20 12:53:17 2018

@author: ChriPo92
"""
import sys
from socketIO_client_nexus import SocketIO, LoggingNamespace
import numpy as np
import time

def on_connect():
    print('connect')

def on_disconnect():
    print('disconnect')

def on_reconnect():
    print('reconnect')

def on_aaa_response(*args):
    print('on_aaa_response', args)
#    time.sleep(0.5)
    socketIO.emit('python-message', {"err":None, "res":np.random.rand()})

def exit_IO():
    print("trying to exit")
    socketIO.disconnect()
    sys.exit()

socketIO = SocketIO('localhost', 8000, LoggingNamespace)
socketIO.on('connect', on_connect)
socketIO.on('disconnect', on_disconnect)
socketIO.on('reconnect', on_reconnect)
socketIO.on("terminate", exit_IO)

# Listen
aaa = None
socketIO.on('node-message', on_aaa_response)

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