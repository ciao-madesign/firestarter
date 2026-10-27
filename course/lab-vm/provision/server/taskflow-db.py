#!/usr/bin/env python3
"""Finto database del laboratorio: accetta connessioni TCP su 127.0.0.1:5432. Serve solo come dipendenza di taskflow."""
import os
import socket
import sys

port = int(os.environ.get("DB_PORT", "5432"))
srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", port))
srv.listen(16)
sys.stderr.write("INFO started: database pronto su 127.0.0.1:%d\n" % port)
while True:
    conn, _ = srv.accept()
    conn.close()
