#pragma once
#include <cmath>
#include <stdint.h>

enum class SensorStatus : uint8_t { Ok, Unavailable, Stale };
struct SensorSample {
    float value;
    uint32_t updatedAt;
    SensorStatus status;
    SensorSample(float value = 0, uint32_t updatedAt = 0, SensorStatus status = SensorStatus::Unavailable)
        : value(value), updatedAt(updatedAt), status(status) {}
};
inline SensorSample freshSample(SensorSample sample, uint32_t now) {
    if (sample.status == SensorStatus::Ok && static_cast<uint32_t>(now - sample.updatedAt) >= 1000) sample.status = SensorStatus::Stale;
    return sample;
}
inline bool sensorChanged(const SensorSample &published, const SensorSample &latest, float epsilon) {
    return published.status != latest.status || (latest.status == SensorStatus::Ok && std::fabs(published.value - latest.value) >= epsilon);
}
inline const char *sensorStatusName(SensorStatus status) {
    return status == SensorStatus::Ok ? "ok" : status == SensorStatus::Stale ? "stale" : "unavailable";
}
