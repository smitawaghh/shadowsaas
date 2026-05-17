# backend/app/core/logging_config.py
import logging
import logging.config
from pathlib import Path
from pythonjsonlogger import jsonlogger

def setup_logging(name):
    """Configure structured logging"""
    logger = logging.getLogger(name)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s - %(name)s: %(message)s'
    ))
    
    logger.addHandler(console_handler)
    logger.setLevel(logging.INFO)
    
    return logger