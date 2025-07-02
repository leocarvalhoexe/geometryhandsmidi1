import asyncio
import websockets
from pythonosc.udp_client import SimpleUDPClient
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import AsyncIOOSCUDPServer
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
    print(f"UDP OSC Recebido: {address} {args}")
    # Prepara a mensagem para ser enviada via WebSocket
    # O formato deve ser algo que o main30.js possa entender,
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
    print(f"WebSocket conectado: {websocket.remote_address}")
    active_websockets.add(websocket)
    try:
        async for message in websocket: # Alterado de message_str para message
            try:
                # VERIFICA SE A MENSAGEM É BINÁRIA OU TEXTO (JSON)
                if isinstance(message, bytes):
                    print(f"Ignorado pacote binário via WebSocket: {message}")
                    # Aqui você pode decidir se quer tentar processar a mensagem binária OSC
                    # ou simplesmente ignorá-la. Por enquanto, ignorando.
                    # Se fosse processar:
                    # from pythonosc import osc_message
                    # try:
                    #     decoded_msg = osc_message.OscMessage(message)
                    #     address = decoded_msg.address
                    #     args = decoded_msg.params
                    #     print(f"WS Binário Decodificado: {address} {args}")
                    #     # Lógica para encaminhar ou processar
                    # except Exception as e_bin:
                    #     print(f"Erro ao decodificar pacote binário OSC: {e_bin}")
                    continue # Pula para a próxima mensagem

                # Se não for bytes, assume-se que é uma string JSON
                message_str = message # Renomeia para manter a lógica abaixo
                osc_msg_from_browser = json.loads(message_str)
                address = osc_msg_from_browser.get("address")
                # Extrai os valores dos argumentos
                args = [arg.get("value") for arg in osc_msg_from_browser.get("args", []) if isinstance(arg, dict)]


                if address:
                    print(f"WS Recebido de {websocket.remote_address}: {address} {args}")
                    
                    # 1. Envia a mensagem OSC via UDP para o TD_IP:TD_PORT
                    osc_udp_client.send_message(address, args)
                    
                    # 2. Envia confirmação de volta para o WebSocket que enviou a mensagem
                    confirmation_payload = {
                        "type": "confirmation",
                        "received_address": address,
                        "received_args": args,
                        "status": " relayed_to_udp"
                    }
                    await websocket.send(json.dumps(confirmation_payload))
                    # print(f"WS Enviado Confirmação para {websocket.remote_address}: {address} {args}")

            except json.JSONDecodeError:
                print(f"Erro: String recebida via WebSocket não é JSON válido: {message_str}")
            except Exception as e:
                print(f"Erro ao processar mensagem WebSocket: {e} (Mensagem: {message_str if isinstance(message, str) else message})") # Ajuste no print
    except websockets.exceptions.ConnectionClosed:
        print(f"WebSocket desconectado: {websocket.remote_address}")
    finally:
        active_websockets.remove(websocket)

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
    ws_server = await websockets.serve(websocket_handler, "localhost", WEBSOCKET_PORT)
    print(f"Relay WebSocket (ws://localhost:{WEBSOCKET_PORT}) <=> OSC UDP (Tx: {TD_IP}:{TD_PORT}, Rx: {UDP_LISTEN_IP}:{UDP_LISTEN_PORT}) rodando.")

    await ws_server.wait_closed() # Mantém o servidor WebSocket rodando
    transport.close() # Fecha o servidor UDP ao finalizar

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Servidor encerrado.")
    except Exception as e:
        print(f"Erro fatal no servidor: {e}")
