#pragma once
#include <ESPAsyncWebServer.h>
void registerProgramApi(AsyncWebServer &server);
void sendProgramSnapshot(AsyncEventSourceClient *client);
void publishProgramChanges(AsyncEventSource &events);
