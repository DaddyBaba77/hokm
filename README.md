# Hokm — حکم

Online board and card games you host yourself. You send friends a link, they type a name,
and you play. No accounts, no installs, no app. Empty seats can be filled with bots, so a
game works whether you have a full table or none.

Two games so far, picked on the home screen when you create a table:

| Game | Players | |
|---|---|---|
| **Hokm** | exactly 4, in two teams | the Persian trick-taking game |
| **Snakes & Ladders** | 2 to 8 | a fresh random board every game |

---

## Getting it online (about 5 minutes, free)

The game is a small Node server — it needs a real host, not a static file server, because the
four players talk to each other over a WebSocket.

### Render (recommended — free, no credit card, Git-based)

1. **Put the code on GitHub.** Create an empty repo at <https://github.com/new> (public or
   private, either works). Then, in this folder:

   ```bash
   git init
   git add .
   git commit -m "Hokm"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/hokm.git
   git push -u origin main
   ```

   If you'd rather not touch the command line, GitHub's web uploader works too — but drag in
   every file **except** `node_modules`.

2. **Deploy.** Sign in at <https://render.com> with your GitHub account → **New → Web Service**
   → pick the repo. Render reads `render.yaml`, so the settings fill themselves in:

   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm install --omit=dev` |
   | Start command | `npm start` |
   | Instance type | Free |

3. **Click Create.** Two or three minutes later you get a URL like
   `https://hokm.onrender.com`. That's the address your friends type.

**The one catch with the free plan:** Render puts a free service to sleep after 15 minutes with
no visitors, and waking it takes about a minute. So the first person to open the link on game
night stares at a blank page for a bit — after that it's instant for everyone. Two ways around
it if it annoys you:

- Point a free uptime pinger (e.g. UptimeRobot) at `https://your-app.onrender.com/healthz`
  every 10 minutes. Render's free plan allows 750 instance-hours a month and a full month is
  744, so one always-awake service just fits.
- Or move to a paid instance (Render Starter is about $7/month; Railway's hobby plan is similar)
  and the sleeping stops entirely.

### Anything else

There's a `Dockerfile`, so Railway, Koyeb, Fly.io, a Raspberry Pi, or any VPS will run it as-is.
The only requirement is a host that allows long-lived WebSocket connections — Vercel, Netlify
and Cloudflare Workers do not, so those won't work.

### Running it on your own machine

You need [Node.js](https://nodejs.org) (any version 18 or newer). Check with `node -v`.

```bash
npm install
npm start          # then open http://localhost:3000
```

**Testing four players by yourself.** Normally your seat is remembered per browser, so a second
tab would just reconnect you to your own seat. Add `?test=1` to the address and each tab gets
its own identity instead:

```
http://localhost:3000/?test=1
```

Open four tabs that way — create the table in the first, copy the code into the other three —
and you can drive all four hands. (Or just add bots, which is quicker.) The **Copy link** button
never passes the `?test` flag on, so real players always get a normal link.

Friends on the same Wi-Fi can join at `http://YOUR-LOCAL-IP:3000` — `ipconfig` on Windows or
`ifconfig` on macOS/Linux will tell you the address. Windows will pop up a firewall prompt the
first time; allow it on private networks.

---

## Snakes & Ladders

Everyone starts off the board and races to 100. Roll the die, move that many squares, climb
the ladders and get eaten by the snakes. The house rules:

- You must land on 100 **exactly**. Overshoot and you bounce back off the end — roll a 5
  from 97 and you go to 100, then back 2 to 98.
- A **six** earns another roll. Three sixes in a row and the whole turn is forfeit: you go
  back to where you started it.
- The board is generated fresh for every game, so nobody can learn where the snakes are.

The eight snakes are drawn as real species — a banded California mountain kingsnake, a
saddled corn snake, a striped garter, a rattlesnake with a rattle on its tail — and landing
on a head is a proper strike: the snake lunges, the jaws open, the board shakes, and your
token gets dragged down the length of its body to the tail.

## How a Hokm game goes

1. One person opens the site, types a name, and hits **Create a table**.
2. They hit **Copy link** and send it round. Whoever opens it types a name and lands in a seat.
3. Seats 1 & 3 are Team A; seats 2 & 4 are Team B — partners sit across. Move yourself with
   **Move here**, or the host can hit **Random teams** to shuffle everyone.
4. Any empty seat takes a **+ Bot**. **Fill with bots** does all of them at once.
5. The host hits **Start game**.

Cards are then dealt one at a time until somebody turns up an Ace — that player is the Hakem.
They see five cards, call the trump suit, the rest of the deal goes out, and the Hakem leads.

Each team is a side with a name — **Azure** and **Crimson** — with its own crest and banner across
the top of the screen, showing both partners, the points won as a row of seven pips, and the tricks
taken this round. Every trick a team wins goes face-down onto that team's pile, so the race to seven
is something you watch stack up. The last four cards played stay visible in the top-right corner,
with the winning card ringed in gold.

**Playing a card:** drag it up out of your hand and onto the table, or just tap it — both work.
Cards you're allowed to play glow gold; the rest dim out, and a card you can't legally play shakes
if you grab it. When it's your turn a ring burns down around your portrait; if it runs out the
table plays a sensible card for you so one person stepping away doesn't stall the evening. The ♪
button in the corner mutes the sound.

Scoring follows the standard rules: 7 tricks takes the round, worth 1 point; 7–0 by the Hakem's
team is a **Kot** (2 points); 7–0 *against* the Hakem is a **Hakem Koti** (3 points). The Hakem
keeps the role while their team keeps winning, otherwise it passes to the left. First team to 7
points wins.

If someone's connection drops mid-game, a bot covers their seat and hands the cards straight
back when they reopen the link. Games live in the server's memory, so finish a game in one
sitting — a restart (or a Render sleep) clears the tables.

---

## What's in here

```
server.js          rooms, seats, sockets, the turn clock
src/game.js        the rules — dealing, following suit, trick and round resolution, scoring
src/bot.js         bot play: trump choice, leads, follows, card counting
public/            the whole client (one HTML page, one stylesheet, one script)
test/simulate.js   plays thousands of bot games against the engine and checks every rule
test/e2e.js        boots the real server and plays a full game over sockets
```

Run the checks with `npm test`.

There are no house-rule toggles — the rules above are baked in. If you want different Kot
values or a different target score, the numbers live at the top of `src/game.js`
(`TRICKS_TO_WIN_ROUND`, `POINTS_TO_WIN_GAME`) and in `_endRound` just below.
