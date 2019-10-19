#!/usr/bin/env bash

xdotool windowactivate $(xdotool search "$1" | tail -1)
