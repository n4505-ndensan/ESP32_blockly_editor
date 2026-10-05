#pragma once
#include "device_settings.h"

// 部品リストをNVS（Preferences）に置く。LittleFSは`uploadfs`で丸ごと上書きされ、設定が消えるため使わない。

// 保存が無い・読めない・規則に合わないときは、最初のキットの部品リストを返す。
void loadPartList(PartList &out);
bool savePartList(const PartList &list);
