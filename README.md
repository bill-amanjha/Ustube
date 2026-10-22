# Ustube

A shared YouTube queue for a room. One computer plays the music; anyone on the same Wi-Fi opens a link on their phone and adds songs. Guests install nothing.

## Start it

Double-click `start.command` in Finder, or run:

```bash
node server.js
```

Your default browser opens the player at `http://localhost:8080/player`. Click **Start the party** once (browsers need one click before they allow sound).

Guests scan the QR code on the player, or open the address shown under it (for example `http://192.168.1.5:8080/`). `localhost` only works on the computer running the server, so guests must use that Wi-Fi address.

## What guests can do

- Search for a song or paste any YouTube link (watch, youtu.be, Shorts, YouTube Music)
- **+ Add** puts it at the end; **Next** plays it after the current song
- See what's playing and the queue, live
- Remove songs they added themselves

The player page can also skip, reorder and remove anything.

## About your YouTube login

The player is YouTube's own embedded player running in your browser, so it uses the YouTube sign-in that browser already has, where the browser allows it. In practice:

- **Chrome / Edge / Firefox:** usually picks up your sign-in. With YouTube Premium you normally get no ads.
- **Safari:** blocks the cookies embedded players need, so it plays as signed out (with ads). Use Chrome for the player if this matters.
- The page cannot read your playlists, history or likes. That would need a Google Cloud OAuth app, which is not set up here.

## Good to know

- Some videos block embedding (often official music videos from certain labels). The player skips these automatically and shows why.
- Search reads YouTube's public results page, so it needs no API key. If YouTube changes that page, search may stop working; pasting links will still work.
- The queue is held in memory. Stopping the server clears it.
- Anyone on the Wi-Fi can add and reorder songs. There is no password, so use it on networks you trust.
- macOS may ask whether Node can accept incoming connections the first time. Choose **Allow**, or phones will not connect.
- Change the port with `PORT=9000 node server.js`. Set `NO_OPEN=1` to stop it opening the browser.

## Files

- `server.js`: the local server (Node 18 or later, no packages to install)
- `public/player.html`: the player, for the computer connected to the speakers
- `public/index.html`: the guest page
- `public/add.js`, `public/common.js`, `public/style.css`: shared code and styles
