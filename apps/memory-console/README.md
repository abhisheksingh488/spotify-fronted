# memory-console

The operator screens. See the repository README one level up for what each
screen is for, and `docs/` for a document per screen.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

The backend must be running on the port in `.env.local.example`, and you need a
token from the backend repository:

```bash
python scripts/make_token.py user_001
```
