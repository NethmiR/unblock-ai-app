This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result. (Port 3001 is fixed in `package.json` because the backend API binds port 3000 and its default `CORS_ORIGIN` is `http://localhost:3001` — see `docs/fe-api-migration-plan.md` R5.)

## Environment

Copy `.example.env` to `.env.local`. The only variable is the API base URL:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

## Authentication

- One sign-in page, `/login`, for every user: **email + password**. Its form posts to this app's
  `POST /api/auth/login` Route Handler, which calls the API and stores the returned opaque session
  token in the httpOnly `ua_session` cookie. After login the user lands on `/account`.
- `/account` shows the user's profile, permissions and active sessions, with actions to revoke one
  session, sign out of all other sessions, or sign out (which revokes the session on the API).
- `src/proxy.ts` only checks that the session cookie exists for `/account`, `/admin` and `/portal`
  and redirects to `/login` otherwise. It does not verify the token — the API validates it on every
  call, so an expired or revoked session fails there.
- `/admin` (template authoring) and `/portal` (requests) are still reachable by URL but are not
  linked from the login flow; they are pending a permission-based redesign. The API's permission
  guards are the real access boundary.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
