# Signal GitHub egress

`policai.service` runs with `IPAddressDeny=any` and `IPAddressAllow=localhost`.
Signal POST (`/api/signal/reviews`) persists each decision through
`api.github.com`, so the service also needs to reach GitHub's API, and nothing
else.

`policai-github-egress.py` reads the `api` ranges from
`https://api.github.com/meta` and applies them with `systemctl set-property
policai.service IPAddressAllow= IPAddressAllow=localhost IPAddressAllow=<range>…`.
The property changes the unit's live BPF filter, so the service is not
restarted. systemd stores it in
`/etc/systemd/system.control/policai.service.d/50-IPAddressAllow.conf`, and it
survives reboots.

The daily timer keeps the list current. GitHub changes its ranges without
notice. A stale list makes Signal persistence fail with
`github_persist_failed`. It never widens access.

Inbound access is unchanged. `IPAddressAllow` filters by remote address in
both directions, but the service listens only on `127.0.0.1:8794`
(`SocketBindAllow=tcp:8794`, `SocketBindDeny=any`), so no remote host can open
a connection to it. Public traffic still arrives only through the Cloudflare
tunnel on loopback.

The script refuses a missing or empty `api` list, a malformed range, and any
range broader than /8 (IPv4) or /16 (IPv6). On any error it changes nothing.
DNS keeps working because the `systemd-resolved` stub is on loopback.

## Test

```sh
python3 -B -m unittest -v ops/signal-egress/test_policai_github_egress.py
python3 -I ops/signal-egress/policai-github-egress.py --dry-run
```

`--dry-run` fetches the live list and prints the `systemctl` command without
running it.

## Install

Installation is a host network-access change and needs the maintainer's
approval. Register the timer in
`/home/l0cka/Work/Argus/services/argus-topology/topology.json` in the same
change.

```sh
sudo install -o root -g root -m 0755 ops/signal-egress/policai-github-egress.py /usr/local/libexec/policai-github-egress
sudo install -o root -g root -m 0644 ops/signal-egress/policai-github-egress.service ops/signal-egress/policai-github-egress.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start policai-github-egress.service
sudo systemctl enable --now policai-github-egress.timer
systemctl show -p IPAddressAllow policai.service
```

The last command lists `127.0.0.0/8`, `::1/128` and the GitHub ranges.

## Roll back

```sh
sudo systemctl disable --now policai-github-egress.timer
sudo systemctl set-property policai.service IPAddressAllow= IPAddressAllow=localhost
```

Do not use `systemctl revert policai.service`. It also removes the
`10-next-shutdown.conf` drop-in.
