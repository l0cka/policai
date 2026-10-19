import importlib.util
import ipaddress
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "egress", Path(__file__).with_name("policai-github-egress.py")
)
egress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(egress)


class ApiNetworks(unittest.TestCase):
    def test_sorted_deduplicated_v4_then_v6(self):
        meta = {
            "api": ["2606:50c0::/32", "192.30.252.0/22", "140.82.112.0/20", "192.30.252.0/22"],
            "web": ["1.0.0.0/8"],
        }
        self.assertEqual(
            [str(n) for n in egress.api_networks(meta)],
            ["140.82.112.0/20", "192.30.252.0/22", "2606:50c0::/32"],
        )

    def test_refuses_missing_or_empty_api(self):
        for meta in ({}, {"api": []}, {"api": "140.82.112.0/20"}, []):
            with self.assertRaises(ValueError):
                egress.api_networks(meta)

    def test_refuses_overbroad_or_malformed_ranges(self):
        for value in ("0.0.0.0/0", "10.0.0.0/7", "::/0", "2000::/15", "140.82.112.1/20", "nope", 5):
            with self.assertRaises(ValueError):
                egress.api_networks({"api": [value]})


class PropertyArguments(unittest.TestCase):
    def test_resets_then_allows_localhost_and_ranges(self):
        networks = [ipaddress.ip_network("140.82.112.0/20"), ipaddress.ip_network("2606:50c0::/32")]
        self.assertEqual(
            egress.property_arguments(networks),
            [
                "IPAddressAllow=",
                "IPAddressAllow=localhost",
                "IPAddressAllow=140.82.112.0/20",
                "IPAddressAllow=2606:50c0::/32",
            ],
        )


class Main(unittest.TestCase):
    def test_rejects_unknown_arguments(self):
        self.assertEqual(egress.main(["--force"]), 2)


if __name__ == "__main__":
    unittest.main()
