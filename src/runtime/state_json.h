#pragma once
#include "lifecycle.h"
#include <ArduinoJson.h>

namespace program
{
    inline void writeState(JsonVariant root, const char *bootId, const RunSnapshot &snapshot)
    {
        root["bootId"] = bootId;
        root["revision"] = snapshot.revision;
        root["runId"] = snapshot.runId;
        root["state"] = statusName(snapshot.state);
        if (snapshot.error.code)
        {
            root["error"]["code"] = snapshot.error.code;
            root["error"]["message"] = snapshot.error.message;
            // A const char array can be treated as static by ArduinoJson. The
            // snapshot is temporary, so explicitly copy it for deferred HTTP output.
            root["error"]["blockId"] = JsonString(snapshot.error.blockId, false);
        }
        else
            root["error"] = nullptr;
    }
    inline void writeFailure(JsonVariant root, const char *code, const char *message, const char *blockId = nullptr)
    {
        root["error"] = JsonString(code, false);
        root["message"] = JsonString(message, false);
        if (blockId && *blockId)
            root["blockId"] = JsonString(blockId, false);
    }
}
