import http.server
import socketserver
import webbrowser
import os

PORT = 8000
HOSTNAME = "localhost"
TARGET_HTML = "index51.html"

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.path = f'/{TARGET_HTML}'
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

# Verifica se a porta está em uso
try:
    with socketserver.TCPServer((HOSTNAME, PORT), Handler) as httpd:
        print(f"Servidor iniciado em http://{HOSTNAME}:{PORT}")
        url_to_open = f"http://{HOSTNAME}:{PORT}/{TARGET_HTML}"

        # Tenta abrir no navegador
        try:
            webbrowser.open(url_to_open)
            print(f"Abrindo {url_to_open} no navegador padrão.")
        except Exception as e:
            print(f"Não foi possível abrir o navegador automaticamente: {e}")
            print(f"Por favor, abra manualmente: {url_to_open}")

        httpd.serve_forever()
except OSError as e:
    if e.errno == 98: # Endereço já em uso
        print(f"ERRO: A porta {PORT} já está em uso.")
        print("Verifique se outro servidor está rodando ou escolha uma porta diferente.")

        # Tenta abrir o navegador mesmo se o servidor falhar em iniciar aqui,
        # pois outro servidor pode já estar servindo o conteúdo.
        url_to_open = f"http://{HOSTNAME}:{PORT}/{TARGET_HTML}"
        try:
            print(f"Tentando abrir {url_to_open} no navegador, caso já esteja sendo servido...")
            webbrowser.open(url_to_open)
        except Exception as e_browser:
            print(f"Não foi possível abrir o navegador: {e_browser}")
            print(f"Você pode tentar acessar manualmente: {url_to_open}")

    else:
        print(f"Erro ao iniciar o servidor: {e}")
except KeyboardInterrupt:
    print("\nServidor interrompido pelo usuário.")
finally:
    print("Servidor finalizado.")
