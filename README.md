# BJ Gym Management System

## What's new in this version: Verify & Unlock payments

Online registrations now work like this:

1. A customer opens **Join BJ Gym**, picks a package, and chooses how they're paying:
   - **Pay Online** — the page shows your Telebirr / CBE / bank accounts (edit these anytime in **Admin → Payment Accounts**). They send the money, then upload a screenshot of the payment as proof.
   - **Pay Cash** — no screenshot needed. They submit the form, then come pay at your front desk.
2. Either way, the registration is created **locked**. It does not count as an active member yet, and the membership clock has not started.
3. Staff open **Admin → Clients → Pending Approvals**, look at the screenshot (or confirm cash was handed over), and click **Approve & Unlock** — or **Reject** if the payment can't be verified.
4. Approving starts the membership clock from that moment and the client becomes active. Rejecting keeps them locked with a reason attached.

Physical/cash-desk registration by staff (Admin → Register Client) is unchanged: since staff is collecting payment in person right then, that client is activated immediately with no approval step.

## Running it — no command line needed

You don't need to install Node.js, open a terminal, or type `npm`/`node` commands to use this software day-to-day. Pick whichever matches what you were given:

- **Windows app**: double-click `BJ-Gym-Management-System.exe` in the `dist/` folder. It starts the gym system and opens your browser to it automatically. Keep the black window open while you use it — closing it turns the site off. A `db/` folder appears next to the exe the first time you run it; that's where all your client data is stored, so keep the exe and that `db` folder together (back up the `db` folder regularly).
- **Live website**: if this was deployed to a hosting provider for you, you were given a URL (e.g. `https://your-gym.onrender.com`) — just open it in any browser, no install at all. Staff login is at `/admin/login.html` on that same URL.

## Demo accounts
- Admin: `admin` / `admin123`
- Registrar: `registrar` / `registrar123`

**Change these passwords** (Admin → Dashboard → Employee List → add your own admin, then remove/disable the demo ones) before giving this to real customers.

## Database
Client, package, employee and payment-account data lives in a JSON file at `db/data.json`, created automatically on first run. No external database server is required. Back this file up regularly — it's your entire gym's records.

## For developers / redeploying this yourself

Requirements: Node.js 18+ and npm.

```
npm install
npm start
```
Visit http://localhost:3000 (staff: http://localhost:3000/admin/login.html).

### Rebuilding the Windows .exe
```
npm install -g pkg
npm run build:win
```
Output goes to `dist/BJ-Gym-Management-System.exe`.

### Deploying the live website
A `Dockerfile` is included — this works out of the box on Render, Railway, Fly.io, or any Docker-capable host:
1. Push this folder to a Git repo.
2. Create a new Web Service on your host, pointing at the repo (it will detect the Dockerfile).
3. **Attach a persistent disk/volume mounted at `/app/db`** so client data survives restarts and redeploys — without this, every redeploy wipes your client list.
4. Set the `PORT` environment variable if your host requires a specific one (most auto-inject it).

## Security note (please read before going live)

This project's login is intentionally simple (plaintext passwords in the JSON file, no sessions/JWT, no HTTPS enforcement) — the same approach the original demo used. That's fine for a single trusted computer on your own network. If you're putting the **live website** version on the public internet for customers to use, you should at minimum:
- Put it behind HTTPS (most hosts like Render/Railway do this for you automatically).
- Replace plaintext passwords with hashed ones (e.g. bcrypt).
- Rate-limit the `/api/login` and `/api/register` endpoints.

Happy to add any of these if you want the hosted version hardened further.
