#include <WiFi.h>
#include <FS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <secrets.h>

#include <api/device_api.h>
#include <devices/devices.h>

#define HTTP_PORT 80

// センサの読み取り間隔と、状態を配る間隔。
// 同じ間隔で複数回変化しても、まとめて1回だけ配る。
constexpr uint32_t SENSOR_INTERVAL_MS = 100;
constexpr uint32_t PUBLISH_INTERVAL_MS = 100;

AsyncWebServer server(HTTP_PORT);
AsyncEventSource events("/events");

void wifi_connect(const char *ssid, const char *password)
{
  Serial.println("");
  Serial.print("WiFi Connenting");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    Serial.print(".");
    delay(1000);
  }

  Serial.println("");
  Serial.print("Connected : ");
  Serial.println(WiFi.localIP());
}

void setup()
{
  Serial.begin(115200);
  Serial.println("SETUP");

  initDevices();

  // uploadfsで書き込んだLittleFSを使う。失敗しても自動フォーマットしない。
  if (!LittleFS.begin(false))
  {
    Serial.println("LittleFS mount failed. Upload the LittleFS image with 'pio run -t uploadfs'.");
    return;
  }

  wifi_connect(WIFI_SSID, WIFI_PASSWORD);

  // server config
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");

  // SSE config
  events.onConnect([](AsyncEventSourceClient *client)
                   {
    if(client->lastId())
    {
      Serial.printf("Client reconnected! Last message ID that it got is: %u\n", client->lastId());
    }

    // 途中から参加しても状態がそろうよう、接続直後に全部品を1回送る。
    sendDeviceSnapshot(client); });
  server.addHandler(&events);

  registerDeviceApi(server);

  // Serve the SolidJS build and its assets; keep /events on the SSE handler.
  server.serveStatic("/", LittleFS, "/web/").setDefaultFile("index.html");

  server.begin();
}

void loop()
{
  static uint32_t lastSample = 0;
  static uint32_t lastPublish = 0;

  const uint32_t now = millis();

  if (now - lastSample >= SENSOR_INTERVAL_MS)
  {
    lastSample = now;
    pollDeviceSensors();
  }

  if (now - lastPublish >= PUBLISH_INTERVAL_MS)
  {
    lastPublish = now;
    publishDeviceChanges(events);
  }

  delay(5);
}
