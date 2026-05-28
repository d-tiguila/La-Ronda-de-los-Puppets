# Collaborative sound figures

This prototype has two web surfaces:

- `/` is the phone controller. A participant chooses an instrument and keeps
  their figure alive by moving the phone.
- `/stage.html` is the shared projected view. It renders geometric circles with
  Matter.js, animates them with GSAP, and triggers sound when the playhead
  crosses a figure.

TouchDesigner still connects as a protected WebSocket client and receives
`puppet.control` note events so the existing Ableton MIDI callback can keep
working.

## Project Shape

- `public/index.html` is the phone controller.
- `public/stage.html` is the shared stage view.
- `public/stage.js` owns the Matter.js physics and playhead trigger logic.
- `src/server.js` starts the HTTP and WebSocket server on one port.
- `src/config/instruments.js` defines instrument labels, MIDI channels, colors,
  and note pools.
- `src/lib/realtime.js` owns users, motion state, stage triggers, and
  TouchDesigner broadcasts.

## Local Run

1. Install Node 22.
2. Run `npm install`.
3. Copy `.env.example` to `.env` or export the variables in your shell.
4. Run `npm run dev`.
5. Open `/` on a phone or browser.
6. Open `/stage.html` on the projected display.

For local tests without `NODE_ENV=production`, `TD_TOKEN` can be empty. Set it
before a public deployment.

## Deploy To Railway

1. Commit this folder and push the `main` branch to GitHub.
2. Create a Railway service from that repository.
3. Add `TD_TOKEN` as a long random secret.
4. Add `ALLOWED_ORIGINS` only when another browser origin should open sockets.
   The Railway page can connect from its own origin automatically.
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

## TouchDesigner Message Example

The stage triggers notes when the playhead crosses a live figure. TouchDesigner
receives the same event shape as before:

```json
{
  "type": "puppet.control",
  "timestamp": 1779359100000,
  "puppetId": "pulse",
  "role": "Pulso",
  "midiChannel": 1,
  "controllerId": "uuid",
  "event": "note_on",
  "midiNote": 60,
  "velocity": 98
}
```

State changes use `type: "server.state"` and include connected figures, the
stage connection, and TouchDesigner connection.
