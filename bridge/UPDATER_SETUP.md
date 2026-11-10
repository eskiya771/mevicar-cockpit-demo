# MeviTV Proxy-Updater (Synology DSM)

The bridge checks a protected `/update/status` endpoint. It never receives Docker
socket access, sudo, or a capability to run arbitrary shell commands.

## One-time bootstrap on the NAS

Prerequisites: DSM Task Scheduler, Python 3, Docker Compose, outbound HTTPS access to
`api.github.com` and `raw.githubusercontent.com`.

1. Download the newest `server.cjs`, `hls.cjs`, `remux.cjs`,
   `Dockerfile`, `compose.yaml`, and `updater.py` from
   `https://github.com/eskiya771/mevicar-cockpit-demo/tree/main/bridge`
   to `/volume1/docker/mevitv-bridge/`. **Keep your existing private `.env`**.
   The update-control directory must be created BEFORE starting the new Compose config.
2. Via Synology SSH:

   ```sh
   cd /volume1/docker/mevitv-bridge
   sudo mkdir -p update-control
   # node:22-alpine runs with UID 1000; this grants write access ONLY to mailbox.
   sudo chown 1000:1000 update-control
   sudo chmod 770 update-control
   sudo docker compose up -d --build
   sudo python3 updater.py
   ```

3. In **DSM → Control Panel → Task Scheduler**, create a *user-defined script*,
   executed as **root**, scheduled **every minute**:

   ```sh
   /usr/bin/python3 /volume1/docker/mevitv-bridge/updater.py
   ```

   If the Python package is installed elsewhere, replace `/usr/bin/python3`
   with the actual output of `command -v python3`. This is a trusted local
   administrative task; do not expose it through the DSM web server.

4. Open MeviCar Next → MeviTV → **Proxy**. Sign into IPTV first with the existing PIN.
   You can see the installed revision, latest revision, and checked date.
   The *Update* button is enabled only when a newer version is detected.
   You must explicitly confirm the action. The NAS task processes the
   queued request the next time it executes.

## How it works

- The NAS task checks **only changes in the repository's `bridge/` folder**
  every 30 minutes via GitHub's commits API. Versions are pinned Git commit
  hashes, displayed abbreviated in the UI.
- An authenticated browser session may read the status. Requesting installation
  also requires the exact configured browser Origin; a fixed, already checked
  commit is written into the dedicated `update-control/request.json`.
- The scheduled task alone may invoke Docker Compose. It checks GitHub again,
  downloads ONLY the five allowlisted bridge runtime files from the immutable
  revision, backs up existing files, rebuilds and restarts the container,
  verifies `http://127.0.0.1:8787/health`, and restores the files and rebuilds
  if the health check fails.
- `.env` and the PIN are never downloaded, overwritten, or returned to the browser.
  The local `updater.py` is deliberately **not self-updated**.
- The first installation is shown as **unknown revision** until the first
  successful managed update. The updater cannot safely infer which GitHub
  revision had been copied manually.
- If a rollback build also fails, local administrator intervention is required.
  The app can show the error status, but rollback cannot guarantee recovery in
  every hardware, disk, or network failure.
- The updater uses the connected GitHub repository as its trusted software
  source. Protect repository write permissions, and do not expose the shared
  update directory outside the NAS.

## Important constraints

The existing public bridge URL does **not** grant remote shell access or a
Docker socket. A successful GitHub Pages deploy updates the PWA only. If the
host updater is absent, the app reports *not configured* and never claims to
have updated anything. Streaming may pause during a Docker rebuild.
This updater currently installs the **latest bridge revision on main**; it is
not a GitHub Releases semantic-version channel.

The setup here is a one-time migration of the existing Synology container.
It cannot be completed by changing the GitHub repository alone.
