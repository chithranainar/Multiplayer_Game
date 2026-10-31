# Ink Clash

A quick word-versus-ink party game. Players get four short rounds to read the color name, ignore the mismatched ink, and pick that color from the choices. Quick correct answers earn more points. No accounts, downloads, or external packages.

## Run it

Requires Node.js 20 or newer.

```sh
npm start
```

Then open `http://localhost:3000`. For a local multiplayer session, other devices on the same Wi-Fi can open the host computer's local network address on port `3000`.

## Put it on a public link

This is a single Node web service, ready for a Node host such as Render. Create a new Web Service from this folder/repository and use:

- Build command: `npm install`
- Start command: `npm start`

The service listens on the host-provided `PORT`. Once deployed, the host's URL is the public game link. Share that link and the in-game room code with friends.

Rooms are held in server memory and close when the service restarts; there is no account or permanent data store. The included `render.yaml` describes the service for hosts that support Render blueprints.

