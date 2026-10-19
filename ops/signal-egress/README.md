# Signal egress

`policai.service` runs with `IPAddressDeny=any` and `IPAddressAllow=localhost`.
Signal POST (`/api/signal/reviews`) needs two kinds of outbound HTTPS:

- `api.github.com`, to read `main` and commit each decision;
- the official source host, because publication re-retrieves the source and
  refuses it if the content changed since approval (`source-ingest.ts`,
  `assertSourceStillMatchesApproval`).

Official sources sit behind CDNs whose addresses change, so no stable address
list covers them. `20-signal-egress.conf` therefore allows all remote
addresses.

## What still limits the service

- Inbound is unchanged. The service listens only on `127.0.0.1:8794`
  (`SocketBindAllow=tcp:8794`, `SocketBindDeny=any`), so no remote host can
  open a connection to it. Public traffic still arrives through the
  Cloudflare tunnel on loopback.
- Source retrieval accepts only HTTPS on allow-listed official hosts, resolves
  DNS itself and refuses private, loopback and link-local addresses
  (`src/lib/pipeline/fetch.ts`, `assertSafeSourceUrl`). GitHub calls go to one
  fixed host.

## Trade-off

The kernel no longer stops a compromised Node process from reaching arbitrary
hosts. The process holds the two Signal tokens and public data. The GitHub
token is the asset that matters, and it needs GitHub reachable under any
egress policy. Its scope, not this drop-in, limits what a leak can do.

A loopback forward proxy with a hostname allowlist (GitHub plus official
source hosts) would restore kernel-enforced egress. Revisit this if the
service gains secrets or private data.

## Install

Installation is a host network-access change and needs the maintainer's
approval. It restarts the site briefly.

```sh
sudo install -o root -g root -m 0644 ops/signal-egress/20-signal-egress.conf /etc/systemd/system/policai.service.d/
sudo systemctl daemon-reload
sudo systemctl restart policai.service
systemctl show -p IPAddressAllow policai.service
```

The last command prints `IPAddressAllow=0.0.0.0/0 ::/0` (systemd may also list
`127.0.0.0/8 ::1/128`).

## Roll back

```sh
sudo rm /etc/systemd/system/policai.service.d/20-signal-egress.conf
sudo systemctl daemon-reload
sudo systemctl restart policai.service
```

Do not use `systemctl revert policai.service`. It also removes the
`10-next-shutdown.conf` drop-in.
