"""Draws the given portraits (all by default) side by side into preview.png: big, real size, tile size.

Needs: pip install pillow. Run from this folder: python run.py [marine ninja astro xeno hunter]
"""
import importlib
import sys

from art import preview

names = sys.argv[1:] or ['marine', 'ninja', 'astro', 'xeno', 'hunter']
preview([importlib.import_module(n).draw() for n in names], 'preview.png', 6)
