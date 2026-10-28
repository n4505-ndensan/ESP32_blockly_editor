#pragma once
#include <cmath>
#include <stdint.h>

enum class SensorStatus : uint8_t
{
    Ok,
    Unavailable,
    Stale,
    Held
};
// Device-independent cause of an unusable value (ADR 0012). The runtime never reads it.
enum class SensorReason : uint8_t
{
    None,         // Last measurement was valid.
    NoTarget,     // Measured, but nothing usable in range.
    SensorFault,  // The device reported a fault or an unrecognized result.
    Disconnected, // No communication.
    NoData        // Communication works, but there is no usable value yet.
};
constexpr uint32_t SENSOR_MAX_AGE_MS = 1000;
struct SensorSample
{
    float value;
    uint32_t updatedAt;
    SensorStatus status;
    // Reason of the last failure. A held value keeps it so that it carries over to stale.
    SensorReason reason;
    // An ok sample never has a reason; any other defaults to no_data.
    SensorSample(float value = 0, uint32_t updatedAt = 0, SensorStatus status = SensorStatus::Unavailable, SensorReason reason = SensorReason::NoData)
        : value(value), updatedAt(updatedAt), status(status), reason(status == SensorStatus::Ok ? SensorReason::None : reason) {}
};
inline SensorSample freshSample(SensorSample sample, uint32_t now)
{
    if ((sample.status == SensorStatus::Ok || sample.status == SensorStatus::Held) && static_cast<uint32_t>(now - sample.updatedAt) >= SENSOR_MAX_AGE_MS)
    {
        sample.status = SensorStatus::Stale;
        if (sample.reason == SensorReason::None)
            sample.reason = SensorReason::NoData;
    }
    return sample;
}
// Apply freshSample first when consuming a stored snapshot.
inline bool sensorValueUsable(const SensorSample &sample)
{
    return (sample.status == SensorStatus::Ok || sample.status == SensorStatus::Held) && std::isfinite(sample.value);
}
inline bool sensorChanged(const SensorSample &published, const SensorSample &latest, float epsilon)
{
    return published.status != latest.status || published.reason != latest.reason ||
           (sensorValueUsable(latest) && std::fabs(published.value - latest.value) >= epsilon);
}
inline const char *sensorStatusName(SensorStatus status)
{
    return status == SensorStatus::Ok ? "ok" : status == SensorStatus::Held ? "held"
                                           : status == SensorStatus::Stale  ? "stale"
                                                                            : "unavailable";
}
// nullptr for None, which the API publishes as null.
inline const char *sensorReasonName(SensorReason reason)
{
    static const char *names[] = {nullptr, "no_target", "sensor_fault", "disconnected", "no_data"};
    return names[static_cast<uint8_t>(reason)];
}
