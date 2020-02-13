#!/usr/bin/env bash

xdotool windowactivate --sync $(xdotool search "$1" | tail -1)
