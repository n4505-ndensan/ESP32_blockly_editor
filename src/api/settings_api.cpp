#include "settings_api.h"

#include <AsyncJson.h>
#include <ArduinoJson.h>
#include <atomic>
#include <memory>
#include <new>

#include <devices/device_settings_store.h>
#include <devices/devices.h>
#include <runtime/runner.h>
#include <runtime/state_json.h>

namespace
{
    constexpr uint32_t RESTART_DELAY_MS = 500;
    std::atomic<bool> restartPending{false};
    std::atomic<uint32_t> restartRequestedAt{0};

    void sendError(AsyncWebServerRequest *request, int status, const char *code, const char *message)
    {
        auto *response = new AsyncJsonResponse();
        response->setCode(status);
        program::writeFailure(response->getRoot(), code, message);
        response->setLength();
        request->send(response);
    }

    bool programActive()
    {
        const auto state = programSnapshot().state;
        return state == program::RunStatus::Starting || state == program::RunStatus::Running || state == program::RunStatus::Stopping;
    }

    void handleGet(AsyncWebServerRequest *request)
    {
        auto *response = new AsyncJsonResponse();
        JsonVariant root = response->getRoot();
        writeCandidatePins(root);
        writePartList(root, activePartList());
        response->setLength();
        request->send(response);
    }

    // 部品リスト全体を置き換える。反映は再起動で行い、起動時に全出力をOFFにそろえる流れをそのまま使う。
    void handlePost(AsyncWebServerRequest *request, JsonVariant &json)
    {
        if (!json.is<JsonObject>())
        {
            sendError(request, 400, "bad_request", "JSONのオブジェクトを送ってください。");
            return;
        }
        if (restartPending)
        {
            sendError(request, 409, "restarting", "再起動中です。少し待ってから開き直してください。");
            return;
        }
        if (programActive())
        {
            sendError(request, 409, "program_busy", "実行中は部品リストを保存できません。停止してください。");
            return;
        }

        std::unique_ptr<PartList> list(new (std::nothrow) PartList());
        if (!list)
        {
            sendError(request, 503, "out_of_memory", "メモリが不足しています。少し待ってから保存し直してください。");
            return;
        }
        char message[160] = {};
        if (!readPartList(json, *list, message, sizeof(message)))
        {
            sendError(request, 422, "invalid_settings", message);
            return;
        }
        if (!savePartList(*list))
        {
            sendError(request, 500, "save_failed", "部品リストを保存できませんでした。");
            return;
        }

        auto *response = new AsyncJsonResponse();
        response->getRoot()["restarting"] = true;
        response->setLength();
        request->send(response);
        restartRequestedAt = millis();
        restartPending = true;
    }
}

void registerSettingsApi(AsyncWebServer &server)
{
    server.on(AsyncURIMatcher::exact("/api/settings/devices"), HTTP_GET, handleGet);
    server.on(AsyncURIMatcher::exact("/api/settings/devices"), HTTP_POST, handlePost);
}

bool settingsRestartPending()
{
    return restartPending;
}

void serviceSettingsRestart()
{
    if (!restartPending || millis() - restartRequestedAt < RESTART_DELAY_MS)
        return;
    Serial.println("Part list saved. Restarting.");
    turnDeviceOutputsOff();
    ESP.restart();
}
