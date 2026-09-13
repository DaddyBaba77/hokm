# Hokm — حکم

Online board and card games you host yourself. You send friends a link, they type a name,
and you play. No accounts, no installs, no app. Empty seats can be filled with bots, so a
game works whether you have a full table or none.

Four games so far, picked on the home screen when you create a table:

| Game | Players | |
|---|---|---|
| **Hokm** | exactly 4, in two teams | the Persian trick-taking game |
| **Bazaar** | 2 to 8 | buy the bazaar, and bleed the rest dry |
| **Snakes & Ladders** | 2 to 8 | a fresh random board every game |
| **Ghahr Nakon — قهر نکن** | 2 to 6 | four pieces each, a six to get out, and nobody sulk |

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

## Bazaar

A forty-space property game round Tehran. You go round collecting ◈200 every
time you pass GO, buying the streets you land on and charging rent to everyone
who lands on yours. Hold every street of one colour and the rent doubles and you
can start building; four houses on a street become a hotel. The four metro
stations charge more the more of them one person holds, and the two utilities
charge a multiple of whatever you rolled.

The streets are real, and priced the way the city prices itself — Shoush and
Molavi at the cheap end, up through Narmak, Gisha, Vali-Asr, Gheytarieh, Vanak,
Mirdamad, Jordan, Velenjak and Sa'adat Abad to Niavaran, Zafaranieh, Elahieh and
Fereshteh at ◈400.

Three doubles running and the guard marches you off to jail — roll a double,
pay ◈50 or spend a pardon to get out. Short of cash, you can mortgage a deed for
half its price or sell buildings back at half what they cost. Run out of both and
you are ruined, and everything you own goes to whoever you owed.

**The host sets the table up in the lobby before starting**, and everyone watches
the settings change as they go:

| | |
|---|---|
| Landing on something unclaimed | buy it or pass · pass sends it to auction · everything is auctioned |
| How the game ends | on a clock (30–90 min, richest wins) · at the first ruin · last one standing |
| Starting cash | ◈1,000 to ◈2,500 |
| House rules | the tea house jackpot · double salary for landing exactly on GO · no rent while the owner is in the dungeon |

Money is seven printed notes — 1, 5, 10, 20, 50, 100 and 500 — kept in
`public/money/`. When somebody pays, the amount is broken into denominations and
the notes fly from payer to payee across the board.

The board zooms: scroll or pinch to zoom, drag to move around, double-click to
zoom to a spot, **Fit** for the whole board, and **Follow** to keep whoever is
playing in view. On a desktop it opens zoomed in on your own piece; on a phone
it opens on the whole board.

Click any square, or any deed in your list, to see its title card — the full rent
ladder with your current rung picked out, and the buttons to build, sell,
mortgage or lift a mortgage. Hit **Offer** next to another player to put a trade
to them; an offer nobody answers lapses after 45 seconds so the table is never
stuck. Auctions take over the middle of the board with a bid box and quick
raises.

Every name, card, colour and piece of art in Bazaar is our own. The mechanics are
the ones everybody knows; nothing is borrowed from anybody's board.

**The pieces.** Eight of them — lion, Azadi Tower, tea glass, sedan, pomegranate,
rug, ewer, cypress — live in `public/pieces/` as transparent renders, and each
player takes one in the lobby. The list and the default order are `PIECES` in
`src/monopoly.js`; the server refuses a piece somebody at the table already
holds, and bots take whatever is left.

**The artwork.** The middle of the board and its four corners are John's own
paintings, in `public/tiles/` and `public/bazaar-centre.jpg`, and the street paintings are
in `public/streets/`. Any square can take a full-tile picture: add it to `PHOTOS`
at the top of `public/monopoly.js` (`{ 20: 'tiles/teahouse.jpg' }`) and that
picture becomes the whole tile, title and all; `STREET_ART` just below it puts a
framed painting inside a normal tile instead. Everything else is drawn
in `public/bazaar-art.js` — a 24×24 SVG per square, where `.ink` is the dark
silhouette, `.tint` is painted in that square's colour group and `.hole` is cut
back out to the paper.

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

## Ghahr Nakon — قهر نکن

*"Don't sulk."* The old cross-and-dice race, played in the dark: the board is a
room lit by a single candle in the middle, and the path round it glows and
gutters rather than burning steadily.

Four pieces each, all of them starting in your yard. You need a **six** to bring
one out, and a six always earns another roll. Go all the way round the board and
up your own home column; first player with all four parked wins. Land on somebody
else and they go all the way back to their yard — which is where the name comes
from.

It is played on a real three-dimensional board: a dark room, a brazier of coals
burning on the table, and everything you can see lit by that fire. Swing the camera round with
a drag on the empty table; the view starts behind your own yard. The die sits in
a tray at your elbow — press it to throw it. When it is your move you can pick a
piece up and drag it onto one of the glowing squares, tap it and let it walk
itself, or press **Move it for me**; either way the squares are counted off on
screen as the piece steps them.

The men are dragons, each player's in their own colour with a ring at their feet
so you can tell whose is whose from overhead, and they turn to face the way they
are walking. To use a different model, run `tools/make-piece.py` over it and drop
the result in `public/models/` — `public/models/README.md` explains what that
does and what the board expects. Three.js lives in `public/vendor/` and is only
fetched when a Ghahr table is opened.

The host picks the board in the lobby:

- **The cross** seats up to four, forty squares round.
- **The hexagon** seats up to six, sixty squares round. Sit more than four down
  at a cross table and it quietly gives you the hexagon instead.

House rules, off unless the host turns them on — except the first, which is on:

- **Three tries for a six.** With everything still in the yard you get three
  rolls to find one, rather than one roll and a shrug.
- **A six must bring a piece out** if you have one waiting.
- **You must knock somebody back** if a legal move of yours would.
- **Exact roll home.** Overshoot the last slot and the move is simply not
  allowed; without it you bounce back off the end.

When there is only one thing a roll could possibly do, the table just does it —
you are never asked to choose between four identical pieces sitting in a yard.

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
server.js             rooms, seats, sockets, the turn clocks, the game registry
src/game.js           Hokm — dealing, following suit, tricks, rounds, scoring
src/bot.js            Hokm bot play: trump choice, leads, follows, card counting
src/snakes.js         Snakes & Ladders — board generation, moves, the house rules
src/monopoly.js       Bazaar — the 40 spaces, deeds, rent, building, auctions, trades
src/monopoly-bot.js   Bazaar bot play: buying, bidding, building, raising cash, deals
src/ghahr.js          Ghahr Nakon — both boards, the yards, the home columns, house rules
src/ghahr-bot.js      Ghahr Nakon bot play: knocking, running, and staying out of range
public/ghahr3d.js     the Ghahr board as a 3D scene — candle, pieces, die, dragging
public/vendor/        Three.js, served by the game rather than fetched from a CDN
tools/make-piece.py   turns a raw 3D model into the board piece: decimation,
                      normals, a baked occlusion pass, and the plinth split off
public/               the whole client (one HTML page, one stylesheet, a script per game)
test/simulate.js      thousands of bot Hokm games, checked against every rule
test/snakes.js        hundreds of Snakes games, checked against every rule
test/monopoly.js      hundreds of Bazaar games, with every invariant re-checked after
                      every single action
test/ghahr.js         hundreds of Ghahr Nakon games on both boards, same treatment
test/e2e*.js          boot the real server and play each game to a finish over sockets
```

Run the checks with `npm test`.

Ghahr Nakon's settings are chosen per table in the same way, with their defaults
in `DEFAULT_SETTINGS` at the top of `src/ghahr.js`; the two boards are `BOARDS`
just above it, and the shapes they are drawn as live in `makeLayout` in
`public/ghahr.js`.

Hokm and Snakes have no house-rule toggles — those rules are baked in. If you want
different Kot values or a different target score, the numbers live at the top of
`src/game.js` (`TRICKS_TO_WIN_ROUND`, `POINTS_TO_WIN_GAME`) and in `_endRound` just
below. Bazaar's settings are chosen per table in the lobby; their defaults are
`DEFAULT_SETTINGS` at the top of `src/monopoly.js`, and the board itself — every
name, price and rent tier — is the `BOARD` array just above it. The client draws
the board from `/bazaar-board.json`, which serves that same array, so editing it
in one place changes both the rules and the screen.
