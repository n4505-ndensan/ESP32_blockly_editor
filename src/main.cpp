#include <WiFi.h>
#include <ESPmDNS.h>
#include <esp_mac.h>
#include <FS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <secrets.h>

#include <api/device_api.h>
#include <devices/devices.h>
#include <api/program_api.h>
#include <api/settings_api.h>
#include <runtime/runner.h>

#define HTTP_PORT 80

// センサの読み取り間隔と、状態を配る間隔。
// 同じ間隔で複数回変化しても、まとめて1回だけ配る。
constexpr uint32_t SENSOR_INTERVAL_MS = 100;
constexpr uint32_t PUBLISH_INTERVAL_MS = 100;

AsyncWebServer server(HTTP_PORT);
AsyncEventSource events("/events");

// 複数台を同じネットワークで使うため、MACアドレス下位3バイトから台ごとに一意な名前を作る。
String device_hostname()
{
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char name[16];
  snprintf(name, sizeof(name), "esp32-%02x%02x%02x", mac[3], mac[4], mac[5]);
  return String(name);
}

void wifi_connect(const char *ssid, const char *password, const char *hostname)
{
  Serial.println("");
  Serial.print("WiFi Connenting");

  // ルータのDHCPクライアント一覧にも同じ名前を出す。begin()より前に設定する。
  WiFi.setHostname(hostname);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    Serial.print(".");
    delay(1000);
  }
  // 省電力中はmDNSのマルチキャストを取りこぼし、.localの名前解決が不安定になる。
  WiFi.setSleep(false);

  Serial.println("");
  Serial.print("Connected : ");
  Serial.println(WiFi.localIP());
}

void mdns_start(const char *hostname)
{
  if (!MDNS.begin(hostname))
  {
    Serial.println("mDNS start failed.");
    return;
  }
  MDNS.addService("http", "tcp", HTTP_PORT);
  Serial.printf("URL : http://%s.local/\n", hostname);
}

void setup()
{
  Serial.begin(115200);
  Serial.println("SETUP");

  initDevices();
  initProgramRuntime();

  // uploadfsで書き込んだLittleFSを使う。失敗しても自動フォーマットしない。
  if (!LittleFS.begin(false))
  {
    Serial.println("LittleFS mount failed. Upload the LittleFS image with 'pio run -t uploadfs'.");
    return;
  }

  const String hostname = device_hostname();
  wifi_connect(WIFI_SSID, WIFI_PASSWORD, hostname.c_str());
  mdns_start(hostname.c_str());

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
    sendDeviceSnapshot(client);
    sendProgramSnapshot(client); });
  server.addHandler(&events);

  registerDeviceApi(server);
  registerProgramApi(server);
  registerSettingsApi(server);

  // Images change only with uploadfs, so let browsers reuse them without revalidating.
  // Registered before "/" because handlers are matched in registration order.
  server.serveStatic("/images/", LittleFS, "/web/images/").setCacheControl("max-age=86400");
  // Serve the SolidJS build and its assets; keep /events on the SSE handler.
  server.serveStatic("/", LittleFS, "/web/").setDefaultFile("index.html");

  server.begin();
}

void loop()
{
  static uint32_t lastSample = 0;
  static uint32_t lastPublish = 0;

  const uint32_t now = millis();
  serviceSettingsRestart();
  tickProgram();
#ifdef SENSOR_DIAGNOSTICS
  publishSensorReadFailure();
#endif

  if (now - lastSample >= SENSOR_INTERVAL_MS)
  {
    lastSample = now;
    pollDeviceSensors();
  }

  if (now - lastPublish >= PUBLISH_INTERVAL_MS)
  {
    lastPublish = now;
    publishDeviceChanges(events);
    publishProgramChanges(events);
  }

#ifdef PROGRAM_DIAGNOSTICS
  static uint32_t lastDiagnostics = 0;
  if (now - lastDiagnostics >= 1000)
  {
    lastDiagnostics = now;
    const auto d = programDiagnostics();
    // Serial output is outside all runtime/device locks. Not in production builds.
    Serial.printf("ACCEPTANCE {\"bootId\":\"%s\",\"uptimeMs\":%lu,\"heap\":%u,\"minHeap\":%u,\"largestBlock\":%u,\"stopSamples\":%lu,\"maxStopUs\":%lu}\n",
                  programBootId(), static_cast<unsigned long>(now), ESP.getFreeHeap(), ESP.getMinFreeHeap(), ESP.getMaxAllocHeap(),
                  static_cast<unsigned long>(d.stopSamples), static_cast<unsigned long>(d.maxStopUs));
  }
#endif
  delay(5);
}
