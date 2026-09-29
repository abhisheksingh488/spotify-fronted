# memory-console

The operator screens. See the repository README one level up for what each
screen is for, and `docs/` for a document per screen.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

The backend must be running on the port in `.env.local.example`, and that file
also needs the backend's `MEMORY_JWT_SECRET` - the console signs its own
requests, so there is no token to make or paste.

Which subject you are acting as is the dropdown at the top of the console.
