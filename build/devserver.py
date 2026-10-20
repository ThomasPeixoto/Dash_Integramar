#!/usr/bin/env python3
"""
Servidor estático de desenvolvimento, sem cache.

O `python3 -m http.server` não manda cabeçalho de cache, e o navegador então
decide sozinho — na prática ele guarda os módulos ES da sessão e continua
servindo a versão antiga depois de editar o arquivo. Isso já me fez testar
código velho achando que era novo: a função no disco tinha a correção, a
carregada na página não.

Aqui todo recurso sai com `Cache-Control: no-store`, então recarregar a página
sempre busca o que está no disco.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SemCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Só erros: o log de acesso de um site estático polui sem informar.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    endereco = sys.argv[2] if len(sys.argv) > 2 else "0.0.0.0"
    ThreadingHTTPServer((endereco, porta), SemCache).serve_forever()
