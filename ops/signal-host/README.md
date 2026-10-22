# Signal host setup

Two `policai.service` drop-ins turn on Signal POST (`/api/signal/reviews`) on
the production host. `20-signal-egress.conf` allows outbound connections.
`30-signal-env.conf` loads the Signal secrets from `/etc/policai/signal.env`.

## Secrets

`/etc/policai/signal.env` is owned by root with mode `0600`. systemd reads it
before it applies the unit's sandbox, so the `policai` user never needs file
access to it.

| Variable | Holder | Purpose |
| --- | --- | --- |
| `POLICAI_SIGNAL_TOKEN` | host and the Grok Bot's masked prompt | Bearer token for `/api/signal/*` |
| `POLICAI_SIGNAL_GITHUB_TOKEN` | host only | Reads `main` and opens a Signal PR on `l0cka/policai` |

Leave `POLICAI_SIGNAL_COMMIT_TARGET` unset, so each decision opens a PR.

`POLICAI_SIGNAL_GITHUB_TOKEN` is a fine-grained personal access token from
`l0cka`. Its only repository is `l0cka/policai`. Its permissions are Contents
read and write and Pull requests read and write (Metadata read is added
automatically). `l0cka` is a repository admin, so the token bypasses the
"Protect main" ruleset. A leaked token can push straight to `main`, which the
host deploys automatically. The maintainer accepted that trade-off on
2026-10-19. A machine user with Write access, together with a required
approval on `main`, would remove it. Give the token an expiry and rotate it
before the expiry date.

## Egress

`policai.service` runs with `IPAddressDeny=any` and `IPAddressAllow=localhost`.
Signal POST needs outbound HTTPS to `api.github.com`, to read `main` and
commit each dismissal. It no longer fetches official sources, because Signal
can no longer approve or publish. `20-signal-egress.conf` still allows all
remote addresses from when it did; narrowing it to GitHub is a separate host
change.

Inbound access does not change. The service listens only on `127.0.0.1:8794`
(`SocketBindAllow=tcp:8794`, `SocketBindDeny=any`), so no remote host can
connect to it. Public traffic arrives only through the Cloudflare tunnel on
loopback. Source retrieval accepts only HTTPS on allow-listed official hosts.
It resolves DNS itself and refuses private, loopback and link-local addresses
(`assertSafeSourceUrl` in `src/lib/pipeline/fetch.ts`).

Trade-off: the kernel no longer stops a compromised Node process from reaching
arbitrary hosts. Under any egress policy the GitHub token must be able to
reach GitHub, so the token's scope limits what a leak can do, not this
drop-in. A forward proxy on loopback with a hostname allowlist would restore
kernel-enforced egress. Revisit this if the service gains secrets or private
data.

## Install

Install after the Signal persistence change is deployed. Before it, POST
writes to the read-only checkout. The install changes network access and
restarts the site briefly, so it needs the maintainer's approval.

```sh
sudo install -d -o root -g root -m 0700 /etc/policai
sudo install -o root -g root -m 0600 /home/l0cka/.cursor/policai-secrets/signal.env /etc/policai/signal.env
sudo install -o root -g root -m 0644 ops/signal-host/20-signal-egress.conf ops/signal-host/30-signal-env.conf /etc/systemd/system/policai.service.d/
sudo systemctl daemon-reload
sudo systemctl restart policai.service
systemctl show -p IPAddressAllow policai.service
curl -s http://127.0.0.1:8794/api/signal/reviews/does-not-exist
```

`IPAddressAllow` lists `0.0.0.0/0` and `::/0`. The `curl` command returns
`unauthorized`, not `signal_token_unconfigured`.

## Roll back

```sh
sudo rm /etc/systemd/system/policai.service.d/20-signal-egress.conf /etc/systemd/system/policai.service.d/30-signal-env.conf
sudo systemctl daemon-reload
sudo systemctl restart policai.service
```

Do not run `systemctl revert policai.service`. It also removes the
`10-next-shutdown.conf` drop-in.
