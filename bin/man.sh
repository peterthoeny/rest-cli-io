#!/bin/bash

# use pipe & perl to strip backspace formatting from man output:
man -P cat "$1" | perl -pe 's/.\010//g'
# NOTE: Always quote arguments from user input! Avoid disaster like: "which; rm -rf /"
