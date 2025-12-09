Smart Lamp (Arduino/ESP) Integration

This project supports toggling smart lamps for billiard tables. The device endpoints used in this repo are:

| Meja | Toggle URL |
| ---- | ---------- |
| 1    | `http://192.168.100.120/led?num=1&state=TOGGLE` |
| 2    | `http://192.168.100.120/led?num=2&state=TOGGLE` |
| 3    | `http://192.168.100.120/led?num=3&state=TOGGLE` |
| 4    | `http://192.168.100.120/led?num=4&state=TOGGLE` |

CORS on ESP8266 / ESP32

If you call the device from a browser, make sure the device responds with CORS headers. Example (ESP8266 using `ESP8266WebServer`):

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

ESP8266WebServer server(80);

void handleLed() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (server.method() == HTTP_OPTIONS) {
    server.send(204, "text/plain", "");
    return;
  }

  String num = server.arg("num");
  String state = server.arg("state");
  // TODO: implement toggle logic using num and state

  server.send(200, "text/plain", "OK");
}

void setup() {
  WiFi.begin("YOUR_SSID", "YOUR_PASS");
  while (WiFi.status() != WL_CONNECTED) delay(500);
  server.on("/led", HTTP_GET, handleLed);
  server.on("/led", HTTP_OPTIONS, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    server.send(204);
  });
  server.begin();
}

void loop() { server.handleClient(); }
```

Notes about hosting / mixed content

- If your web app is served over HTTPS (e.g. Vercel), browsers will block `http://` requests (mixed content). Options:
  - Prefer serving the web app over HTTP on a local LAN for development.
  - Use a secure tunnel such as `ngrok` to expose a local HTTPS endpoint that proxies to your device. Example:

```bash
# on the machine that can reach the Arduino
ngrok http 80
# use the provided https://...ngrok.io URL in the web app instead of http://192.168....
```

Security

- If you expose your device via ngrok or a public server, secure it (basic auth, token, or whitelist) to avoid misuse.
