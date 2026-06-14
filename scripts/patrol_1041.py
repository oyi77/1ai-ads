#!/usr/bin/env python3
"""Canonical engine-backed patrol adapter for 1041 Nyamiresep."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from vilona_trakpro_engine import (
    fb_get, fb_post, API, ACCESS_TOKEN,
)

ACT = "act_380721031313330"

def _act(p):
