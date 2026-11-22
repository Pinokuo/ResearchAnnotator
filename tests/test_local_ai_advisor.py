import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("advisor", ROOT / "tools/local_ai_advisor.py")
advisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(advisor)
POLICY = json.loads(advisor.POLICY_PATH.read_text())


class AdvisorTests(unittest.TestCase):
    def ids(self, ram, kind="cpu", vram=None):
        return [m["id"] for m in advisor.recommend({"ram_gib": ram, "gpu_type": kind, "vram_gib": vram}, POLICY)["chat"]]

    def test_missing_ram(self):
        self.assertEqual(self.ids(None), [])

    def test_low_ram(self):
        self.assertEqual(self.ids(4), [])

    def test_usable_ram_matches_manual_installed_tier(self):
        self.assertEqual(self.ids(15.85), self.ids(16))
        self.assertEqual(self.ids(31.7), self.ids(32))

    def test_cpu_tiers(self):
        for ram, expected in [(8, 1), (16, 2), (32, 2), (64, 2)]:
            with self.subTest(ram=ram):
                self.assertEqual(len(self.ids(ram)), expected)

    def test_vram_tiers(self):
        for vram, expected in [(4, 1), (6, 2), (8, 2), (12, 3), (16, 3), (24, 3)]:
            with self.subTest(vram=vram):
                self.assertEqual(len(self.ids(32, "discrete", vram)), expected)

    def test_unknown_gpu_not_assumed(self):
        self.assertEqual(self.ids(64, "unknown"), self.ids(64, "cpu"))
        self.assertEqual(self.ids(64, "discrete", None), [])

    def test_ram_limits_gpu(self):
        self.assertEqual(len(self.ids(8, "discrete", 24)), 1)

    def test_apple_memory_not_summed(self):
        self.assertEqual(len(self.ids(8, "unified")), 1)
        self.assertEqual(len(self.ids(16, "unified")), 2)
        self.assertEqual(len(self.ids(32, "unified")), 3)

    def test_embeddings_optional(self):
        r = advisor.recommend({"ram_gib": 16}, POLICY)
        self.assertEqual(len(r["embedding"]), 2)
        self.assertIn("Keyword retrieval needs no", r["notes"])

    def test_safe_subprocess(self):
        with patch.object(advisor.shutil, "which", return_value="utility"), patch.object(advisor.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "ok"
            self.assertEqual(advisor.run_utility("sysctl", ["-n", "hw.memsize"]), "ok")
            self.assertFalse(run.call_args.kwargs["shell"])
            self.assertEqual(run.call_args.kwargs["timeout"], 12)

    def test_missing_utility(self):
        with patch.object(advisor.shutil, "which", return_value=None):
            self.assertIsNone(advisor.run_utility("missing", []))

    def test_timeout(self):
        with patch.object(advisor.shutil, "which", return_value="utility"), patch.object(advisor.subprocess, "run", side_effect=advisor.subprocess.TimeoutExpired("utility", 12)):
            self.assertIsNone(advisor.run_utility("sysctl", []))

    def test_ollama_is_opt_in_and_local(self):
        with patch.object(advisor.platform, "system", return_value="Other"), patch.object(advisor, "ram_gib", return_value=16), patch.object(advisor.shutil, "which", return_value="ollama"), patch.object(advisor, "run_utility", return_value=None) as run:
            advisor.detect(False)
            self.assertFalse(any(c.args[0] == "ollama" for c in run.call_args_list))
            advisor.detect(True)
            call = [c for c in run.call_args_list if c.args[0] == "ollama"][0]
            self.assertEqual(call.args[1], ["list"])
            self.assertEqual(call.kwargs["env"]["OLLAMA_HOST"], "127.0.0.1:11434")

    def test_windows_unknown_vram(self):
        with patch.object(advisor.platform, "system", return_value="Windows"), patch.object(advisor, "ram_gib", return_value=16), patch.object(advisor, "run_utility", side_effect=[None, "Integrated GPU"]):
            r = advisor.detect()
            self.assertIsNone(r["vram_gib"])
            self.assertEqual(r["gpu_type"], "unknown")

    def test_apple_detection(self):
        with patch.object(advisor.platform, "system", return_value="Darwin"), patch.object(advisor.platform, "machine", return_value="arm64"), patch.object(advisor, "ram_gib", return_value=16), patch.object(advisor, "run_utility", side_effect=[None, "Apple M2", '{"SPDisplaysDataType":[{"sppci_model":"Apple M2"}]}']):
            r = advisor.detect()
            self.assertEqual(r["unified_memory_gib"], 16)

    def test_linux_gpu_detection(self):
        with patch.object(advisor.platform, "system", return_value="Linux"), patch.object(advisor, "ram_gib", return_value=16), patch.object(advisor, "run_utility", side_effect=[None, '00:02.0 "VGA compatible controller" "Intel"']):
            self.assertEqual(len(advisor.detect()["gpus"]), 1)

    def test_manual_mode_no_probe(self):
        with patch("sys.argv", ["advisor", "--manual", "--ram", "32", "--vram", "8", "--gpu-type", "discrete"]), patch.object(advisor, "detect", side_effect=AssertionError("must not detect")), patch("builtins.print") as out:
            advisor.main()
            result = json.loads(out.call_args.args[0])
            self.assertEqual(len(result["recommendations"]["chat"]), 2)

    def test_no_network_without_opt_in(self):
        with patch.object(advisor.platform, "system", return_value="Other"), patch.object(advisor, "ram_gib", return_value=16), patch.object(advisor.shutil, "which", return_value=None), patch.object(advisor, "run_utility", return_value=None), patch.object(advisor.http.client, "HTTPConnection", side_effect=AssertionError("no default network")):
            self.assertIsNone(advisor.detect()["ollama_installed"])

    def test_cli_missing_local_metadata_fallback(self):
        with patch.object(advisor.platform, "system", return_value="Other"), patch.object(advisor, "ram_gib", return_value=16), patch.object(advisor.shutil, "which", return_value=None), patch.object(advisor, "run_utility", return_value=None), patch.object(advisor.http.client, "HTTPConnection") as http:
            http.return_value.getresponse.return_value.status = 200
            http.return_value.getresponse.return_value.read.return_value = b'{"models":[{"name":"qwen3:4b"}]}'
            result = advisor.detect(True)
            http.assert_called_once_with("127.0.0.1", 11434, timeout=4)
            http.return_value.request.assert_called_once_with("GET", "/api/tags")
            self.assertEqual(result["ollama_models"], ["qwen3:4b"])


if __name__ == "__main__":
    unittest.main()
