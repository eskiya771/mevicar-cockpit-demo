# MeviTV proxy updates — integrated (one-time bootstrap)

The proxy checks the published `proxy-release.json` on GitHub Pages **only when MeviCar Next requests it**. It does not use the anonymous GitHub REST API (which can return HTTP 403 when rate-limited). Opening MeviCar Next → TV → Proxy triggers an immediate fresh check; **Status prüfen** requests another. There is no background polling.
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
The launcher **never automatically reverts** to the previous revision. Invalid selected releases stop with an explicit startup error. The preceding validated release remains available for a user-confirmed rollback from the MeviCar proxy dialog.

**Limits:** The automatic updater cannot modify its own launcher/updater, Dockerfile,
Compose, Node version or FFmpeg. Such updates still need a normal manual Docker rebuild.
Releases have independent sequential build numbers in `bridge/release.json` (initially **1.0.0, Build 1**). Increment the build integer for each new proxy release. The installed build can be *Unbekannt* until the first managed JS update. Older installed revisions may display their abbreviated SHA until upgraded. GitHub commits that do not increment the build number do not represent a new proxy release.
If the selected release cannot start, the browser button is unavailable: recover from Synology SSH with the command below. This is intentionally manual, not a time-based automatic rollback.

Updates are trusted only from the configured GitHub repository. Protect GitHub write access.
The four-digit PIN grants an authenticated session and therefore grants manual update
permission. Secure access to the public proxy through network restrictions where possible.

## Migration note for already-running proxy updater

The updater and launcher are **immutable image files**. A proxy running the old 60-second updater cannot install this change into its own updater via the browser button; apply the one-time file copy and `docker compose up -d --build` steps above. Thereafter application-only bridge releases (`server.cjs`, `hls.cjs`, `remux.cjs`) can be installed from the MeviCar dialog. Changes to `self-update.cjs`, `launcher.cjs`, Dockerfile, or Compose always require a manual image rebuild.

## Rate-limit fix (existing installations)

The release manifest is published to `https://eskiya771.github.io/mevicar-cockpit-demo/proxy-release.json` only after successful GitHub Actions deployment. Since `self-update.cjs` is part of the immutable Docker image, a currently deployed updater that still calls `api.github.com` needs **one last manual image rebuild** with the latest `self-update.cjs` before this fix takes effect. No `.env` changes, API token, or new container are needed. Afterwards, future application-only proxy releases work from the MeviCar update button.

## Manual rollback and recovery

When the proxy is online, MeviCar Next → TV → Proxy → **Zurück zu …** activates the saved prior release after confirmation. The action requires the authenticated session and matching browser Origin, verifies all three previous JavaScript files, then restarts Docker. An update never changes the `.env` credentials.

**If the proxy will not start**, run from Synology SSH (no secrets are printed):

```sh
cd /volume1/docker/mevitv-bridge || exit 1
sudo docker compose run --rm --no-deps --entrypoint node mevitv-bridge -e '
const fs=require("fs");
const p="/runtime/state.json",s=JSON.parse(fs.readFileSync(p,"utf8"));
const old={sha:s.installed,build:s.installed_build,version:s.installed_version};
if(!/^[a-f0-9]{40}$/.test(s.previous||""))throw Error("No previous release available");
for(const file of ["server.cjs","hls.cjs","remux.cjs"]){
 if(!fs.existsSync("/runtime/releases/"+s.previous+"/"+file))throw Error("Missing previous file: "+file);
}
s.installed=s.previous;s.installed_build=s.previous_build;s.installed_version=s.previous_version;
s.previous=old.sha;s.previous_build=old.build;s.previous_version=old.version;
s.state="restarting";s.message="Manually restored using Synology SSH";
fs.writeFileSync(p,JSON.stringify(s),{mode:0o600});
console.log("Previous release selected:",s.installed_version,s.installed_build);
'
sudo docker compose up -d
```

This works even when the browser API is offline. The updater and launcher are part of the image and must be copied from GitHub and rebuilt once for this release:

```sh
cd /volume1/docker/mevitv-bridge || exit 1
for f in launcher.cjs self-update.cjs server.cjs hls.cjs remux.cjs; do
  curl -fSL --retry 3 "https://raw.githubusercontent.com/eskiya771/mevicar-cockpit-demo/main/bridge/$f" -o "$f" || exit 1
done
sudo docker compose up -d --build
```

After that, future normal media bridge updates use the in-app button.
