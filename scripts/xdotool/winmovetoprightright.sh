#!/usr/bin/env bash

xdotool windowactivate $(xdotool search "$1" | tail -1) sleep 0.1 key Ctrl+Shift+Alt+Right sleep 0.1 key Ctrl+Shift+Alt+Up sleep 0.3 key Super+Ctrl+Right
