# memory-controls

The listener-facing app: review, correct and remove what the AI remembers about
you. `abc.md:253` — *"Review, correction, deletion UI"*.

See `docs/memory-controls.doc.md` in the repository root for the call flow, and
the repository README for how this fits beside the console.

```bash
npm install
cp .env.local.example .env.local     # add the backend MEMORY_JWT_SECRET
npm run dev                          # http://localhost:3001
npm run build
```

## Two things that make this different from the console

**The subject is fixed.** `MEMORY_SUBJECT_ID` in `.env.local` is the signed-in
listener, standing in for the Spotify session a real deployment would read. There
is no picker, and nothing the browser sends can change it — the gateway injects it
into every request. Set it to `user_005` to see what a listener with paused consent
sees.

**The gateway is not a general proxy.** It allows only search, one memory, one
deletion job, feedback and health. Anything else answers `403 NOT_ALLOWED_HERE`.

## Pause and opt out

Shown, disabled, with the reason. Both change consent state, and none of the ten
endpoints in `abc.md:303-322` changes consent. A switch that looked like it turned
memory off without turning it off would be worse than not offering one.
