import asyncio
import websockets
from pythonosc.udp_client import SimpleUDPClient
import json

# Configurações
WEBSOCKET_PORT = 8080  # Porta que o navegador envia OSC
TD_IP = "127.0.0.1"
TD_PORT = 5005         # Porta onde o TouchDesigner escuta OSC

# Cliente OSC UDP para o TouchDesigner
osc_client = SimpleUDPClient(TD_IP, TD_PORT)

async def handler(websocket, path):
    print("WebSocket conectado.")
    try:
        async for message in websocket:
            try:
                # Tenta decodificar JSON do OSC.js
                osc_msg = json.loads(message)
                address = osc_msg.get("address")
                args = [arg.get("value") for arg in osc_msg.get("args", [])]

                if address:
                    print(f"Recebido OSC: {address} {args}")
                    osc_client.send_message(address, args)
            except Exception as e:
                print(f"Erro ao processar mensagem: {e}")
    except websockets.exceptions.ConnectionClosed:
        print("WebSocket desconectado.")

start_server = websockets.serve(handler, "localhost", WEBSOCKET_PORT)

print(f"Relay WebSocket → OSC UDP rodando em ws://localhost:{WEBSOCKET_PORT} → {TD_IP}:{TD_PORT}")
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
