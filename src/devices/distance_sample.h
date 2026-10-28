#pragma once
#include "sensor_sample.h"

enum class DistanceReadResult
{
    Valid,
    TransientFailure,
    FatalFailure,
    NoData
};

// VL53L1X::RangeStatus of the Pololu library, whose header needs Wire. sensors.cpp checks the values match.
enum class DistanceRangeStatus : uint8_t
{
    RangeValid = 0,
    SigmaFail = 1,
    SignalFail = 2, // Device status MSRCNOTARGET.
    RangeValidMinRangeClipped = 3,
    OutOfBoundsFail = 4,
    HardwareFail = 5,
    RangeValidNoWrapCheckFail = 6,
    WrapTargetFail = 7,
    XtalkSignalFail = 9,
    SynchronizationInt = 10,
    MinRangeFail = 13,
    None = 255 // No update, or a raw status the library does not map.
};

// The parts of a VL53L1X read() that classification needs.
struct DistanceMeasurement
{
    uint8_t i2cStatus; // last_status after read()
    DistanceRangeStatus rangeStatus;
    uint16_t rangeMm;
    float signalMcps, ambientMcps;
};

struct DistanceClassification
{
    DistanceReadResult result;
    SensorReason reason;
};

// A failed results read leaves every byte 0xFF: an I2C read on ESP32 returns all bytes or none,
// and Wire.read() then returns -1. last_status stays 0 because read() ends with a successful write.
inline bool distanceReadFailed(const DistanceMeasurement &measurement)
{
    constexpr float failedRate = 0xFFFF / 128.0f;
    return measurement.rangeStatus == DistanceRangeStatus::None && measurement.rangeMm == (0xFFFFu * 2011 + 0x400) / 0x800 &&
           measurement.signalMcps == failedRate && measurement.ambientMcps == failedRate;
}

// The only place that maps VL53L1X results to a read result and a reason (ADR 0012).
inline DistanceClassification classifyDistance(const DistanceMeasurement &measurement)
{
    if (measurement.i2cStatus != 0)
        return {DistanceReadResult::FatalFailure, SensorReason::Disconnected};
    switch (measurement.rangeStatus)
    {
    case DistanceRangeStatus::RangeValid:
    case DistanceRangeStatus::RangeValidMinRangeClipped:
    case DistanceRangeStatus::RangeValidNoWrapCheckFail:
        return {DistanceReadResult::Valid, SensorReason::None};
    case DistanceRangeStatus::SignalFail:
    case DistanceRangeStatus::WrapTargetFail:
        return {DistanceReadResult::TransientFailure, SensorReason::NoTarget};
    case DistanceRangeStatus::SigmaFail:
    case DistanceRangeStatus::OutOfBoundsFail:
    case DistanceRangeStatus::XtalkSignalFail:
        return {DistanceReadResult::FatalFailure, SensorReason::NoTarget};
    case DistanceRangeStatus::None:
        if (distanceReadFailed(measurement))
            return {DistanceReadResult::FatalFailure, SensorReason::Disconnected};
        return {DistanceReadResult::FatalFailure, SensorReason::SensorFault};
    default: // HardwareFail, MinRangeFail, SynchronizationInt
        return {DistanceReadResult::FatalFailure, SensorReason::SensorFault};
    }
}

// reason is that of a failed measurement; Valid and NoData ignore it.
inline SensorSample updateDistanceSample(SensorSample previous, DistanceReadResult result, SensorReason reason, float value, uint32_t now)
{
    if (result == DistanceReadResult::Valid)
    {
        if (std::isfinite(value))
            return {value, now, SensorStatus::Ok};
        result = DistanceReadResult::FatalFailure;
        reason = SensorReason::SensorFault;
    }
    previous = freshSample(previous, now);
    if (result == DistanceReadResult::NoData)
        return previous;
    previous.reason = reason;
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
