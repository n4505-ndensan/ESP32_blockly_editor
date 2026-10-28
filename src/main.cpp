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

// Reconnects that the Arduino core makes within this window are part of the wait.
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 30000;
constexpr uint32_t WIFI_BLINK_MS = 500;

AsyncWebServer server(HTTP_PORT);
AsyncEventSource events("/events");

// The web UI is unreachable until setup finishes, so the kit LEDs and buzzer report it (adr/0013).
enum SetupSignal : uint8_t
{
  SIGNAL_WHITE,
  SIGNAL_BLUE,
  SIGNAL_GREEN,
  SIGNAL_RED,
  SIGNAL_YELLOW,
  SIGNAL_BUZZER,
  SIGNAL_COUNT,
};
const char *const SETUP_SIGNAL_PARTS[SIGNAL_COUNT] = {"led_white", "led_blue", "led_green", "led_red", "led_yellow", "buzzer"};
// Active output on each kit part's default pin, or -1 to skip that signal.
int setupSignalDevices[SIGNAL_COUNT];

// Failed setup steps, by the LED that reports them. Both can be lit.
struct SetupFailures
{
  bool red = false;    // WiFi
  bool yellow = false; // LittleFS, mDNS, sensor initialization
};

int output_on_pin(uint8_t pin)
{
  for (size_t i = 0; i < deviceCount(); i++)
  {
    const DeviceDescriptor &device = deviceDescriptor(i);
    if (device.kind == DeviceKind::Output && device.pin == pin)
      return static_cast<int>(i);
  }
  return -1;
}

// The kit is assumed to be wired on its default pins, whatever the active part list calls them.
void find_setup_signals()
{
  PartList kit;
  defaultPartList(kit);
  for (size_t signal = 0; signal < SIGNAL_COUNT; signal++)
  {
    setupSignalDevices[signal] = -1;
    for (size_t i = 0; i < kit.count; i++)
    {
      if (strcmp(kit.parts[i].id, SETUP_SIGNAL_PARTS[signal]) == 0)
        setupSignalDevices[signal] = output_on_pin(kit.parts[i].pins[0]);
    }
  }
}

// Through setDeviceOutput() so the web UI shows the same state.
void set_signal(SetupSignal signal, bool on)
{
  if (setupSignalDevices[signal] >= 0)
    setDeviceOutput(setupSignalDevices[signal], on);
}

void play_success_signal()
{
  set_signal(SIGNAL_GREEN, true);
  set_signal(SIGNAL_BUZZER, true);
  delay(400);
  set_signal(SIGNAL_BUZZER, false);
  delay(600);
  turnDeviceOutputsOff();
}

// Plays once per boot. The failure LEDs stay on until a program starts or they are operated manually.
void play_failure_signal(const SetupFailures &failures)
{
  if (failures.red)
    set_signal(SIGNAL_RED, true);
  if (failures.yellow)
    set_signal(SIGNAL_YELLOW, true);
  for (int i = 0; i < 3; i++)
  {
    set_signal(SIGNAL_BUZZER, true);
    delay(200);
    set_signal(SIGNAL_BUZZER, false);
    delay(200);
  }
}

// 複数台を同じネットワークで使うため、MACアドレス下位3バイトから台ごとに一意な名前を作る。
String device_hostname()
{
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char name[16];
  snprintf(name, sizeof(name), "esp32-%02x%02x%02x", mac[3], mac[4], mac[5]);
  return String(name);
}

bool wifi_connect(const char *ssid, const char *password, const char *hostname)
{
  Serial.println("");
  Serial.print("WiFi Connenting");

  // ルータのDHCPクライアント一覧にも同じ名前を出す。begin()より前に設定する。
  WiFi.setHostname(hostname);
  WiFi.begin(ssid, password);
  const uint32_t startedAt = millis();
  bool white = true;
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS)
  {
    set_signal(SIGNAL_WHITE, white);
    set_signal(SIGNAL_BLUE, !white);
    white = !white;
    Serial.print(".");
    delay(WIFI_BLINK_MS);
  }
  set_signal(SIGNAL_WHITE, false);
  set_signal(SIGNAL_BLUE, false);
  Serial.println("");

  if (WiFi.status() != WL_CONNECTED)
  {
    // No further attempts until the next boot.
    WiFi.disconnect(true);
    Serial.println("WiFi connection timed out.");
    return false;
  }
  // 省電力中はmDNSのマルチキャストを取りこぼし、.localの名前解決が不安定になる。
  WiFi.setSleep(false);

  Serial.print("Connected : ");
  Serial.println(WiFi.localIP());
  return true;
}

bool mdns_start(const char *hostname)
{
  if (!MDNS.begin(hostname))
  {
    Serial.println("mDNS start failed.");
    return false;
  }
  MDNS.addService("http", "tcp", HTTP_PORT);
  Serial.printf("URL : http://%s.local/\n", hostname);
  return true;
}

void setup()
{
  Serial.begin(115200);
  Serial.println("SETUP");

  SetupFailures failures;
  failures.yellow = !initDevices();
  find_setup_signals();
  initProgramRuntime();

  // uploadfsで書き込んだLittleFSを使う。失敗しても自動フォーマットしない。
  if (!LittleFS.begin(false))
  {
    Serial.println("LittleFS mount failed. Upload the LittleFS image with 'pio run -t uploadfs'.");
    failures.yellow = true;
    play_failure_signal(failures);
    return;
  }

  const String hostname = device_hostname();
  if (!wifi_connect(WIFI_SSID, WIFI_PASSWORD, hostname.c_str()))
  {
    failures.red = true;
    play_failure_signal(failures);
    return;
  }
  if (!mdns_start(hostname.c_str()))
    failures.yellow = true;

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

  if (failures.red || failures.yellow)
    play_failure_signal(failures);
  else
    play_success_signal();
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
  publishSensorWait();
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
