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
constexpr uint32_t SENSOR_MAX_AGE_MS = 1000;
struct SensorSample
{
    float value;
    uint32_t updatedAt;
    SensorStatus status;
    SensorSample(float value = 0, uint32_t updatedAt = 0, SensorStatus status = SensorStatus::Unavailable)
        : value(value), updatedAt(updatedAt), status(status) {}
};
inline SensorSample freshSample(SensorSample sample, uint32_t now)
{
    if ((sample.status == SensorStatus::Ok || sample.status == SensorStatus::Held) && static_cast<uint32_t>(now - sample.updatedAt) >= SENSOR_MAX_AGE_MS)
        sample.status = SensorStatus::Stale;
    return sample;
}
// Apply freshSample first when consuming a stored snapshot.
inline bool sensorValueUsable(const SensorSample &sample)
{
    return (sample.status == SensorStatus::Ok || sample.status == SensorStatus::Held) && std::isfinite(sample.value);
}
inline bool sensorChanged(const SensorSample &published, const SensorSample &latest, float epsilon)
{
    return published.status != latest.status || (sensorValueUsable(latest) && std::fabs(published.value - latest.value) >= epsilon);
}
inline const char *sensorStatusName(SensorStatus status)
{
    return status == SensorStatus::Ok ? "ok" : status == SensorStatus::Held ? "held"
                                           : status == SensorStatus::Stale  ? "stale"
                                                                            : "unavailable";
}
