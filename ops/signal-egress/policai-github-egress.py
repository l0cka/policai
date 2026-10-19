#!/usr/bin/python3 -I
import ipaddress
import json
import subprocess
import sys
import urllib.request

META_URL = "https://api.github.com/meta"
UNIT = "policai.service"
ALWAYS_ALLOWED = ("localhost",)
MAX_META_BYTES = 1_000_000
MIN_PREFIX = {4: 8, 6: 16}


def api_networks(meta):
    ranges = meta.get("api") if isinstance(meta, dict) else None
    if not isinstance(ranges, list) or not ranges:
        raise ValueError("GitHub meta lists no api ranges")
    networks = set()
    for value in ranges:
        if not isinstance(value, str):
            raise ValueError(f"api range is not a string: {value!r}")
        network = ipaddress.ip_network(value, strict=True)
        if network.prefixlen < MIN_PREFIX[network.version]:
            raise ValueError(f"api range too broad: {network}")
        networks.add(network)
    return sorted(networks, key=lambda n: (n.version, n))


def property_arguments(networks):
    allowed = [*ALWAYS_ALLOWED, *(str(n) for n in networks)]
    return ["IPAddressAllow=", *(f"IPAddressAllow={a}" for a in allowed)]


def fetch_meta():
    request = urllib.request.Request(
        META_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "Policai/1.0 (+https://policai.org)",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(MAX_META_BYTES + 1)
    if len(body) > MAX_META_BYTES:
        raise ValueError("GitHub meta response exceeds bound")
    return json.loads(body)


def main(argv):
    if argv not in ([], ["--dry-run"]):
        print("Usage: policai-github-egress [--dry-run]", file=sys.stderr)
        return 2
    networks = api_networks(fetch_meta())
    command = ["/usr/bin/systemctl", "set-property", UNIT, *property_arguments(networks)]
    if argv == ["--dry-run"]:
        print(" ".join(command))
        return 0
    subprocess.run(command, check=True)
    print(f"{UNIT}: egress allowed to localhost and {len(networks)} GitHub api ranges")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
