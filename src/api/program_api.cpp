#include "program_api.h"
#include <runtime/runner.h>
#include <runtime/json_input.h>
#include <runtime/state_json.h>
#include <AsyncJson.h>
#include <ArduinoJson.h>
#include <atomic>
#include <new>

namespace
{
    std::atomic<unsigned> uploads{0};
    struct Upload
    {
        size_t total, received;
        uint32_t stopEpoch;
        bool invalid;
        char data[1];
    };
    void releaseUpload(AsyncWebServerRequest *request)
    {
        if (!request->_tempObject)
            return;
        free(request->_tempObject);
        request->_tempObject = nullptr;
        --uploads;
    }
    void replyState(AsyncWebServerRequest *request, int status, const program::RunSnapshot &snapshot)
    {
        auto *response = new AsyncJsonResponse();
        response->setCode(status);
        program::writeState(response->getRoot(), programBootId(), snapshot);
        response->setLength();
        request->send(response);
    }
    void fail(AsyncWebServerRequest *request, int status, const char *code, const char *message, const char *blockId = nullptr)
    {
        auto *response = new AsyncJsonResponse();
        response->setCode(status);
        program::writeFailure(response->getRoot(), code, message, blockId);
        response->setLength();
        request->send(response);
    }
    // Bound ArduinoJson's temporary allocations as well as the request body.
    class JsonBudget : public ArduinoJson::Allocator
    {
        size_t used = 0;
        static constexpr size_t limit = 96 * 1024;
        struct alignas(max_align_t) Header
        {
            size_t size;
        };

    public:
        void *allocate(size_t size) override
        {
            if (size > limit - used)
                return nullptr;
            auto *p = static_cast<Header *>(malloc(sizeof(Header) + size));
            if (!p)
                return nullptr;
            p->size = size;
            used += size;
            return p + 1;
        }
        void deallocate(void *pointer) override
        {
            if (!pointer)
                return;
            auto *p = static_cast<Header *>(pointer) - 1;
            used -= p->size;
            free(p);
        }
        void *reallocate(void *pointer, size_t size) override
        {
            if (!pointer)
                return allocate(size);
            auto *p = static_cast<Header *>(pointer) - 1;
            const size_t old = p->size;
            if (size > limit - used + old)
                return nullptr;
            auto *next = static_cast<Header *>(realloc(p, sizeof(Header) + size));
            if (!next)
                return nullptr;
            next->size = size;
            used = used - old + size;
            return next + 1;
        }
    };
    void handleBody(AsyncWebServerRequest *request, uint8_t *data, size_t length, size_t index, size_t total)
    {
        if (total == 0 || total > program::MAX_BYTES)
            return;
        if (index == 0)
        {
            if (uploads.fetch_add(1) >= 2)
            {
                --uploads;
                return;
            }
            auto *body = static_cast<Upload *>(calloc(1, sizeof(Upload) + total));
            if (!body)
            {
                --uploads;
                return;
            }
            body->total = total;
            body->stopEpoch = programStopEpoch();
            request->_tempObject = body;
            // The server frees _tempObject on disconnect; release our slot and buffer first.
            request->onDisconnect([request]()
                                  { releaseUpload(request); });
        }
        auto *body = static_cast<Upload *>(request->_tempObject);
        if (!body)
            return;
        if (index != body->received || total != body->total || index > total || length > total - index)
        {
            body->invalid = true;
            return;
        }
        memcpy(body->data + index, data, length);
        body->received += length;
    }
    void handleRun(AsyncWebServerRequest *request)
    {
        const size_t length = request->contentLength();
        if (length > program::MAX_BYTES)
        {
            fail(request, 413, "program_too_large", "送信サイズが32KiBを超えています。");
            return;
        }
        if (length == 0 || !request->contentType().startsWith("application/json"))
        {
            releaseUpload(request);
            fail(request, 400, "bad_request", "Content-Length付きのJSONを送ってください。");
            return;
        }
        auto *body = static_cast<Upload *>(request->_tempObject);
        if (!body)
        {
            fail(request, 503, "out_of_memory", "受信メモリを確保できません。少し待って再実行してください。");
            return;
        }
        if (body->invalid || body->received != length)
        {
            releaseUpload(request);
            fail(request, 400, "bad_request", "JSONを最後まで受信できませんでした。");
            return;
        }
        JsonBudget budget;
        JsonDocument doc(&budget);
        const uint32_t stopEpoch = body->stopEpoch;
        const auto parsing = program::parseProgramJson(doc, body->data, length);
        releaseUpload(request);
        if (parsing)
        {
            if (parsing == DeserializationError::NoMemory)
                fail(request, 503, "out_of_memory", "JSONの解析メモリが不足しています。");
            else if (parsing == DeserializationError::TooDeep)
                fail(request, 413, "program_too_large", "JSONが深すぎます。");
            else
                fail(request, 400, "bad_request", "JSONの形式が不正です。");
            return;
        }
        // Validate before admission/reset: a rejected AST must never change any output.
        std::unique_ptr<program::Program> compiled(new (std::nothrow) program::Program());
        if (!compiled)
        {
            fail(request, 503, "out_of_memory", "実行用メモリが不足しています。");
            return;
        }
        program::Error error;
        if (!program::validate(doc.as<JsonVariantConst>(), runtimeDevices(), *compiled, error))
        {
            fail(request, strcmp(error.code, "program_too_large") == 0 ? 413 : 422, error.code, error.message, error.blockId);
            return;
        }
        program::RunSnapshot accepted;
        if (!submitProgram(compiled, stopEpoch, accepted))
        {
            fail(request, 409, "program_busy", "実行中、または送信中に停止されました。状態を確認してください。");
            return;
        }
        replyState(request, 202, accepted);
    }
    String payload(const program::RunSnapshot &snapshot)
    {
        JsonDocument doc;
        program::writeState(doc.to<JsonVariant>(), programBootId(), snapshot);
        String result;
        serializeJson(doc, result);
        return result;
    }
}
void registerProgramApi(AsyncWebServer &server)
{
    server.on(AsyncURIMatcher::exact("/api/program/run"), HTTP_POST, handleRun, nullptr, handleBody);
    server.on(AsyncURIMatcher::exact("/api/program/stop"), HTTP_POST, [](AsyncWebServerRequest *r)
              { replyState(r, 202, requestProgramStop()); });
    server.on(AsyncURIMatcher::exact("/api/program/state"), HTTP_GET, [](AsyncWebServerRequest *r)
              { replyState(r, 200, programSnapshot()); });
}
void sendProgramSnapshot(AsyncEventSourceClient *client) { client->send(payload(programSnapshot()).c_str(), "program", millis()); }
void publishProgramChanges(AsyncEventSource &events)
{
    static uint32_t lastRevision = 0;
    const auto snapshot = programSnapshot();
    if (snapshot.revision == lastRevision)
        return;
    lastRevision = snapshot.revision;
    events.send(payload(snapshot).c_str(), "program", millis());
}
