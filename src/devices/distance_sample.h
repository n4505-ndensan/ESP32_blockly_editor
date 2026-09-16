#pragma once
#include "sensor_sample.h"

enum class DistanceReadResult
{
    Valid,
    TransientFailure,
    FatalFailure,
    NoData
};

inline SensorSample updateDistanceSample(SensorSample previous, DistanceReadResult result, float value, uint32_t now)
{
    if (result == DistanceReadResult::Valid)
    {
        if (std::isfinite(value))
            return {value, now, SensorStatus::Ok};
        result = DistanceReadResult::FatalFailure;
    }
    previous = freshSample(previous, now);
    if (result == DistanceReadResult::FatalFailure)
        previous.status = SensorStatus::Unavailable;
    else if (result == DistanceReadResult::TransientFailure && sensorValueUsable(previous))
    {
        // Retain only a currently usable value. Never revive a fatal/stale sample
        // or advance updatedAt based on a rejected measurement.
        previous.status = SensorStatus::Held;
    }
    return previous;
}