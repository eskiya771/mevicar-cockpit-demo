# MeviTV proxy updates — integrated (one-time bootstrap)

The proxy checks GitHub **only when MeviCar Next requests it**. Opening MeviCar Next → TV → Proxy triggers an immediate fresh check; **Status prüfen** requests another. There is no background polling.
Nothing is downloaded/installed until the user presses **Proxy aktualisieren** and confirms.

## One-time migration on your Synology

1. Keep your existing private `.env`. Replace only these files from the repository's `bridge/` directory:
   `server.cjs`, `hls.cjs`, `remux.cjs`, `self-update.cjs`, `launcher.cjs`, `Dockerfile`, `compose.yaml`.
2. SSH into the Synology and provision the persistent release folder:

   ```sh
   cd /volume1/docker/mevitv-bridge
   sudo mkdir -p runtime
   sudo chown 1000:1000 runtime
   sudo chmod 700 runtime
   sudo docker compose up -d --build
   curl -fsS http://127.0.0.1:8787/health
   ```

3. Log into MeviCar Next TV with your existing PIN. Click **Proxy** to view the installed
   revision, latest revision and update status. Confirm **Proxy aktualisieren**
   only when ready for a brief stream interruption.

**No DSM scheduled task, separate updater container, Docker socket, or SSH for later JS updates.**

## What gets updated

The immutable image runs `launcher.cjs` and `self-update.cjs`. The updater fetches only
`server.cjs`, `hls.cjs` and `remux.cjs` from a pinned GitHub commit into
`runtime/releases/<commit>/`; it validates their JavaScript syntax and switches
`runtime/state.json` to the new revision. The Node.js playback process exits with code 78,
the launcher exits with a nonzero status and Docker's `restart: unless-stopped`
restarts the container with the new files.

The release directory is a writable bind mount, the container filesystem stays read-only,
and the container receives **no Docker socket or Docker privileges**.
Original IPTV secrets remain in `.env` and never appear in the update status.
The launcher reverts to the previous revision if an updated process terminates during
its first 12 seconds or if its files fail the startup syntax check.

**Limits:** The automatic updater cannot modify its own launcher/updater, Dockerfile,
Compose, Node version or FFmpeg. Such updates still need a normal manual Docker rebuild.
Releases have independent sequential build numbers in `bridge/release.json` (initially **1.0.0, Build 1**). Increment the build integer for each new proxy release. The installed build can be *Unbekannt* until the first managed JS update. Older installed revisions may display their abbreviated SHA until upgraded. GitHub commits that do not increment the build number do not represent a new proxy release.
A crash after the first 12 seconds or a failure requiring Docker/image changes may
still require manual recovery; rollback is best-effort.

Updates are trusted only from the configured GitHub repository. Protect GitHub write access.
The four-digit PIN grants an authenticated session and therefore grants manual update
permission. Secure access to the public proxy through network restrictions where possible.

## Migration note for already-running proxy updater

The updater and launcher are **immutable image files**. A proxy running the old 60-second updater cannot install this change into its own updater via the browser button; apply the one-time file copy and `docker compose up -d --build` steps above. Thereafter application-only bridge releases (`server.cjs`, `hls.cjs`, `remux.cjs`) can be installed from the MeviCar dialog. Changes to `self-update.cjs`, `launcher.cjs`, Dockerfile, or Compose always require a manual image rebuild.
