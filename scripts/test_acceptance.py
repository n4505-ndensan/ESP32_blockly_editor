"""Short hardware soak and stop-latency measurement using acceptance_test firmware.

Requires pyserial. Example: python scripts/test_acceptance.py http://<IP> --port COM7
Always attempts STOP on exit. The serial telemetry is absent in normal esp32dev firmware.
"""
import argparse
import json
from pathlib import Path
import queue
import statistics
import threading
import time
import urllib.request

import serial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--port", required=True)
    parser.add_argument("--duration", type=float, default=120)
    parser.add_argument("--cycles", type=int, default=100)
    parser.add_argument("--output", default=".pio/acceptance-report.json")
    args = parser.parse_args()
    if args.duration <= 0 or args.cycles < 1:
        parser.error("duration and cycles must be positive")
    base = args.url.rstrip("/")
    samples = []
    incoming = queue.Queue()
    done = threading.Event()
    report = {"durationSeconds": args.duration, "cycles": args.cycles, "passed": False}

    def request(path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.load(response)

    boot = request("/api/program/state")["bootId"]

    def state(expected):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            value = request("/api/program/state")
            assert value["bootId"] == boot, "ESP32 rebooted"
            if value["state"] == expected:
                return value
            assert value["state"] != "error", value
        raise AssertionError(f"State did not reach {expected}")

    def stop():
        request("/api/program/stop", {})
        state("stopped")
        outputs = request("/api/devices")["devices"]
        assert all(not d["state"]["on"] for d in outputs if d["kind"] == "output")

    def run(waiting=False):
        # Both cases keep an LED on so stopping must actually change a GPIO.
        tail = {"type": "wait", "blockId": "wait", "ms": 2147483647} if waiting else {"type": "forever", "blockId": "loop", "body": []}
        request("/api/program/run", {"version": 1, "body": [
            {"type": "set_output", "blockId": "on", "deviceId": "led_red", "on": True}, tail]})
        state("running")

    port = serial.Serial(port=None, baudrate=115200, timeout=0.5)
    port.dtr = False; port.rts = False; port.port = args.port
    port.open()

    def read_serial():
        while not done.is_set():
            line = port.readline().decode("utf-8", "replace").strip()
            if line.startswith("ACCEPTANCE "):
                try:
                    value = json.loads(line[len("ACCEPTANCE "):])
                    samples.append(value); incoming.put(value)
                except json.JSONDecodeError:
                    pass

    reader = threading.Thread(target=read_serial, daemon=True)
    reader.start()

    def idle_samples():
        # Observe five fresh periodic measurements with no HTTP requests in flight.
        while not incoming.empty():
            incoming.get_nowait()
        values = [incoming.get(timeout=8) for _ in range(5)]
        assert all(v["bootId"] == boot for v in values), "ESP32 rebooted"
        return values

    try:
        stop()
        for i in range(10):
            run(i % 2 == 0); stop()
        before = idle_samples()
        for i in range(args.cycles):
            run(i % 2 == 0); stop()
        run()
        while not incoming.empty():
            incoming.get_nowait()
        started = time.monotonic()
        polls = 0
        while time.monotonic() - started < args.duration:
            # One request per telemetry sample (~1Hz). Unbounded HTTP polling
            # exhausts Windows ephemeral ports because responses close TCP.
            sample = incoming.get(timeout=8)
            assert sample["bootId"] == boot, "ESP32 rebooted"
            state("running")
            polls += 1
        stop()
        after = idle_samples()
        assert samples and all(v["bootId"] == boot for v in samples), "Reboot or missing telemetry"
        max_stop = max(v["maxStopUs"] for v in samples)
        count = after[-1]["stopSamples"] - before[-1]["stopSamples"]
        before_heap = statistics.median(v["heap"] for v in before[1:])
        after_heap = statistics.median(v["heap"] for v in after[1:])
        report.update(bootId=boot, maxStopUs=max_stop, measuredStops=count,
                      idleHeapBefore=before_heap, idleHeapAfter=after_heap,
                      idleHeapDelta=after_heap-before_heap, statePolls=polls,
                      minHeap=min(v["minHeap"] for v in samples),
                      smallestLargestBlock=min(v["largestBlock"] for v in samples))
        assert count >= args.cycles + 1, "Missing stop measurements"
        assert max_stop <= 100000, f"Stop exceeded 100ms: {max_stop}us"
        # A short soak can detect large leaks, not prove lifetime leak freedom.
        assert after_heap >= before_heap - 4096, "Idle heap dropped by more than 4KiB"
        report["passed"] = True
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        try:
            stop()
        finally:
            done.set(); reader.join(timeout=2); port.close()
            report["samples"] = samples
            output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(json.dumps({k: v for k, v in report.items() if k != "samples"}, indent=2))


if __name__ == "__main__":
    main()