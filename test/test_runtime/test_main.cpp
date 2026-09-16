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
static void test_sensor_failure_stops_and_reports_source()
{
    devices.valid = false;
    load("if_else");
    tickUntilDone();
    TEST_ASSERT_EQUAL((int)EngineState::Error, (int)engine->state());
    TEST_ASSERT_EQUAL_STRING("sensor_unavailable", engine->error().code);
    TEST_ASSERT_EQUAL_STRING("distance", engine->error().blockId);
    TEST_ASSERT_FALSE(devices.on);
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
    RUN_TEST(test_sensor_failure_stops_and_reports_source);
    RUN_TEST(test_arithmetic_failure);
    RUN_TEST(test_empty_forever_budget_and_stop);
    RUN_TEST(test_stop_while_waiting);
    RUN_TEST(test_wait_handles_millis_wrap);
    RUN_TEST(test_time_budget);
    RUN_TEST(test_until);
    RUN_TEST(test_sensor_freshness_and_epsilon);
    RUN_TEST(test_start_stop_admission);
    RUN_TEST(test_stop_cancels_a_partially_received_run);
    RUN_TEST(test_strict_json_input);
    RUN_TEST(test_state_json_owns_error_block_id);
    RUN_TEST(test_state_json_serializes_after_snapshot_destruction);
    RUN_TEST(test_failure_json_owns_diagnostics);
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
