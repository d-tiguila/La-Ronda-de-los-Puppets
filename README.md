# Marionetas MIDI web controller

This app is the mobile controller layer for a five-puppet TouchDesigner and
Ableton ensemble. Browsers choose one puppet slot manually, then send notes,
parameters, motion, and energy events to a WebSocket server. TouchDesigner
connects as a protected WebSocket client and receives the normalized events.

## Project shape

- `public/` holds the phone controller UI.
- `src/server.js` starts the HTTP and WebSocket server on one port.
- `src/config/puppets.js` defines the five puppet roles, MIDI channels, and
  allowed note sets.
- `src/lib/realtime.js` owns slot assignment, WebSocket auth, and broadcasts.
- `test/` checks the message protocol mapping.

## Local run

1. Install Node 22.
2. Run `npm install`.
3. Copy `.env.example` to `.env` or export the variables in your shell.
4. Run `npm run dev`.
5. Open the local controller page on a phone or browser.

For local tests without `NODE_ENV=production`, `TD_TOKEN` can be empty. Set it
before a public deployment.

## Deploy to GitHub and Railway

1. Commit this folder and push the `main` branch to GitHub.
2. Create a Railway service from that repository.
3. Add `TD_TOKEN` as a long random secret.
4. Add `ALLOWED_ORIGINS` only when another browser origin should open the
   controller socket, for example a separate preview site. The Railway page can
   connect from its own origin automatically.
5. Set `NODE_ENV=production`.
6. Generate a Railway domain or attach a custom domain.

Railway sends the `PORT` value to the service. The app listens on that port and
uses the same public origin for HTTPS and secure WebSocket traffic.

## TouchDesigner WebSocket

Use a WebSocket DAT in client mode and connect it to:

```text
wss://YOUR-RAILWAY-DOMAIN/ws?role=touchdesigner&token=YOUR_TD_TOKEN
```

For local development use:

```text
ws://localhost:3000/ws?role=touchdesigner&token=YOUR_TD_TOKEN
```

The browser controller endpoint is:

```text
/ws?role=controller
```

It is opened by `public/app.js`; do not put the TouchDesigner token in browser
code.

## Message examples for TouchDesigner

Note press:

```json
{
  "type": "puppet.control",
  "timestamp": 1779359100000,
  "puppetId": 1,
  "role": "Melodia",
  "midiChannel": 1,
  "controllerId": "uuid",
  "event": "note_on",
  "noteIndex": 3,
  "midiNote": 67,
  "velocity": 0.72
}
```

Slider:

```json
{
  "type": "puppet.control",
  "puppetId": 4,
  "midiChannel": 4,
  "event": "parameter",
  "parameter": "effect",
  "value": 0.41
}
```

Motion pad:

```json
{
  "type": "puppet.control",
  "puppetId": 2,
  "event": "motion",
  "x": 0.3,
  "y": 0.85
}
```

State changes use `type: "server.state"` and include occupied puppet slots and
whether a TouchDesigner client is connected.

## Routing idea

In TouchDesigner, parse incoming JSON by `puppetId`. Route each puppet to its
Ableton track or MIDI channel. `note_on` and `note_off` can drive MIDI notes,
`intensity` can become velocity or expression, `volume` can map to a track gain,
`effect` can map to a send or device macro, and `motion` can animate the 3D
marioneta while also shaping sound.
