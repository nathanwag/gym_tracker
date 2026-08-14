"""Servidor de desenvolvimento para a pasta www/.

Por que nao `python -m http.server`:
  1. Ele nao envia Cache-Control, entao o navegador aplica cache heuristico e
     uma alteracao de CSS pode simplesmente nao aparecer no reload.
  2. Ele responde 304 Not Modified quando o navegador manda If-Modified-Since,
     o que mantem o arquivo velho em uso mesmo com no-store.
  3. Ele atende um pedido por vez; um modulo ES que puxa varios arquivos em
     paralelo trava a fila.

Aqui: sem cache, sem 304, com threads.

Uso:  python tools/dev_server.py [porta]
"""

import functools
import http.server
import os
import sys

RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def _ignorar_condicional(self):
        """Sem isso o servidor responde 304 e o navegador reusa o arquivo antigo."""
        for cabecalho in ("If-Modified-Since", "If-None-Match"):
            while cabecalho in self.headers:
                del self.headers[cabecalho]

    def do_GET(self):
        self._ignorar_condicional()
        super().do_GET()

    def do_HEAD(self):
        self._ignorar_condicional()
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        codigo = str(args[1]) if len(args) > 1 else ""
        if not codigo.startswith("2"):
            super().log_message(fmt, *args)

    def handle_one_request(self):
        # O navegador fecha conexoes ociosas o tempo todo; isso nao e erro.
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError):
            self.close_connection = True


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    servidor = http.server.ThreadingHTTPServer(("", porta), functools.partial(Handler, directory=RAIZ))
    servidor.daemon_threads = True
    print(f"Treino em http://localhost:{porta}  (servindo {RAIZ})")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
