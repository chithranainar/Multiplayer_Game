# Color Dash

A quick, room-code multiplayer game. Players get four short rounds to tap the color that matches the target. Quick correct taps earn more points. No accounts, downloads, or external packages.

## Run it

Requires Node.js 20 or newer.

```sh
npm start
```

Then open `http://localhost:3000`. For a local multiplayer session, other devices on the same Wi-Fi can open the host computer's local network address on port `3000`.

## Deploy on Render

This is a single Node web service. Render uses `npm install` as the build command and `npm start` as the start command. The service listens on the host-provided `PORT`. Share the public service URL and in-game room code with friends.

Rooms are held in server memory and close when the service restarts; there is no account or permanent data store.
