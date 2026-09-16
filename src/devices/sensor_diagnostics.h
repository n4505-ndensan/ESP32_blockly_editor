#pragma once
#include <stdint.h>

// Observation only: never changes the sample used by the runtime or the UI.
struct SensorDiagnosticHistory
{
    bool hasGood = false;
    uint32_t lastGoodAt = 0, consecutiveFailures = 0, totalFailures = 0;
    void record(bool success, uint32_t now)
    {
        if (success)
        {
            hasGood = true;
            lastGoodAt = now;
            consecutiveFailures = 0;
        }
        else
        {
            if (consecutiveFailures != UINT32_MAX)
                ++consecutiveFailures;
            if (totalFailures != UINT32_MAX)
                ++totalFailures;
        }
    }
    // Key 0 = healthy. Log transitions immediately, persistent failures at 1Hz.
    bool shouldLog(uint16_t key, uint32_t now)
    {
        if (!logged || key != lastKey || (key != 0 && uint32_t(now - loggedAt) >= 1000))
        {
            logged = true;
            lastKey = key;
            loggedAt = now;
            return true;
        }
        return false;
    }

private:
    bool logged = false;
    uint16_t lastKey = 0;
    uint32_t loggedAt = 0;
};