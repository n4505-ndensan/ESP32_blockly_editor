#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>
#include <runtime/program.h>
#include <runtime/engine.h>
#include <runtime/lifecycle.h>
#include <runtime/json_input.h>
#include <runtime/state_json.h>
#include <devices/sensor_sample.h>
#include <devices/sensor_diagnostics.h>
#include <devices/distance_sample.h>
#include <devices/device_settings.h>
#include <program_fixtures.h>
#include <cstring>
#include <memory>

using namespace program;
struct FakeDevices : Devices
{
    bool on = false, valid = true;
    double sensor = 100;
    int writes = 0, offs = 0, reads = 0;
    int resolve(const char *id, bool output) const override
    {
        return strcmp(id, output ? "led_red" : "distance") == 0 ? 0 : -1;
    }
    bool read(int, double &value) override
    {
        ++reads;
        value = sensor;
        return valid;
    }
    void set(int, bool value) override
    {
        on = value;
        ++writes;
    }
    void allOff() override
    {
        on = false;
        ++offs;
    }
};
struct FakeClock : Clock
{
    uint32_t ms = 0, us = 0, usStep = 0;
    uint32_t millisNow() const override { return ms; }
    uint32_t microsNow() const override
    {
        auto value = us;
        const_cast<FakeClock *>(this)->us += usStep;
        return value;
    }
};
static FakeDevices devices;
static FakeClock clockSource;
static std::unique_ptr<Program> compiled;
static std::unique_ptr<Engine> engine;
static JsonDocument fixtures;
static bool stopped;
static bool shouldStop(void *) { return stopped; }

void setUp()
{
    devices = FakeDevices{};
    clockSource = FakeClock{};
    stopped = false;
    compiled.reset(new Program());
    engine.reset(new Engine(devices, clockSource, shouldStop, nullptr));
}
void tearDown()
{
    engine.reset();
    compiled.reset();
}
static void load(const char *name)
{
    for (JsonObject fixture : fixtures.as<JsonArray>())
        if (strcmp(fixture["name"], name) == 0)
        {
            Error error;
            TEST_ASSERT_TRUE_MESSAGE(validate(fixture["program"], devices, *compiled, error), error.message ? error.message : "validation failed");
            engine->start(*compiled);
            return;
        }
    TEST_FAIL_MESSAGE("fixture missing");
}
static void tickUntilDone(int limit = 100)
{
    while (engine->state() == EngineState::Running && limit-- > 0)
        engine->tick();
}
static void test_shared_validation()
{
    for (JsonObject fixture : fixtures.as<JsonArray>())
    {
        Error error;
        TEST_ASSERT_EQUAL_MESSAGE(fixture["valid"].as<bool>(), validate(fixture["program"], devices, *compiled, error), fixture["name"]);
        if (!fixture["valid"].as<bool>())
            TEST_ASSERT_NOT_NULL(error.code);
    }
}
static void test_sequence_wait_and_completion()
{
    devices.on = true;
    load("sequence");
    TEST_ASSERT_FALSE(devices.on);
    TEST_ASSERT_EQUAL(1, devices.offs);
    engine->tick();
    TEST_ASSERT_TRUE(devices.on);
    clockSource.ms = 999;
    engine->tick();
    TEST_ASSERT_TRUE(devices.on);
    clockSource.ms = 1000;
    tickUntilDone();
    TEST_ASSERT_FALSE(devices.on);
    TEST_ASSERT_EQUAL(2, devices.writes);
    TEST_ASSERT_EQUAL((int)EngineState::Completed, (int)engine->state());
    TEST_ASSERT_EQUAL(1, devices.offs); // Normal completion does not perform a reset.
}
static void test_completion_keeps_output()
{
    load("if_else");
    tickUntilDone();
    TEST_ASSERT_TRUE(devices.on);
    TEST_ASSERT_EQUAL(1, devices.offs);
}
static void test_repeat()
{
    load("repeat");
    engine->tick();
    TEST_ASSERT_TRUE(devices.on);
    clockSource.ms = 1;
    engine->tick();
    TEST_ASSERT_TRUE(devices.on);
    clockSource.ms = 2;
    tickUntilDone();
    TEST_ASSERT_FALSE(devices.on);
    TEST_ASSERT_EQUAL(4, devices.writes);
}
static void test_short_circuit_does_not_read_bad_sensor()
{
    devices.valid = false;
    load("short_circuit");
    tickUntilDone();
    TEST_ASSERT_EQUAL(0, devices.reads);
    TEST_ASSERT_EQUAL((int)EngineState::Completed, (int)engine->state());
}
static void test_sensor_failure_waits_and_resumes()
{
    devices.valid = false;
    load("if_else");
    devices.on = true; // Set after start's allOff to observe that waiting keeps outputs.
    tickUntilDone(10);
    TEST_ASSERT_EQUAL((int)EngineState::Running, (int)engine->state());
    TEST_ASSERT_NOT_NULL(engine->sensorWait());
    TEST_ASSERT_EQUAL_STRING("distance", engine->sensorWait()->blockId);
    TEST_ASSERT_EQUAL(10, devices.reads); // One read per tick, then yields.
    TEST_ASSERT_TRUE(devices.on);
    TEST_ASSERT_EQUAL(1, devices.offs);
    TEST_ASSERT_EQUAL(0, devices.writes);
    devices.valid = true;
    devices.sensor = 300;
    tickUntilDone();
    TEST_ASSERT_EQUAL((int)EngineState::Completed, (int)engine->state());
    TEST_ASSERT_NULL(engine->sensorWait());
    TEST_ASSERT_FALSE(devices.on); // The else branch ran with the recovered value.
}
static void test_stop_while_waiting_for_sensor()
{
    devices.valid = false;
    load("if_else");
    engine->tick();
    TEST_ASSERT_NOT_NULL(engine->sensorWait());
    stopped = true;
    engine->tick();
    TEST_ASSERT_EQUAL((int)EngineState::Stopped, (int)engine->state());
    TEST_ASSERT_NULL(engine->sensorWait());
    TEST_ASSERT_EQUAL(2, devices.offs);
}
static void test_arithmetic_failure()
{
    load("division_by_zero_runtime");
    tickUntilDone();
    TEST_ASSERT_EQUAL((int)EngineState::Error, (int)engine->state());
    TEST_ASSERT_EQUAL_STRING("divide", engine->error().blockId);
}
static void test_empty_forever_budget_and_stop()
{
    load("empty_forever");
    engine->tick();
    TEST_ASSERT_EQUAL((int)EngineState::Running, (int)engine->state());
    TEST_ASSERT_LESS_OR_EQUAL(64, engine->lastSteps());
    stopped = true;
    engine->tick();
    TEST_ASSERT_EQUAL((int)EngineState::Stopped, (int)engine->state());
    TEST_ASSERT_EQUAL(2, devices.offs);
}
static void test_stop_while_waiting()
{
    load("sequence");
    engine->tick();
    stopped = true;
    engine->tick();
    TEST_ASSERT_FALSE(devices.on);
    TEST_ASSERT_EQUAL((int)EngineState::Stopped, (int)engine->state());
}
static void test_wait_handles_millis_wrap()
{
    clockSource.ms = 0xffffff00;
    load("sequence");
    engine->tick();
    clockSource.ms += 999;
    engine->tick();
    TEST_ASSERT_TRUE(devices.on);
    ++clockSource.ms;
    tickUntilDone();
    TEST_ASSERT_FALSE(devices.on);
}
static void test_time_budget()
{
    clockSource.usStep = 250;
    load("empty_forever");
    engine->tick();
    TEST_ASSERT_LESS_OR_EQUAL(4, engine->lastSteps());
    TEST_ASSERT_EQUAL((int)EngineState::Running, (int)engine->state());
}
static void test_until()
{
    load("until");
    tickUntilDone();
    TEST_ASSERT_EQUAL((int)EngineState::Completed, (int)engine->state());
}
static void test_sensor_freshness_and_epsilon()
{
    SensorSample previous{10.0f, 0xffffff00, SensorStatus::Ok};
    TEST_ASSERT_EQUAL((int)SensorStatus::Ok, (int)freshSample(previous, previous.updatedAt + 999).status);
    TEST_ASSERT_EQUAL((int)SensorStatus::Stale, (int)freshSample(previous, previous.updatedAt + 1000).status);
    SensorSample latest{10.01f, 50, SensorStatus::Ok};
    TEST_ASSERT_FALSE(sensorChanged(previous, latest, 0.05f));
    latest.value = 10.06f;
    TEST_ASSERT_TRUE(sensorChanged(previous, latest, 0.05f));
    latest = previous;
    latest.status = SensorStatus::Unavailable;
    TEST_ASSERT_TRUE(sensorChanged(previous, latest, 0.05f));
}
static void test_start_stop_admission()
{
    Lifecycle life;
    TEST_ASSERT_TRUE(life.acceptStart());
    TEST_ASSERT_FALSE(life.acceptStart());
    TEST_ASSERT_EQUAL(1, life.snapshot().runId);
    TEST_ASSERT_EQUAL(1, life.snapshot().revision);
    life.requestStop();
    TEST_ASSERT_FALSE(life.markRunning());
    auto revision = life.snapshot().revision;
    life.requestStop();
    TEST_ASSERT_EQUAL(revision, life.snapshot().revision);
    life.finish(EngineState::Stopped, Error{});
    TEST_ASSERT_FALSE(life.active());
    TEST_ASSERT_TRUE(life.acceptStart());
    TEST_ASSERT_EQUAL(2, life.snapshot().runId);
    TEST_ASSERT_TRUE(life.markRunning());
    life.finish(EngineState::Completed, Error{});
    TEST_ASSERT_EQUAL((int)RunStatus::Completed, (int)life.snapshot().state);
}
static void test_waiting_sensor_revisions_and_clears()
{
    Lifecycle life;
    TEST_ASSERT_TRUE(life.acceptStart());
    TEST_ASSERT_TRUE(life.markRunning());
    const auto revision = life.snapshot().revision;
    TEST_ASSERT_FALSE(life.setWaiting(nullptr, nullptr));
    TEST_ASSERT_TRUE(life.setWaiting("distance", "d"));
    TEST_ASSERT_EQUAL(revision + 1, life.snapshot().revision);
    TEST_ASSERT_FALSE(life.setWaiting("distance", "d"));
    TEST_ASSERT_TRUE(life.setWaiting("distance", "d2"));
    TEST_ASSERT_TRUE(life.setWaiting(nullptr, nullptr));
    TEST_ASSERT_NULL(life.snapshot().waiting.deviceId);
    TEST_ASSERT_TRUE(life.setWaiting("distance", "d"));
    life.requestStop();
    life.finish(EngineState::Stopped, Error{});
    TEST_ASSERT_NULL(life.snapshot().waiting.deviceId);
    TEST_ASSERT_EQUAL_STRING("", life.snapshot().waiting.blockId);
}
static void test_stop_cancels_a_partially_received_run()
{
    Lifecycle life;
    const uint32_t epoch = life.stopEpoch();
    life.requestStop();
    life.finish(EngineState::Stopped, Error{});
    TEST_ASSERT_FALSE(life.acceptStart(epoch));
    TEST_ASSERT_TRUE(life.acceptStart(life.stopEpoch()));
}
static void test_strict_json_input()
{
    JsonDocument doc;
    const char *good = "{\"version\":1,\"body\":[]} \n\t";
    TEST_ASSERT_FALSE((bool)parseProgramJson(doc, good, strlen(good)));
    const char *bad = "{\"version\":1,\"body\":[]} garbage";
    TEST_ASSERT_TRUE((bool)parseProgramJson(doc, bad, strlen(bad)));
    TEST_ASSERT_TRUE((bool)parseProgramJson(doc, good, 5));
}
static void test_state_json_owns_error_block_id()
{
    JsonDocument doc;
    RunSnapshot snapshot;
    snapshot.error.code = "division_by_zero";
    snapshot.error.message = "Cannot divide by zero";
    strcpy(snapshot.error.blockId, "divide");
    writeState(doc.to<JsonVariant>(), "test-boot", snapshot);
    // HTTP serializes after the temporary snapshot has gone out of scope.
    memset(snapshot.error.blockId, 'x', 6);
    TEST_ASSERT_EQUAL_STRING("divide", doc["error"]["blockId"].as<const char *>());
}
static void test_state_json_serializes_after_snapshot_destruction()
{
    JsonDocument doc;
    {
        RunSnapshot snapshot;
        snapshot.state = RunStatus::Error;
        snapshot.runId = 7;
        snapshot.revision = 9;
        snapshot.error.code = "arithmetic_error";
        snapshot.error.message = "Cannot divide by zero";
        strcpy(snapshot.error.blockId, "divide");
        writeState(doc.to<JsonVariant>(), "test-boot", snapshot);
        memset(snapshot.error.blockId, 'x', 6);
    }
    char json[512];
    serializeJson(doc, json, sizeof(json));
    JsonDocument decoded;
    TEST_ASSERT_FALSE((bool)deserializeJson(decoded, json));
    TEST_ASSERT_EQUAL_STRING("test-boot", decoded["bootId"].as<const char *>());
    TEST_ASSERT_EQUAL(7, decoded["runId"].as<int>());
    TEST_ASSERT_EQUAL(9, decoded["revision"].as<int>());
    TEST_ASSERT_EQUAL_STRING("error", decoded["state"].as<const char *>());
    TEST_ASSERT_EQUAL_STRING("arithmetic_error", decoded["error"]["code"].as<const char *>());
    TEST_ASSERT_EQUAL_STRING("Cannot divide by zero", decoded["error"]["message"].as<const char *>());
    TEST_ASSERT_EQUAL_STRING("divide", decoded["error"]["blockId"].as<const char *>());
    writeState(doc.to<JsonVariant>(), "test-boot", RunSnapshot{});
    TEST_ASSERT_TRUE(doc["error"].isNull());
    TEST_ASSERT_TRUE(doc["waiting"].isNull());
}
static void test_state_json_owns_waiting_sensor()
{
    JsonDocument doc;
    {
        RunSnapshot snapshot;
        snapshot.state = RunStatus::Running;
        snapshot.waiting.deviceId = "distance";
        strcpy(snapshot.waiting.blockId, "sensor");
        writeState(doc.to<JsonVariant>(), "test-boot", snapshot);
        memset(snapshot.waiting.blockId, 'x', 6);
    }
    TEST_ASSERT_TRUE(doc["error"].isNull());
    TEST_ASSERT_EQUAL_STRING("distance", doc["waiting"]["deviceId"].as<const char *>());
    TEST_ASSERT_EQUAL_STRING("sensor", doc["waiting"]["blockId"].as<const char *>());
}
static void test_failure_json_owns_diagnostics()
{
    JsonDocument doc;
    char code[] = "invalid_program", message[] = "Invalid input", blockId[] = "invalid-block";
    writeFailure(doc.to<JsonVariant>(), code, message, blockId);
    memset(code, 'x', strlen(code));
    memset(message, 'x', strlen(message));
    memset(blockId, 'x', strlen(blockId));
    char json[512];
    serializeJson(doc, json, sizeof(json));
    JsonDocument decoded;
    TEST_ASSERT_FALSE((bool)deserializeJson(decoded, json));
    TEST_ASSERT_EQUAL_STRING("invalid_program", decoded["error"].as<const char *>());
    TEST_ASSERT_EQUAL_STRING("Invalid input", decoded["message"].as<const char *>());
    TEST_ASSERT_EQUAL_STRING("invalid-block", decoded["blockId"].as<const char *>());
    writeFailure(doc.to<JsonVariant>(), "bad_request", "Invalid JSON");
    TEST_ASSERT_TRUE(doc["blockId"].isNull());
}
static void test_sensor_diagnostic_history()
{
    SensorDiagnosticHistory history;
    TEST_ASSERT_FALSE(history.hasGood);
    history.record(false, 10);
    TEST_ASSERT_EQUAL(1, history.consecutiveFailures);
    history.record(true, 20);
    TEST_ASSERT_TRUE(history.hasGood);
    TEST_ASSERT_EQUAL(20, history.lastGoodAt);
    TEST_ASSERT_EQUAL(0, history.consecutiveFailures);
    history.record(false, 30);
    history.record(false, 40);
    TEST_ASSERT_EQUAL(2, history.consecutiveFailures);
    TEST_ASSERT_EQUAL(3, history.totalFailures);
    TEST_ASSERT_EQUAL(20, history.lastGoodAt);
}
static void test_sensor_diagnostic_log_transitions()
{
    SensorDiagnosticHistory history;
    TEST_ASSERT_TRUE(history.shouldLog(0, 0));
    TEST_ASSERT_FALSE(history.shouldLog(0, 5000));
    TEST_ASSERT_TRUE(history.shouldLog(4, 5001));
    TEST_ASSERT_FALSE(history.shouldLog(4, 5100));
    TEST_ASSERT_TRUE(history.shouldLog(4, 6001));
    TEST_ASSERT_TRUE(history.shouldLog(2, 6002));
    TEST_ASSERT_TRUE(history.shouldLog(0, 6003));
    TEST_ASSERT_FALSE(history.shouldLog(0, 9000));
}
static void test_sensor_diagnostic_log_clock_wrap()
{
    SensorDiagnosticHistory history;
    TEST_ASSERT_TRUE(history.shouldLog(4, 0xffffff00));
    TEST_ASSERT_FALSE(history.shouldLog(4, uint32_t(0xffffff00 + 999u)));
    TEST_ASSERT_TRUE(history.shouldLog(4, uint32_t(0xffffff00 + 1000u)));
}
static void test_distance_holds_only_previous_good_value()
{
    SensorSample sample{74, 100, SensorStatus::Ok};
    sample = updateDistanceSample(sample, DistanceReadResult::TransientFailure, 1900, 200);
    TEST_ASSERT_EQUAL((int)SensorStatus::Held, (int)sample.status);
    TEST_ASSERT_EQUAL_FLOAT(74, sample.value);
    TEST_ASSERT_EQUAL(100, sample.updatedAt);
    TEST_ASSERT_TRUE(sensorValueUsable(sample));
    sample = updateDistanceSample(sample, DistanceReadResult::TransientFailure, 222, 1099);
    TEST_ASSERT_EQUAL((int)SensorStatus::Held, (int)sample.status);
    TEST_ASSERT_EQUAL(100, sample.updatedAt);
    sample = updateDistanceSample(sample, DistanceReadResult::NoData, 0, 1100);
    TEST_ASSERT_EQUAL((int)SensorStatus::Stale, (int)sample.status);
    TEST_ASSERT_FALSE(sensorValueUsable(sample));
}
static void test_distance_failure_never_invents_or_resurrects_value()
{
    auto empty = updateDistanceSample(SensorSample{}, DistanceReadResult::TransientFailure, 5, 100);
    TEST_ASSERT_EQUAL((int)SensorStatus::Unavailable, (int)empty.status);
    SensorSample sample{50, 100, SensorStatus::Ok};
    sample = updateDistanceSample(sample, DistanceReadResult::FatalFailure, 0, 200);
    TEST_ASSERT_EQUAL((int)SensorStatus::Unavailable, (int)sample.status);
    sample = updateDistanceSample(sample, DistanceReadResult::TransientFailure, 300, 300);
    TEST_ASSERT_EQUAL((int)SensorStatus::Unavailable, (int)sample.status);
    sample = updateDistanceSample(sample, DistanceReadResult::Valid, 90, 400);
    TEST_ASSERT_EQUAL((int)SensorStatus::Ok, (int)sample.status);
    TEST_ASSERT_EQUAL_FLOAT(90, sample.value);
    TEST_ASSERT_EQUAL(400, sample.updatedAt);
}
static void test_distance_held_clock_wrap_and_notifications()
{
    SensorSample good{10, 0xffffff00, SensorStatus::Ok};
    const auto held = updateDistanceSample(good, DistanceReadResult::TransientFailure, 0, uint32_t(good.updatedAt + 999));
    TEST_ASSERT_TRUE(sensorValueUsable(held));
    TEST_ASSERT_TRUE(sensorChanged(good, held, 1));
    TEST_ASSERT_TRUE(sensorChanged(held, good, 1));
    TEST_ASSERT_EQUAL_STRING("held", sensorStatusName(held.status));
    const auto stale = freshSample(held, uint32_t(good.updatedAt + 1000));
    TEST_ASSERT_EQUAL((int)SensorStatus::Stale, (int)stale.status);
    TEST_ASSERT_TRUE(sensorChanged(held, stale, 1));
}
static void test_engine_uses_held_value_and_waits_at_expiry()
{
    struct SampleDevices : FakeDevices
    {
        SensorSample sample{100, 0, SensorStatus::Ok};
        uint32_t now = 0;
        bool read(int, double &value) override
        {
            ++reads;
            sample = freshSample(sample, now);
            value = sample.value;
            return sensorValueUsable(sample);
        }
    } hardware;
    JsonDocument doc;
    deserializeJson(doc, R"({"version":1,"body":[{"type":"forever","blockId":"loop","body":[{"type":"if","blockId":"if","condition":{"type":"compare","blockId":"c","op":"LT","left":{"type":"sensor","blockId":"distance","deviceId":"distance"},"right":{"type":"number","blockId":"n","value":200}},"then":[{"type":"set_output","blockId":"on","deviceId":"led_red","on":true}],"else":[]},{"type":"wait","blockId":"w","ms":0}]}]})");
    Error error;
    TEST_ASSERT_TRUE(validate(doc.as<JsonVariantConst>(), hardware, *compiled, error));
    engine.reset(new Engine(hardware, clockSource, shouldStop, nullptr));
    engine->start(*compiled);
    hardware.sample = updateDistanceSample(hardware.sample, DistanceReadResult::TransientFailure, 3000, 999);
    hardware.now = 999;
    engine->tick();
    TEST_ASSERT_TRUE(hardware.on);
    TEST_ASSERT_EQUAL((int)EngineState::Running, (int)engine->state());
    hardware.now = 1000;
    engine->tick();
    TEST_ASSERT_EQUAL((int)EngineState::Running, (int)engine->state());
    TEST_ASSERT_NOT_NULL(engine->sensorWait());
    TEST_ASSERT_TRUE(hardware.on);
    hardware.sample = updateDistanceSample(hardware.sample, DistanceReadResult::Valid, 50, 1100);
    hardware.now = 1100;
    engine->tick();
    TEST_ASSERT_EQUAL((int)EngineState::Running, (int)engine->state());
    TEST_ASSERT_NULL(engine->sensorWait());
    engine.reset(); // Hardware lifetime must exceed the engine's lifetime.
}
// 部品リストの規則。画面側（frontend/tests/settings.test.ts）と同じ判定を確かめる。
#define KIT_PARTS R"({"id":"led_red","type":"led","label":"赤色LED","pins":[5]},{"id":"temperature","type":"thermo","label":"温度","pins":[21,22]},{"id":"distance","type":"tof","label":"距離","pins":[21,22]})"
static const char *partListProblem(const char *json)
{
    static char message[160];
    static PartList list;
    message[0] = '\0';
    JsonDocument doc;
    TEST_ASSERT_FALSE((bool)deserializeJson(doc, json));
    return readPartList(doc.as<JsonVariantConst>(), list, message, sizeof(message)) ? nullptr : message;
}
static void assertProblem(const char *json, const char *expected)
{
    const char *problem = partListProblem(json);
    TEST_ASSERT_NOT_NULL_MESSAGE(problem, json);
    TEST_ASSERT_NOT_NULL_MESSAGE(strstr(problem, expected), problem);
}
static void test_default_part_list_round_trips()
{
    static PartList original, restored;
    char message[160] = {};
    defaultPartList(original);
    TEST_ASSERT_TRUE_MESSAGE(validatePartList(original, message, sizeof(message)), message);
    JsonDocument doc;
    writePartList(doc.to<JsonVariant>(), original);
    writeCandidatePins(doc.as<JsonVariant>());
    // 保存・応答は書き出した後でシリアライズする。元の文字列を壊しても中身が残ること。
    strcpy(original.parts[0].label, "xxx");
    TEST_ASSERT_TRUE_MESSAGE(readPartList(doc.as<JsonVariantConst>(), restored, message, sizeof(message)), message);
    TEST_ASSERT_EQUAL(8, restored.count);
    TEST_ASSERT_EQUAL_STRING("白色LED", restored.parts[0].label);
    TEST_ASSERT_EQUAL_STRING("distance", restored.parts[7].id);
    TEST_ASSERT_EQUAL(21, restored.parts[7].pins[0]);
    TEST_ASSERT_EQUAL(22, restored.parts[7].pins[1]);
    TEST_ASSERT_EQUAL(2, doc["candidatePins"][0].as<int>());
}
static void test_part_list_rules()
{
    TEST_ASSERT_NULL(partListProblem(R"({"parts":[)" KIT_PARTS "]}"));
    // 最初のキットの部品も特別扱いしない。センサを外せばSDA・SCLだったピンを使える。
    TEST_ASSERT_NULL(partListProblem(R"({"parts":[{"id":"led_red","type":"led","label":"赤","pins":[21]}]})"));
    assertProblem(R"({"parts":[)" KIT_PARTS R"(,{"id":"led_2","type":"led","label":"LED 2","pins":[5]}]})", "「赤色LED」と「LED 2」");
    assertProblem(R"({"parts":[)" KIT_PARTS R"(,{"id":"led_2","type":"led","label":"LED 2","pins":[12]}]})", "使えないピン");
    assertProblem(R"({"parts":[)" KIT_PARTS R"(,{"id":"temperature_2","type":"thermo","label":"温度 2","pins":[21,22]}]})", "温度センサは1個まで");
    assertProblem(R"({"parts":[)" KIT_PARTS R"(,{"id":"temperature_2","type":"thermo","label":"温度 2","pins":[22,21]}]})", "重なって");
    // 2組目のI2Cには、同じ種類のセンサをもう1個つなげる。3組目は使えない。
    TEST_ASSERT_NULL(partListProblem(R"({"parts":[)" KIT_PARTS R"(,{"id":"temperature_2","type":"thermo","label":"温度 2","pins":[25,26]},{"id":"distance_2","type":"tof","label":"距離 2","pins":[25,26]}]})"));
    assertProblem(R"({"parts":[)" KIT_PARTS R"(,{"id":"temperature_2","type":"thermo","label":"温度 2","pins":[25,26]},{"id":"distance_2","type":"tof","label":"距離 2","pins":[25,26]},{"id":"temperature_3","type":"thermo","label":"温度 3","pins":[27,32]}]})", "2組まで");
    assertProblem(R"({"parts":[{"id":"temperature","type":"thermo","label":"温度","pins":[25,25]}]})", "別のピン");
    assertProblem(R"({"parts":[{"id":"temperature","type":"thermo","label":"温度","pins":[25]}]})", "ピンを選んで");
    assertProblem(R"({"parts":[{"id":"led_2","type":"led","label":"A","pins":[13]},{"id":"led_3","type":"led","label":"A","pins":[14]}]})", "名前が重なって");
    assertProblem(R"({"parts":[{"id":"led_2","type":"led","label":"A","pins":[13]},{"id":"led_2","type":"led","label":"B","pins":[14]}]})", "部品ID");
    assertProblem(R"({"parts":[{"id":"LED","type":"led","label":"A","pins":[13]}]})", "部品ID");
    assertProblem(R"({"parts":[{"id":"led_2","type":"led","label":"  ","pins":[13]}]})", "名前が空");
    assertProblem(R"({"parts":[{"id":"led_2","type":"lamp","label":"A","pins":[13]}]})", "種類が不正");
    assertProblem(R"({"parts":[{"id":"led_2","type":"led","label":"A","pins":[1.5]}]})", "ピンが不正");
    assertProblem(R"({"devices":[]})", "parts");
}
int runTests()
{
    UNITY_BEGIN();
    auto error = deserializeJson(fixtures, PROGRAM_FIXTURES, DeserializationOption::NestingLimit(64));
    TEST_ASSERT_FALSE((bool)error);
    RUN_TEST(test_shared_validation);
    RUN_TEST(test_sequence_wait_and_completion);
    RUN_TEST(test_completion_keeps_output);
    RUN_TEST(test_repeat);
    RUN_TEST(test_short_circuit_does_not_read_bad_sensor);
    RUN_TEST(test_sensor_failure_waits_and_resumes);
    RUN_TEST(test_stop_while_waiting_for_sensor);
    RUN_TEST(test_arithmetic_failure);
    RUN_TEST(test_empty_forever_budget_and_stop);
    RUN_TEST(test_stop_while_waiting);
    RUN_TEST(test_wait_handles_millis_wrap);
    RUN_TEST(test_time_budget);
    RUN_TEST(test_until);
    RUN_TEST(test_sensor_freshness_and_epsilon);
    RUN_TEST(test_start_stop_admission);
    RUN_TEST(test_waiting_sensor_revisions_and_clears);
    RUN_TEST(test_stop_cancels_a_partially_received_run);
    RUN_TEST(test_strict_json_input);
    RUN_TEST(test_state_json_owns_error_block_id);
    RUN_TEST(test_state_json_serializes_after_snapshot_destruction);
    RUN_TEST(test_state_json_owns_waiting_sensor);
    RUN_TEST(test_failure_json_owns_diagnostics);
    RUN_TEST(test_sensor_diagnostic_history);
    RUN_TEST(test_sensor_diagnostic_log_transitions);
    RUN_TEST(test_sensor_diagnostic_log_clock_wrap);
    RUN_TEST(test_distance_holds_only_previous_good_value);
    RUN_TEST(test_distance_failure_never_invents_or_resurrects_value);
    RUN_TEST(test_distance_held_clock_wrap_and_notifications);
    RUN_TEST(test_engine_uses_held_value_and_waits_at_expiry);
    RUN_TEST(test_default_part_list_round_trips);
    RUN_TEST(test_part_list_rules);
    return UNITY_END();
}
#ifdef ARDUINO
void setup()
{
    delay(1500);
    runTests();
}
void loop() { delay(100); }
#else
int main() { return runTests(); }
#endif
