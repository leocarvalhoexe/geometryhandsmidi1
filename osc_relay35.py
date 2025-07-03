import asyncio
import websockets
from pythonosc.udp_client import SimpleUDPClient
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import AsyncIOOSCUDPServer
from pythonosc.osc_message import OscMessage # Adicionado para decodificar mensagens binárias
import json
import threading # For running OSC server in a separate thread

# Configurações
WEBSOCKET_PORT = 8080  # Porta que o navegador envia OSC via WebSocket
TD_IP = "127.0.0.1"    # IP para enviar OSC UDP (ex: TouchDesigner)
TD_PORT = 5005         # Porta para enviar OSC UDP (ex: TouchDesigner)
UDP_LISTEN_IP = "0.0.0.0" # IP para escutar OSC UDP (0.0.0.0 para todas as interfaces)
UDP_LISTEN_PORT = 5006    # Porta para escutar OSC UDP de apps externos

# Cliente OSC UDP para o TouchDesigner (ou outro app)
osc_udp_client = SimpleUDPClient(TD_IP, TD_PORT)

# Lista global para armazenar conexões WebSocket ativas
# (Necessário para o servidor UDP enviar mensagens de volta ao(s) navegador(es))
active_websockets = set()

async def send_to_websockets(message_payload_json_str):
    """Envia uma mensagem para todos os WebSockets conectados."""
    if active_websockets:
        # asyncio.wait é depreciado, usar asyncio.gather
        await asyncio.gather(*[ws.send(message_payload_json_str) for ws in active_websockets])


# Handler para mensagens OSC recebidas via UDP
def udp_message_handler(address, *args):
    """Lida com mensagens OSC recebidas via UDP e as encaminha para o WebSocket."""
    print(f"[UDP IN] Recebido de {UDP_LISTEN_IP}:{UDP_LISTEN_PORT} - Addr: {address}, Args: {args}")
    # Prepara a mensagem para ser enviada via WebSocket
    # O formato deve ser algo que o main31.js possa entender,
    # por exemplo, um JSON similar ao que ele mesmo envia.
    # Aqui, vamos simplesmente encaminhar o endereço e os argumentos.
    # O cliente JS precisará ser ajustado para lidar com esses formatos.
    message_to_browser = {
        "address": address,
        "args": [{"type": type(arg).__name__, "value": arg} for arg in args] # Mantendo estrutura similar
    }
    payload_json = json.dumps(message_to_browser)

    # Precisamos chamar send_to_websockets de uma forma que funcione
    # com o loop de eventos do asyncio do thread principal.
    # asyncio.run_coroutine_threadsafe é uma boa opção aqui.
    if active_websockets: # Verifica se há algum websocket ativo
        loop = asyncio.get_event_loop() # Pega o loop de evento do thread principal (onde o websockets.serve roda)
        asyncio.run_coroutine_threadsafe(send_to_websockets(payload_json), loop)


async def websocket_handler(websocket, path):
    """Lida com conexões WebSocket do navegador."""
    client_address = websocket.remote_address
    print(f"[WebSocket CONNECT] Cliente conectado: {client_address}")
    active_websockets.add(websocket)
    try:
        async for message in websocket:
            try:
                # VERIFICA SE A MENSAGEM É BINÁRIA OU TEXTO (JSON)
                if isinstance(message, bytes):
                    try:
                        osc_msg = OscMessage(message)
                        address = osc_msg.address
                        args = osc_msg.params
                        print(f"[WebSocket BIN] Decodificado: {address} {args}")
                        osc_udp_client.send_message(address, args)
                        # Log de sucesso do envio UDP
                        print(f"[UDP OUT] (Binário) Enviado para {TD_IP}:{TD_PORT} - Addr: {address}, Args: {args}")
                        confirmation_payload = {
                            "type": "confirmation",
                            "received_address": address,
                            "received_args": list(args), # Garante que seja serializável para JSON
                            "status": "relayed_to_udp_binary"
                        }
                        await websocket.send(json.dumps(confirmation_payload))
                    except Exception as e_bin:
                        print(f"[WebSocket ERROR] Erro ao decodificar/retransmitir pacote binário OSC: {e_bin}")
                    continue # Pula para a próxima mensagem

                # Se não for bytes, assume-se que é uma string JSON
                message_str = message # Renomeia para manter a lógica abaixo
                osc_data_from_browser = json.loads(message_str) # Renomeado para evitar conflito com osc_msg
                address = osc_data_from_browser.get("address")
                # Extrai os valores dos argumentos
                args = [arg.get("value") for arg in osc_data_from_browser.get("args", []) if isinstance(arg, dict)]

                if address:
                    # Log detalhado da mensagem recebida do WebSocket (JSON)
                    print(f"[WebSocket IN] (JSON) De {websocket.remote_address} - Addr: {address}, Args: {args}")

                    # 1. Envia a mensagem OSC via UDP para o TD_IP:TD_PORT
                    try:
                        osc_udp_client.send_message(address, args)
                        # Log de sucesso do envio UDP
                        print(f"[UDP OUT] (JSON) Enviado para {TD_IP}:{TD_PORT} - Addr: {address}, Args: {args}")
                    except Exception as e_udp:
                        print(f"[UDP OUT ERROR] (JSON) Falha ao enviar para {TD_IP}:{TD_PORT} - Addr: {address}, Args: {args}. Erro: {e_udp}")

                    # 2. Envia confirmação de volta para o WebSocket que enviou a mensagem
                    confirmation_payload = {
                        "type": "confirmation",
                        "received_address": address,
                        "received_args": args, # args já é uma lista aqui
                        "status": "relayed_to_udp_json"
                    }
                    await websocket.send(json.dumps(confirmation_payload))
                    # print(f"[WebSocket OUT] Confirmação JSON enviada para {client_address}: {address}")

            except json.JSONDecodeError:
                print(f"[WebSocket ERROR] String de {client_address} não é JSON válido: {message_str}")
            except Exception as e:
                print(f"[WebSocket ERROR] Erro ao processar mensagem de {client_address}: {e} (Mensagem: {message_str if isinstance(message, str) else message[:60]})")
    except websockets.exceptions.ConnectionClosed:
        print(f"[WebSocket DISCONNECT] Cliente desconectado: {client_address}")
    except Exception as e_conn: # Captura outras exceções na conexão
        print(f"[WebSocket EXCEPTION] Exceção na conexão com {client_address}: {e_conn}")
    finally:
        active_websockets.remove(websocket)
        print(f"[WebSocket INFO] Cliente {client_address} removido dos ativos. Total ativos: {len(active_websockets)}")

async def main():
    # Configura e inicia o servidor OSC UDP para escuta
    dispatcher = Dispatcher()
    # Adicione handlers específicos aqui se precisar de mapeamento mais complexo
    # Ex: dispatcher.map("/control/slider1", udp_slider_handler_function)
    dispatcher.set_default_handler(udp_message_handler) # Handler padrão para todos os endereços

    # O servidor OSC UDP precisa rodar em seu próprio loop de eventos ou thread.
    # Para integração com websockets.serve (que usa asyncio),
    # podemos rodar o servidor OSC UDP em um thread separado.

    # Criar o servidor OSC UDP
    # Nota: OSCServer roda em seu próprio thread por padrão se não usarmos AsyncIOOSCUDPServer
    # No entanto, para melhor integração com o loop asyncio principal, vamos usar AsyncIOOSCUDPServer
    # e rodá-lo com run_until_complete em um novo loop de evento em um thread separado.

    loop = asyncio.get_running_loop()

    osc_server = AsyncIOOSCUDPServer((UDP_LISTEN_IP, UDP_LISTEN_PORT), dispatcher, loop)
    transport, protocol = await osc_server.create_serve_endpoint() # Inicia o servidor UDP
    print(f"Servidor OSC UDP escutando em {UDP_LISTEN_IP}:{UDP_LISTEN_PORT}")


    # Configura e inicia o servidor WebSocket
    # O host do servidor WebSocket é definido como "0.0.0.0" para escutar em todas as interfaces de rede disponíveis.
    # Isso é crucial para permitir conexões de outros dispositivos na rede local (ex: celular).
    ws_server = await websockets.serve(websocket_handler, "0.0.0.0", WEBSOCKET_PORT)
    print(f"Relay WebSocket (ws://0.0.0.0:{WEBSOCKET_PORT}) <=> OSC UDP (Tx: {TD_IP}:{TD_PORT}, Rx: {UDP_LISTEN_IP}:{UDP_LISTEN_PORT}) rodando.")
    print(f"Para conectar de outro dispositivo na rede, use o IP desta máquina (ex: ws://192.168.X.Y:{WEBSOCKET_PORT})")

    await ws_server.wait_closed() # Mantém o servidor WebSocket rodando
    transport.close() # Fecha o servidor UDP ao finalizar

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Servidor encerrado.")
    except Exception as e:
        print(f"Erro fatal no servidor: {e}")
