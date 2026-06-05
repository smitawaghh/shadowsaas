import logging
import logging.handlers
from pathlib import Path

LOG_DIR = Path(__file__).parent.parent.parent / "logs"


def setup_logging(name: str | None = None) -> logging.Logger:
    LOG_DIR.mkdir(exist_ok=True)

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    if not root.handlers:
        # Console
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        ch.setFormatter(fmt)
        root.addHandler(ch)

        # Rotating file — 5 MB per file, keep 3 backups
        fh = logging.handlers.RotatingFileHandler(
            LOG_DIR / "shadowsaas.log",
            maxBytes=5_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        fh.setLevel(logging.INFO)
        fh.setFormatter(fmt)
        root.addHandler(fh)

    return logging.getLogger(name) if name else root
