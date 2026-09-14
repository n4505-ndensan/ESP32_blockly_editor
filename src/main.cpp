#include <WiFi.h>
#include <FS.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <SPIFFS.h>
#include <secrets.h>
#include <censors.h>

#define HTTP_PORT 80

AsyncWebServer server(HTTP_PORT);
AsyncEventSource events("/events");

void wifi_connect(const char *ssid, const char *password)
{
  Serial.begin(115200);

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
  Serial.print("SETUP");

  initCensors();

  delay(1000);

  // SPIFFSのセットアップ
  if (!SPIFFS.begin(true))
  {
    Serial.println("An Error has occurred while mounting SPIFFS");
    return;
  }

  wifi_connect(WIFI_SSID, WIFI_PASSWORD);

  // server config
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
            { request->send(SPIFFS, "/index.html"); });

  // SSE config
  events.onConnect([](AsyncEventSourceClient *client)
                   {
    if(client->lastId())
    {
      Serial.printf("Client reconnected! Last message ID that it got is: %u\n", client->lastId());
    } });
  server.addHandler(&events);

  server.begin();
}

void loop()
{
  float temperature = getThermoData();
  int distance = getDistanceData();

  events.send(String(temperature).c_str(), "temperature", millis());
  events.send(String(distance).c_str(), "distance", millis());

  delay(100);
}