#!/usr/bin/env python3
"""TaskFlow in miniatura per il laboratorio con due macchine virtuali (solo libreria standard).

Legge PORT da /etc/taskflow/taskflow.env (o dalla variabile d'ambiente), ascolta su quella porta e
dipende dal "database" (taskflow-db) su 127.0.0.1:5432: se non risponde, i dati restituiscono 500.
Token di prova: tf_lab_bob (credenziale SIMULATA, solo per il laboratorio).
"""
import json
import os
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "tf_lab_bob"
DB = ("127.0.0.1", int(os.environ.get("DB_PORT", "5432")))
TASKS = [
    {"id": 1, "title": "Scrivere la guida rapida", "status": "open"},
    {"id": 2, "title": "Verificare i codici di errore", "status": "in_progress"},
    {"id": 3, "title": "Documentare l'autenticazione", "status": "done"},
]


def db_up() -> bool:
    try:
        with socket.create_connection(DB, timeout=1):
            return True
    except OSError:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "taskflow-lab/1.0"

    def log_message(self, fmt, *args):  # registro su stderr -> journalctl
        sys.stderr.write("http: %s %s -> %s\n" % (self.command, self.path, args[1] if len(args) > 1 else "-"))

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/v1/health":
            return self.send_json(200, {"status": "ok"})
        if path == "/v1/tasks":
            if self.headers.get("Authorization") != "Bearer " + TOKEN:
                return self.send_json(401, {"error": "unauthorized", "message": "Token mancante o non valido"})
            if not db_up():
                sys.stderr.write("ERROR db: connessione a %s:%s non riuscita\n" % DB)
                return self.send_json(500, {"error": "database_unavailable", "message": "Impossibile raggiungere il database"})
            return self.send_json(200, {"data": TASKS})
        return self.send_json(404, {"error": "route_not_found", "message": "Endpoint inesistente: GET " + path})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    sys.stderr.write("INFO listen: in ascolto su 0.0.0.0:%d\n" % port)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
