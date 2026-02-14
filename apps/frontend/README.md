# vote-web

Next.js App Router frontend for voter/admin journeys.

## Setup

```bash
cp .env.example .env.local
bun install
bun run dev
```

## Key Routes

- `/` Home
- `/login` Login
- `/verify-otp` OTP verification
- `/admin/elections/new` Election creation
- `/voter/elections/{id}` Ballot and vote submission
