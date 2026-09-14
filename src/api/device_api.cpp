#include "device_api.h"

#include <AsyncJson.h>
#include <ArduinoJson.h>
#include <string.h>

#include <devices/devices.h>

namespace
{
    // 状態は出力部品ならon、センサならvalueだけを載せる。
    void writeDeviceState(JsonObject state, size_t index)
    {
        if (deviceDescriptor(index).kind == DeviceKind::Output)
            state["on"] = deviceState(index).on;
        else
            state["value"] = deviceState(index).value;
    }

    const char *kindName(DeviceKind kind)
    {
        return kind == DeviceKind::Output ? "output" : "sensor";
    }

    const char *controlName(DeviceControl control)
    {
        return control == DeviceControl::Switch ? "switch" : "none";
    }

    // カタログ1件分。静的な定義と現在の状態をまとめて返す。
    void writeDeviceEntry(JsonObject entry, size_t index)
    {
        const DeviceDescriptor &device = deviceDescriptor(index);

        entry["id"] = device.id;
        entry["label"] = device.label;
        entry["description"] = device.description;
        entry["unit"] = device.unit;
        entry["kind"] = kindName(device.kind);
        entry["control"] = controlName(device.control);
        writeDeviceState(entry["state"].to<JsonObject>(), index);
    }

    // SSEで配る形。カタログの情報は載せず、IDと状態だけにする。
    String buildStatePayload(uint32_t mask)
    {
        JsonDocument doc;
        doc["ts"] = millis();
        JsonArray devices = doc["devices"].to<JsonArray>();

        for (size_t i = 0; i < deviceCount(); i++)
        {
            if ((mask & (1u << i)) == 0)
                continue;

            JsonObject entry = devices.add<JsonObject>();
            entry["id"] = deviceDescriptor(i).id;
            writeDeviceState(entry["state"].to<JsonObject>(), i);
        }

        String payload;
        serializeJson(doc, payload);
        return payload;
    }

    void sendError(AsyncWebServerRequest *request, int status, const char *code, const char *message)
    {
        AsyncJsonResponse *response = new AsyncJsonResponse();
        response->setCode(status);

        JsonVariant root = response->getRoot();
        root["error"] = code;
        root["message"] = message;

        response->setLength();
        request->send(response);
    }

    void handleCatalog(AsyncWebServerRequest *request)
    {
        AsyncJsonResponse *response = new AsyncJsonResponse();

        JsonVariant root = response->getRoot();
        JsonArray devices = root["devices"].to<JsonArray>();

        for (size_t i = 0; i < deviceCount(); i++)
            writeDeviceEntry(devices.add<JsonObject>(), i);

        response->setLength();
        request->send(response);
    }

    // 操作は冪等なsetだけを受ける。現在の状態に依存するtoggleは持たない。
    void handleCommand(AsyncWebServerRequest *request, JsonVariant &json)
    {
        JsonObject body = json.as<JsonObject>();
        if (body.isNull())
        {
            sendError(request, 400, "bad_request", "JSONのオブジェクトを送ってください。");
            return;
        }

        const char *id = body["id"];
        if (id == nullptr)
        {
            sendError(request, 400, "bad_request", "idが必要です。");
            return;
        }

        const char *action = body["action"];
        if (action == nullptr)
        {
            sendError(request, 400, "bad_request", "actionが必要です。");
            return;
        }

        const int index = deviceIndexOf(id);
        if (index < 0)
        {
            sendError(request, 404, "unknown_device", "その名前の部品はありません。");
            return;
        }

        if (strcmp(action, "set") != 0 || deviceDescriptor(index).control != DeviceControl::Switch)
        {
            sendError(request, 422, "unsupported_action", "この部品にはできない操作です。");
            return;
        }

        JsonVariant on = body["on"];
        if (!on.is<bool>())
        {
            sendError(request, 400, "bad_request", "onにはtrueかfalseを指定してください。");
            return;
        }

        setDeviceOutput(static_cast<size_t>(index), on.as<bool>());

        AsyncJsonResponse *response = new AsyncJsonResponse();
        JsonVariant root = response->getRoot();
        root["id"] = deviceDescriptor(index).id;
        writeDeviceState(root["state"].to<JsonObject>(), static_cast<size_t>(index));

        response->setLength();
        request->send(response);
    }
}

void registerDeviceApi(AsyncWebServer &server)
{
    server.on(AsyncURIMatcher::exact("/api/devices"), HTTP_GET, handleCatalog);
    server.on(AsyncURIMatcher::exact("/api/devices/command"), HTTP_POST, handleCommand);
}

void sendDeviceSnapshot(AsyncEventSourceClient *client)
{
    client->send(buildStatePayload(allDevicesMask()).c_str(), "devices", millis());
}

void publishDeviceChanges(AsyncEventSource &events)
{
    const uint32_t changed = takeChangedDevices();
    if (changed == 0)
        return;

    events.send(buildStatePayload(changed).c_str(), "devices", millis());
}
