#!/usr/bin/python3 -I
"""New compatibility delegate, not the retired user-service deploy script.

No arguments means request the already installed, reviewed system oneshot.
A wrapper timeout does NOT cancel the service. Inspect its state; do not retry
blindly. Authentication is via sudo policy/askpass, never a password argument.
"""
import subprocess
import sys


def main(args):
    if args == ['--help']:
        print('Usage: policai-deploy.sh\nDelegate to the approved policai-pull.service system oneshot.')
        return 0
    if args:
        print('No arguments are accepted.', file=sys.stderr)
        return 2
    try:
        result = subprocess.run(
            ['/usr/bin/sudo', '--', '/usr/bin/systemctl', 'start', '--wait', 'policai-pull.service'],
            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'},
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=3600, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        print('Deployment result UNKNOWN. Inspect policai-pull.service and its persistent gate; do not retry blindly.', file=sys.stderr)
        return 1
    if result.returncode:
        print('Deployment failed or authorization was denied. Inspect the system service and its persistent gate.', file=sys.stderr)
        return 1
    print('System deployment oneshot completed. Read its health/state result before reporting a release.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
