"""Avvio locale: `python -m firestarter` apre il server su 127.0.0.1 (solo loopback)."""

from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from .app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog="firestarter")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    ui = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    uvicorn.run(create_app(static_dir=ui), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
