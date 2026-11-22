#!/usr/bin/env python3
"""Optional read-only advisor. Standard library only; no telemetry or downloads.

See docs/local-ai.md, 'Is the Hardware Advisor Safe?' for every probe.
Manual mode runs no hardware commands. Ollama listing is separately opt-in.
"""
import argparse
import csv
import ctypes
import io
import http.client
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess

POLICY_PATH = Path(__file__).with_name("model-policy.json")


def run_utility(name, args, env=None):
    """Fixed argument lists from this module only; never a shell pipeline."""
    executable = shutil.which(name)
    if not executable:
        return None
    try:
        result = subprocess.run([executable, *args], shell=False, timeout=12,
                                capture_output=True, text=True, encoding="utf-8",
                                errors="replace", env=env,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def ram_gib(system):
    try:
        if system == "Windows":
            class Memory(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong),
                            *[(n, ctypes.c_ulonglong) for n in
                              ("total", "available", "page", "freepage", "virtual", "freevirtual", "extended")]]
            mem = Memory()
            mem.length = ctypes.sizeof(mem)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
                return mem.total / 2**30
        elif system == "Darwin":
            value = run_utility("sysctl", ["-n", "hw.memsize"])
            return int(value) / 2**30 if value else None
        elif system == "Linux":
            for line in Path("/proc/meminfo").read_text().splitlines():
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) / 2**20
    except (OSError, ValueError, AttributeError):
        pass
    return None


def detect(check_ollama=False):
    system = platform.system()
    data = {"source": "measured where available", "os": system,
            "architecture": platform.machine(), "ram_gib": ram_gib(system),
            "gpu_type": "unknown", "gpus": [], "vram_gib": None,
            "ollama_installed": True if shutil.which("ollama") else None,
            "ollama_command_found": bool(shutil.which("ollama")),
            "ollama_models": None, "notes": []}
    nvidia = run_utility("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
    if nvidia:
        for row in csv.reader(io.StringIO(nvidia)):
            try:
                data["gpus"].append({"name": row[0].strip(), "vram_gib": float(row[1]) / 1024})
            except (ValueError, IndexError):
                continue
        if data["gpus"]:
            data["gpu_type"] = "discrete"
            # Do not sum GPUs: a single model may not use all cards reliably.
            data["vram_gib"] = max(g["vram_gib"] for g in data["gpus"])
    if system == "Windows" and not data["gpus"]:
        names = run_utility("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
              "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"])
        if names:
            data["gpus"] = [{"name": n, "vram_gib": None} for n in names.splitlines()]
    elif system == "Darwin":
        chip = run_utility("sysctl", ["-n", "machdep.cpu.brand_string"])
        displays = run_utility("system_profiler", ["SPDisplaysDataType", "-json"])
        if displays:
            try:
                for gpu in json.loads(displays).get("SPDisplaysDataType", []):
                    data["gpus"].append({"name": gpu.get("sppci_model", "unknown"), "vram_gib": None})
            except (ValueError, TypeError):
                pass
        if chip and "Apple" in chip and platform.machine() == "arm64":
            data["gpu_type"] = "unified"
            data["unified_memory_gib"] = data["ram_gib"]
    elif system == "Linux" and not data["gpus"]:
        names = run_utility("lspci", ["-mm"])
        if names:
            data["gpus"] = [{"name": n, "vram_gib": None} for n in names.splitlines()
                            if any(s in n for s in ("VGA", "3D controller", "Display controller"))]
    if data["gpu_type"] == "unknown":
        data["notes"].append("GPU acceleration/VRAM unknown; use CPU/unknown guidance or manual inputs. Detection failure does not mean no GPU exists.")
    if not data["ollama_command_found"]:
        data["notes"].append("Ollama command not found on PATH; installation status unknown. The desktop app/service may still exist.")
    if check_ollama and data["ollama_installed"]:
        env = dict(os.environ)
        env["OLLAMA_HOST"] = "127.0.0.1:11434"
        # List metadata only. Force loopback, ignoring a user's remote OLLAMA_HOST.
        data["ollama_models"] = run_utility("ollama", ["list"], env=env)
        if data["ollama_models"] is None:
            data["notes"].append("Local Ollama did not return its model list; it may not be running.")
    elif check_ollama:
        connection = http.client.HTTPConnection("127.0.0.1", 11434, timeout=4)
        try:
            connection.request("GET", "/api/tags")
            response = connection.getresponse()
            raw = response.read(1024 * 1024)
            if response.status == 200:
                data["ollama_models"] = [m["name"] for m in json.loads(raw).get("models", [])
                                         if isinstance(m, dict) and isinstance(m.get("name"), str)]
                data["notes"].append("Local model metadata returned; this does not certify the executable's location or model performance.")
        except (OSError, ValueError, http.client.HTTPException):
            data["notes"].append("Local service unavailable; use the no-script setup guide.")
        finally:
            connection.close()
    return data


def recommend(hardware, policy):
    ram = hardware.get("ram_gib")
    # OS usable totals can be just below installed capacity (e.g. 15.85 GiB).
    # Use the nearest whole GiB for planning tiers, retaining raw measurements.
    ram = math.floor(ram + 0.5) if ram is not None else None
    vram = hardware.get("vram_gib")
    kind = hardware.get("gpu_type", "unknown")
    candidates = []
    for model in policy["chat"]:
        if ram is None or ram < model["planning_ram_gib"]:
            continue
        # CPU / unknown remains conservative even on high-RAM machines.
        if kind in ("cpu", "unknown") and model["id"] == "qwen3:8b":
            continue
        if kind == "discrete" and (vram is None or vram < model["planning_vram_gib"]):
            continue
        candidates.append({**model, "comfort": "more headroom" if ram >= model["comfortable_ram_gib"] else "cautious trial"})
    return {"basis": "planning estimates, not measured model performance", "rounded_planning_ram_gib": ram, "chat": candidates,
            "embedding": policy["embedding"] if candidates else [], "notes": policy["notes"],
            "next_step": "Start with the smallest candidate; verify a short cited answer. Install nothing automatically." if candidates else
            "No conservative candidate with these inputs. Use manual fields and keyword retrieval; check memory/GPU details manually."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manual", action="store_true", help="Skip all detection and subprocesses")
    parser.add_argument("--ram", type=float, help="Total RAM GiB, manually observed")
    parser.add_argument("--vram", type=float, help="Dedicated VRAM GiB; do not use shared memory")
    parser.add_argument("--gpu-type", choices=["cpu", "unknown", "discrete", "unified"], default="unknown")
    parser.add_argument("--check-ollama", action="store_true", help="Opt-in local-only ollama list; never pulls/runs a model")
    args = parser.parse_args()
    if (args.ram is not None and not 0 < args.ram < 4096) or (args.vram is not None and not 0 <= args.vram < 4096):
        parser.error("Memory inputs must be finite positive values (VRAM may be zero).")
    if not args.manual and (args.ram is not None or args.vram is not None or args.gpu_type != "unknown"):
        parser.error("Use --manual with supplied hardware values, so measured and supplied inputs cannot be confused.")
    if args.manual and args.check_ollama:
        parser.error("Manual mode does not run commands; omit --check-ollama.")
    hardware = {"source": "user supplied, not measured", "ram_gib": args.ram,
                "vram_gib": args.vram, "gpu_type": args.gpu_type} if args.manual else detect(args.check_ollama)
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    print(json.dumps({"hardware": hardware, "recommendations": recommend(hardware, policy)}, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
