#!/bin/bash

# what's on the box

mongo 127.0.0.1:27015/u24_gbm getlist.js > u24_gbm.json
mongo 127.0.0.1:27015/u24_luad getlist.js > u24_luad.json

