#pragma once
#include "lifecycle.h"
#include <devices/devices.h>
#include <memory>

void initProgramRuntime();
const char *programBootId();
const program::Devices &runtimeDevices();
uint32_t programStopEpoch();
bool submitProgram(std::unique_ptr<program::Program> &program, uint32_t stopEpoch, program::RunSnapshot &accepted);
program::RunSnapshot requestProgramStop();
program::RunSnapshot programSnapshot();
bool setManualDeviceOutput(size_t index, bool on, DeviceSnapshot &confirmed);
void tickProgram();

#ifdef PROGRAM_DIAGNOSTICS
struct ProgramDiagnostics { uint32_t stopSamples = 0, maxStopUs = 0; };
ProgramDiagnostics programDiagnostics();
#endif
