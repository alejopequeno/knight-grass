"""Send a Python file to the running Blender MCP addon (port 9876) and print the reply."""
import json
import socket
import sys

HOST, PORT, TIMEOUT_S = "localhost", 9876, 120

code = open(sys.argv[1], encoding="utf-8").read()
with socket.create_connection((HOST, PORT), timeout=TIMEOUT_S) as conn:
    conn.sendall(json.dumps({"type": "execute_code", "params": {"code": code}}).encode())
    buffer = b""
    while True:
        chunk = conn.recv(65536)
        if not chunk:
            break
        buffer += chunk
        try:
            print(json.dumps(json.loads(buffer), indent=2)[:2000])
            break
        except ValueError:
            continue
