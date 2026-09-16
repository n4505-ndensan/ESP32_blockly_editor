"""Exercise program execution on the connected board; always finish with all outputs OFF.

Usage: python scripts/test_program_api.py http://<ESP32 IP>
"""
import argparse
import http.client
import json
from pathlib import Path
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("url")
args = parser.parse_args()
base = args.url.rstrip("/")
fixtures = json.loads((Path(__file__).resolve().parents[1] / "shared/program-fixtures.json").read_text(encoding="utf-8"))

def request(path, body=None, raw=None):
    data = raw if raw is not None else None if body is None else json.dumps(body, separators=(",", ":")).encode()
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def program(*body):
    return {"version": 1, "body": list(body)}

on = {"type": "set_output", "blockId": "on", "deviceId": "led_red", "on": True}
forever = {"type": "forever", "blockId": "forever", "body": []}

class ProgramApiTests(unittest.TestCase):
    def setUp(self):
        request("/api/program/stop", {})
        self.wait_state("stopped")

    def tearDown(self):
        request("/api/program/stop", {})
        self.wait_state("stopped")

    def wait_state(self, *states):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            code, state = request("/api/program/state")
            self.assertEqual(200, code)
            if state["state"] in states:
                return state
            time.sleep(0.01)
        self.fail(f"did not reach {states}: {state}")

    def outputs(self):
        code, payload = request("/api/devices")
        self.assertEqual(200, code)
        return {d["id"]: d["state"]["on"] for d in payload["devices"] if d["kind"] == "output"}

    def test_normal_completion_retains_output(self):
        code, accepted = request("/api/program/run", program(on))
        self.assertEqual(202, code, accepted)
        state = self.wait_state("completed")
        self.assertEqual(accepted["runId"], state["runId"])
        self.assertTrue(self.outputs()["led_red"])

    def test_busy_and_stop(self):
        self.assertEqual(202, request("/api/program/run", program(on, forever))[0])
        self.wait_state("running")
        self.assertEqual(409, request("/api/program/run", program(on))[0])
        self.assertEqual(409, request("/api/devices/command", {"id": "led_red", "action": "set", "on": False})[0])
        started = time.perf_counter()
        self.assertEqual(202, request("/api/program/stop", {})[0])
        self.wait_state("stopped")
        self.assertFalse(any(self.outputs().values()))
        print(f"stop + state/output HTTP round trips: {(time.perf_counter() - started) * 1000:.1f} ms")

    def test_stop_during_wait(self):
        self.assertEqual(202, request("/api/program/run", program(on, {"type": "wait", "blockId": "wait", "ms": 100000}))[0])
        self.wait_state("running")
        request("/api/program/stop", {})
        self.wait_state("stopped")
        self.assertFalse(any(self.outputs().values()))

    def test_invalid_ast_preserves_outputs(self):
        self.assertEqual(200, request("/api/devices/command", {"id": "led_red", "action": "set", "on": True})[0])
        for fixture in fixtures:
            if not fixture["valid"]:
                with self.subTest(fixture=fixture["name"]):
                    self.assertEqual(422, request("/api/program/run", fixture["program"])[0])
                    self.assertTrue(self.outputs()["led_red"])
        self.assertEqual(400, request("/api/program/run", raw=b'{"version":')[0])
        self.assertEqual(400, request("/api/program/run", raw=json.dumps(program(on)).encode() + b' garbage')[0])
        self.assertEqual(413, request("/api/program/run", raw=b' ' * 32769)[0])

    def test_runtime_error_turns_everything_off(self):
        ast = next(f["program"] for f in fixtures if f["name"] == "division_by_zero_runtime")
        ast = program(on, *ast["body"])
        self.assertEqual(202, request("/api/program/run", ast)[0])
        state = self.wait_state("error")
        self.assertEqual("divide", state["error"]["blockId"])
        self.assertFalse(any(self.outputs().values()))

    def test_fragmented_request_and_cancelled_upload(self):
        target = urllib.parse.urlparse(base)
        data = json.dumps(program(on, forever)).encode()
        for cancel in (False, True):
            connection = http.client.HTTPConnection(target.hostname, target.port or 80, timeout=8)
            try:
                connection.putrequest("POST", "/api/program/run")
                connection.putheader("Content-Type", "application/json")
                connection.putheader("Content-Length", str(len(data)))
                connection.endheaders()
                connection.send(data[:40]); time.sleep(0.08)
                if cancel:
                    request("/api/program/stop", {}); self.wait_state("stopped")
                for offset in range(40, len(data), 23):
                    connection.send(data[offset:offset + 23]); time.sleep(0.003)
                response = connection.getresponse(); response.read()
                self.assertEqual(409 if cancel else 202, response.status)
            finally:
                connection.close()
            if not cancel:
                # Closing the uploading browser connection does not stop execution.
                self.wait_state("running"); request("/api/program/stop", {}); self.wait_state("stopped")
            else:
                self.assertFalse(any(self.outputs().values()))

    def test_sse_reconnect_has_both_snapshots(self):
        self.assertEqual(202, request("/api/program/run", program(on, forever))[0])
        self.wait_state("running")
        for _ in range(2):
            # Match EventSource: ESPAsyncWebServer routes SSE by the Accept header.
            stream = urllib.request.Request(base + "/events", headers={"Accept": "text/event-stream"})
            with urllib.request.urlopen(stream, timeout=5) as response:
                found = {}
                name = ""
                for _ in range(100):
                    line = response.readline().decode().strip()
                    if line.startswith("event:"): name = line[6:].strip()
                    if line.startswith("data:") and name in ("devices", "program"): found[name] = json.loads(line[5:])
                    if len(found) == 2: break
                self.assertEqual({"devices", "program"}, set(found))
                self.assertEqual("running", found["program"]["state"])
                self.assertEqual(found["devices"]["bootId"], found["program"]["bootId"])

    def test_limits_and_repeated_runs(self):
        largest = program(*[{"type": "wait", "blockId": str(i), "ms": 0} for i in range(256)])
        code, accepted = request("/api/program/run", largest)
        self.assertEqual(202, code, accepted); self.wait_state("completed")
        largest["body"].append({"type": "wait", "blockId": "overflow", "ms": 0})
        self.assertEqual(413, request("/api/program/run", largest)[0])
        nested = {"type": "wait", "blockId": "w", "ms": 0}
        for i in range(15): nested = {"type": "repeat", "blockId": str(i), "count": {"type": "number", "blockId": "n", "value": 1}, "body": [nested]}
        self.assertEqual(202, request("/api/program/run", program(nested))[0]); self.wait_state("completed")
        boot = self.wait_state("completed")["bootId"]
        for _ in range(30):
            self.assertEqual(202, request("/api/program/run", program(on))[0]); self.wait_state("completed")
            request("/api/program/stop", {}); self.assertEqual(boot, self.wait_state("stopped")["bootId"])

    def test_live_sensor_conditions(self):
        # Exercise both branches with thresholds outside the physical range.
        # This checks real sensor reads, not manual threshold crossing by a person.
        _, catalog = request("/api/devices")
        sensors = {d["id"]: d["state"] for d in catalog["devices"] if d["kind"] == "sensor"}
        for sensor, output in (("distance", "led_red"), ("temperature", "buzzer")):
            self.assertEqual("ok", sensors[sensor]["status"], sensors[sensor])
            for threshold, expected in ((1000000, True), (-1000000, False)):
                condition = {"type": "compare", "blockId": "condition", "op": "LT",
                             "left": {"type": "sensor", "blockId": sensor, "deviceId": sensor},
                             "right": {"type": "number", "blockId": "threshold", "value": threshold}}
                branch = {"type": "if", "blockId": "if", "condition": condition,
                          "then": [{"type": "set_output", "blockId": "yes", "deviceId": output, "on": True}],
                          "else": [{"type": "set_output", "blockId": "no", "deviceId": output, "on": False}]}
                try:
                    self.assertEqual(202, request("/api/program/run", program(branch))[0])
                    self.wait_state("completed")
                    self.assertEqual(expected, self.outputs()[output])
                finally:
                    request("/api/program/stop", {}); self.wait_state("stopped")

if __name__ == "__main__":
    unittest.main(argv=[__file__], verbosity=2)
