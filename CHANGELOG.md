# Changelog

## 1.22.0

- **The pieces are dragons.** John's model, processed into something twenty-four
  copies of can stand on a board at once: cut from 250,000 triangles to about
  6,000, given the normals it arrived without, and with ambient occlusion baked
  into its vertex colours so the candle finds the folds of its wings instead of
  washing the whole beast flat.
- **Each player's dragons are their own colour**, and the plinth each one stands
  on stays stone. A ring at its feet in the same colour makes whose it is
  obvious from straight overhead, and the ones you can move this turn glow.
- **They face where they are going** — outward in the yard while they wait,
  along the path as they walk the ring, and inward up the home column. They turn
  as they go rather than snapping round.
- **A different model is one command away.** `tools/make-piece.py` does the whole
  job — decimation, normals, the occlusion bake, splitting the plinth off — for
  any model trimesh can read. `public/models/README.md` has the details.
- The two greens were a lime and a mint that read as the same colour across a
  dark table. The second is now a proper emerald.
- Gentler on a phone: half-size shadow maps and a capped pixel ratio on small
  screens, and only the beast itself throws a shadow.

## 1.21.0

- **Ghahr Nakon is now a real three-dimensional board.** A table in a dark room
  with one candle burning in the middle of it. The candle is an actual light:
  it flickers, and when it gutters the whole room dims and every piece's shadow
  moves with it. You can swing the camera round the table and lean in.
- **The die is a die.** It sits in a little felt tray at your elbow, and when you
  roll it tumbles across the table and lands showing what you rolled. Throw it by
  pressing the die itself, or use the Roll button — both do the same thing.
- **Move your own man, or let the table do it.** Pick a piece up and drag it to
  where it lands: the squares it may go to glow, and the one under your hand
  lifts to meet it. Drop it anywhere else and it goes back. Prefer not to?
  **Move it for me** plays a sensible move, and tapping a piece walks it itself.
- **The moves are counted as they are walked.** A big number over the board
  counts each square the piece steps, so you can see for yourself that it landed
  where the roll said it should. Press anywhere while it is walking and it
  hurries up.
- **Your own corner is nearest.** The camera starts behind your own yard, so the
  board is the right way round for you without touching anything.
- **A model of your own.** Drop a `piece.glb` into `public/models/` and every
  player's four men become that model in their own colour; there is a turned
  wooden pawn in the meantime. `public/models/README.md` says what the board
  does with it.
- Three.js ships with the game rather than coming off a CDN, and it is only
  fetched when somebody actually opens a Ghahr table — the other three games
  load exactly as much as they did before.

### Fixed

- **Bazaar: the dice now always show what you rolled.** They were only drawn as
  part of a piece moving, so a roll that moved nobody — a turn in the dungeon
  that was not a double, or a third double — cleared the dice and showed you
  nothing at all. Every roll now has its own identity and plays its own throw,
  and the dice stay on the table afterwards showing how they fell.
- Ghahr Nakon bots were listed as "Nasrin (bot) (bot)".
- The turn-clock check in the Hokm end-to-end run could fail on a busy machine
  for no good reason. It no longer races.

## 1.20.0

- **A fourth game: Ghahr Nakon — قهر نکن.** *"Don't sulk."* Four pieces each,
  a six to get out of the yard, all the way round and up your own home column.
  Land on somebody and they go back to the start — hence the name.
- **Two boards, and the host picks.** The cross seats up to four; the hexagon
  seats up to six. Sit five or six down at a cross table and it hands you the
  hexagon rather than refusing.
- **Three tries for a six** is on by default: with everything still in the yard
  you get three rolls to find one. Three more house rules are there to switch on
  — a six must bring a piece out, you must knock somebody back when you can, and
  an exact roll to get home.
- **Played in the dark.** The board is a room lit by one candle. The path round
  it glows amber and *gutters* — every square on its own rhythm, dipping and
  catching the way a flame does, never pulsing in unison like a lamp. Your start
  square and your home column burn in your own colour, and the flame in the
  middle leans and flickers on its own. Anyone who has asked their machine for
  less motion gets it all held still.
- **Nobody is asked to choose between four identical things.** Four pieces
  sitting in a yard are one move, and when a roll leaves only one legal move the
  table simply plays it.
- A bot for every empty seat: it takes a capture when one is going, gets pieces
  out and home, and tries not to park in front of somebody's start square.
- Under the hood: `addBot` and `clearSeat` no longer take the server down when a
  client sends them without a seat number, and a spectator at a Ghahr table is
  now properly told they are only watching. A pair of stray braces in the
  stylesheet — left over from an earlier edit — were quietly eating the rule that
  followed them; they are gone.

## 1.19.0

- **You can step out of a table without losing it.** A Back arrow in the corner
  walks you out one screen at a time — game, then lobby, then home — and your
  seat stays exactly where it was the whole way.
- **The lobby, mid-game.** Step back from a game and you get your table's lobby:
  the code, the Copy link button, everyone's seats — with a big **Back to the
  game** to go straight in. Nothing there can disturb a game in progress.
- **The home screen remembers.** Step all the way out and it says *You are still
  at table ABCD* with **Go back in** — one press and you are back where you were,
  in the lobby or in the middle of the game. **Leave it** is there too, for when
  you actually mean it.
- **The browser's own back button walks the same path** instead of throwing you
  off the page. Press it once too often from the home screen and it leaves, the
  way it should.

## 1.18.0

- **Railway rent now opens the payment mat like everything else.** It always
  should have: the board worked out who paid what by comparing everyone's cash
  before and after, so two things in one move could cancel each other out and
  vanish. Pass GO for ◈200 and land on a ◈200 railway and the totals had not
  moved, so nothing appeared to happen at all.
- The server now keeps a **ledger of every payment** — rent, tax, fines, the GO
  salary, what a card gives or takes — and the table plays them back one at a
  time, in the order they happened. You see the salary arrive, then you hand over
  the rent, even though the two are the same number.
- **Pay always works.** You can still drag your notes across for the feel of it,
  but pressing Pay now hands them over for you rather than waiting.
- Money you chose to spend — buying, building, lifting a mortgage, settling a
  trade — still just flies, as before.

## 1.17.0

- **Build a round in one press.** A complete colour in your hand carries a green
  **⌂ ×3 — ◈150** button: one house on every street of the set at once, which is
  how you actually build. Two-street colours show ×2, and the deed card offers
  the same thing beside the single house.
- It goes up lowest street first, so the group is never uneven along the way, and
  it is **all or nothing** — if you cannot afford the whole round or the bank is
  short, none of it happens and nothing is paid.
- The button says why when it cannot go: not enough cash, a mortgage on the
  group, or the bank out of houses. It disappears once the colour is all hotels.

## 1.16.0

- **Counter an offer instead of just taking it or leaving it.** An offer put to
  you now carries **Accept · Counter · Decline**. Press Counter and the deal
  table opens with their terms already turned round — what they asked of you is
  sitting in *You give*, what they offered is in *You get* — so you only have to
  change the part you do not like, and send it back.
- It goes back and forth as a proper haggle: they can counter your counter. After
  four passes somebody has to say yes or no, so a deal can never run all night.
- Countering is the one thing you can do out of turn, because it is an answer
  rather than a new offer.

## 1.15.1

- **The owner's sash carries their name on every rail**, not just along the
  bottom. On the top row it had been sitting underneath the name strip; it now
  steps into its own place against the colour band. On the left and right the
  sash turns on its side and the name runs up or down it, stopping short of the
  strip so a long name is never cut in half.
- The price no longer lands on top of the sash on the left rail, and the little
  owner pill that used to float on the painting is gone — the sash says it
  better.

## 1.15.0

- **The auction is three times the size** and properly under the hammer: the
  property's painting, the standing bid in the leading bidder's colour at the
  size of a scoreboard, and everyone at the table round it as their own piece —
  the one bidding lit up, the leader carrying the price, whoever has dropped out
  greyed and struck through. The whole panel glows in the colour of whoever is
  winning it.
- **A clock on the bidding** — a ring that drains with the seconds inside it, and
  turns red and starts pulsing when it is nearly up.
- **Ready your bid before it reaches you.** Set an amount while somebody else is
  bidding and it goes in the moment the hammer comes round — or say you will drop
  out and it passes for you. If the price goes over what you readied, it tells
  you rather than bidding anyway.
- The bid pad is a proper one now: big plus and minus, **+20 / +50 / +100 / +250**
  and **All in**, with the button naming the exact figure you are about to bid.
- **No blue pieces.** The table and the board are navy, so a blue player vanished
  into them — that colour is out, replaced with a lime that carries.
- **The price on a square is a watermark** so it no longer sits on top of the
  painting; hover the square and it comes forward and reads solid.
- **No more bare table around the middle painting** — it sits in a bronze mount
  that runs right up to the squares.

## 1.14.0

- **There are only two roads to jail now**: the Go to Jail corner, and a card
  that says so. Rolling doubles all day leaves you a free citizen. The old rule
  is still there as a house rule in the table settings if anybody wants it back.
- **An owner's sash on every square they hold** — a band of their colour pressed
  right up against the property's own colour bar, with their name on it on the
  top and bottom rails. You can read the whole board's ownership without
  looking twice.
- **The pieces always sit on top.** A piece landing on an owned square no longer
  disappears behind the sash or the price.
- **The price is a chip on the shoulder of the name strip** rather than squeezed
  in beside the name — about two and a half times its old size, and the
  painting's own title is no longer covered.
- **Click any player on the right** and the left rail shows their money and their
  deeds, laid out exactly the way yours are. Everybody can look at everybody.
- **The right-hand panel is much bigger** — the dice, the names, the money.
- **The deed card is twice the size with text three times as large**, and you can
  click it to turn it over and see the painted face with the price on it.
- **Full screen**, from the button in the corner or by pressing F.

## 1.13.0

- **The deal table.** Press Offer and the table opens: your belongings on one
  side, theirs on the other, and a tray across the bottom. Drag a note or a deed
  down into **You give** to offer it, or into **Your get** to ask for it — it
  lifts off the table, tilts with your hand and throws a shadow, the way a card
  does in Hokm, and the lane you are over lights up. Tap to take anything back.
  Nothing is sent until you press the button.
- **Deals are struck on your own turn**, the way they are at a real table. The
  Offer button waits for it, and says so.
- **Everyone at the table sees the offer** — laid out as the two piles that would
  change hands, with the actual notes and the actual deeds, above the board where
  nobody can miss it, and a clock on it.
- **You hand over your own money.** Rent and the tax squares open a mat: your
  notes are counted out into a bundle, you drag it across to whoever is owed, and
  press Pay. If you have stepped away it settles itself after twenty seconds.
- **Fortune and Treasury cards wait for you.** They stay on the table until you
  press Next instead of flicking past before you have read them.
- **Nothing teleports without warning.** Being sent to jail, to GO or back a few
  squares now shows what is about to happen — with a picture of where you are
  going — and the piece only moves when you press Next. A card that sends you
  somewhere is read out **before** the piece moves rather than after.
- **The tax squares carry your gem.** Income Tax and Luxury Tax are the painted
  card, portrait on the bottom rail and landscape on the right.
- The notes and deeds in the deal table and on the payment mat are about four
  times the size they were.

## 1.12.0

- **Your hand is four times the size.** The rail down the left is as wide as the
  screen can spare, and the money fills it — the ◈500 note is now big enough to
  read every word on it, with the count stamped in the corner. The deed cards
  grew with it: the painting on each one is worth looking at again.
- **The pieces stand out on the board.** Each one is bigger and rings itself in
  its player's colour — a dark outline, the colour band, a halo of it and a
  shadow on the board underneath — so you can find yourself at a glance on a
  board made of photographs. Yours carries a gold band; whoever's turn it is
  pulses.

## 1.11.0

- **Pick the dice up and shake them.** Hold the dice down and shake your mouse
  (or your finger) — the box glows, the charge bar fills, and the harder and
  longer you shake the more they tumble when you let go. The Roll button still
  works if you would rather just tap.
- **The pieces walk instead of teleporting.** Every square gets its own moment,
  and **the game counts the move off for you** — a number pops on each square as
  you pass over it, the last one in green where you land, and "3 of 7" sits
  under the dice the whole way, so you can always see you got where you should.
- **The whole table is slower.** The bots take a proper beat before they act and
  you get longer on the clock at every decision — 75s to roll, 45s to decide on
  a property, 30s in an auction, two minutes to settle a debt.
- **Every owned square says who holds it** — their piece and their name on a
  small pill in the corner of the card, and the name strip takes a wash of their
  colour. You can read the whole board's ownership at a glance.
- Three doubles in a row still sends you straight to jail, and there is now a
  test that says so: two doubles don't, a plain roll in between resets the run,
  and the count never carries over to the next player.

## 1.10.0

- **Every square is one of John's painted cards now.** Twenty-two Tehran
  streets, four railways, the electric and water works, and the two decks —
  each one the real painting, filling its square.
- Each card comes in two cuts: a tall one for the top and bottom rails and a
  wide one for the left and right, so the picture always fits the shape of the
  square it is sitting in and nothing has to be thrown away to make it fit.
- The name and the price ride on a strip of parchment across the bottom of the
  card, clear of the painting's own title, so both are readable.
- **The streets are the real city, priced the way the city prices itself.**
  Shoush and Narmak at ◈60 at the bottom; Ekbatan, Kargar Shomali and Enghelab;
  Bagh-e Golha, Gisha and Azadi; Darkeh, Gheytarieh and Tajrish; Vali-Asr, Vanak
  and Sa'adat Abad; Pasdaran, Jordan and Velenjak; Niavaran, Farmanieh and
  Zafaranieh; and Elahieh and Fereshteh at the top.
- **The Metro is now four railways** — North, South, East and West — each one
  sitting on the side of the board it is named for.
- The colour bands, the houses and hotels, the prices and every rent are exactly
  as they were. Only the names and the pictures have changed.

## 1.9.0

- **The money is real money now.** Seven Bazar notes — 1, 5, 10, 20, 50, 100 and
  500 — and when anybody pays anybody, the notes fly across the table, the same
  way a card leaves your hand in Hokm.
- The amount is broken into actual denominations, so ◈750 goes over as a 500, two
  hundreds and a fifty rather than an abstract number.
- Notes fly between the two pieces on the board when you can see them both, and
  fall back to the players' rows in the side panel when somebody is off-screen.
  Taxes, fines and your GO salary fly to and from the middle of the board.
- A running total floats up beside whoever gained or lost it, and the paper
  riffles as it goes.
- **Your hand runs down the left of the table** — your money and your deeds,
  and the notes fly into and out of it when you are paid or you pay.
- The money is piled the way you would hold it, biggest note on top, and your
  deeds are piled in their colour sets with the front one face up and the rest
  peeking out behind. Hover a pile — or tap its label on a phone — and it opens
  out so you can see everything in it, ◈50 and ◈1 ×2 and all.
- A complete set glows in its own colour, and each pile says how far along it
  is: 2/3, 4/4.

## 1.8.0

- **The board zooms and pans.** Scroll or pinch to zoom, drag to move around,
  double-click to zoom to a spot, and **Fit** for the whole board. On a desktop
  the table now opens at reading distance — squares about three-quarters again
  as wide as they were — because nine squares and two corners can only be so
  wide at a fixed board size; the rest has to come from the zoom.
- **Follow** keeps whoever's turn it is in view while you are zoomed in.
- **The middle is a framed painting on a patterned table** rather than filling
  the whole centre, so the board and the art no longer fight each other.
- **The street paintings are cut to their own shape.** They were being squared
  off before, which threw away a third of each picture and made what was left
  look small; now the frame matches the artwork and you see all of it.
- **Street names are set as large as each square can take.** Measured in the
  browser, per name — so Vanak and Jordan are big, Shahrak-e Gharb still fits,
  and no name ever snaps in the middle of a word again.
- The colour band is thinner and sized off the square's width rather than its
  depth, which is what a real board does.
- Cleaned up three half-rendered pips on the dice in the centre painting; that
  die now reads as a proper two.

## 1.7.0

- **Eight playing pieces, and you pick yours.** The Persian Lion, the Azadi
  Tower, a tea glass, a classic sedan, a pomegranate, a rolled Persian rug, an
  ewer and a cypress — cut out of John's render as little metal miniatures.
- A piece picker sits in the lobby: tap one to take it, and the ones other people
  have already taken are hatched out. Bots take what's left.
- The pieces show up ringed in your colour on the board and beside your name in
  the player list, so at a glance you still know who is who even at phone size.

## 1.6.0

- **The board is Tehran now.** All twenty-two streets are real places, laid out
  the way the city prices itself — Shoush and Molavi at the cheap end, then the
  neighbourhoods, midtown, the hills and the boulevards, up through Velenjak and
  Sa'adat Abad to Niavaran, Zafaranieh, Elahieh and **Fereshteh** at ◈400.
- Every street and every station carries a painting of the real place.
- The four railroads are the **metro**: Tajrish, Sadeghieh, Azadi and Enghelab.
  The utilities are **Tehran Electric** and **Tehran Water**, and the two taxes
  are Income Tax and Luxury Tax.
- The colour groups kept their exact colours and picked up city names: The Old
  City, The Neighbourhoods, Midtown, The Hills, The Boulevards, New Tehran, The
  Heights and North Tehran.
- The corner is called Jail rather than the dungeon, matching the artwork, and
  the Fortune cards that named the old invented streets now name real ones.

## 1.5.0

- **The Bazaar board is properly dressed.** Every square is aged parchment with a
  hairline frame, a Persian name above its English one, and a drawing of its own
  — coppersmiths' pots, a loom, dye vats, a tiled dome, a minaret, an astrolabe,
  a peacock, a caravanserai gate, thirty in all, each tinted with its own colour
  group.
- **The middle of the board is John's painting of Tehran**, and the four corners
  — GO, the dungeon, the tea house and the walk to the dungeon — are his too.
- Nothing on the board is printed sideways any more. With pictures on it, an
  upside-down minaret reads as a mistake, so every square sits upright and the
  side rails put the name and the picture next to each other instead.
- The decks are named the way John names them: **بخت / Fortune** and
  **خزانه / Treasury**.
- The dice moved off the painting and into the side panel, next to Roll.
- Fixed: a long list of deeds squashed itself instead of scrolling.
- Fixed: the board data is no longer cached by the browser, so a deploy that
  changes a price can't leave anyone playing off last week's board.
- The end-to-end tests now refuse to run against a stray server left over from an
  aborted run, instead of quietly testing an old build.

## 1.4.0

- **A third game: Bazaar.** A forty-space property-trading game for two to eight
  players, themed as a Persian bazaar — spice lanes and carpet quarters, four
  caravanserais on the Silk Road, a waterworks and a lamphouse, and a dungeon to
  be thrown into.
- Everything works the way the classic game does: eight colour groups, doubled
  rent on an unimproved monopoly, even building, four houses to a hotel, a bank
  holding exactly 32 houses and 12 hotels, caravanserai rents that climb with
  each one you hold, utilities charging a multiple of your roll, mortgages at
  half price, jail on three doubles, and ruin when you cannot pay.
- **Auctions, trading, mortgaging and building** all in, with a proper deed card
  for every square showing the full rent ladder and which rung you are on.
- **The host sets the table up first**: buy-or-pass, pass-to-auction or
  auction-everything; end on a clock, at the first ruin or last one standing;
  starting cash; and three house rules — the tea house jackpot, double salary for
  landing exactly on GO, and no rent while the owner is in the dungeon.
- The board, the two decks of sixteen cards, the pieces and the centre medallion
  are all drawn from scratch — no borrowed artwork or names.
- Bots buy, bid, build, mortgage their way out of trouble and propose trades, so
  a table with empty seats still plays a real game.

## 1.3.1

- **Fixed the miscounted move.** A token sometimes snapped straight to its
  destination and then hopped again from there, so a roll of 2 looked like it
  only moved one square. The board now leaves the tokens alone while a move is
  still being animated.
- **New dice.** The die is a real cube now — it tumbles in three dimensions,
  shakes as it goes, and drops onto its face with a bounce and a shadow.
- **Better ladders.** Rails are layered timber with grain, shading and a light
  edge, and they narrow towards the top so the ladder leans away from you.
- **Slimmer snakes.** The bodies were far too thick and swallowed the squares
  underneath; every snake is about a third narrower, with the markings, scales
  and heads scaled to match. The numbers are readable again.

## 1.3.0

- The app now hosts **more than one game**. You pick which one you're creating
  from the home screen, and the lobby adapts — four seats and teams for Hokm,
  two to eight players for the new game.
- Added **Snakes and Ladders**: a fresh random board every game, exact landing
  on 100 with a bounce back off the end, a six earning another roll, and a third
  six in a row forfeiting the whole turn.
- The eight snakes are drawn as real species — a banded kingsnake, a saddled
  corn snake, a striped garter, a rattlesnake with a rattle — with tapered
  bodies, overlapping scales and slit-pupil eyes on the vipers.
- Landing on a head is a proper strike: the snake lunges, the jaws open on the
  gape, the board shakes, and your token is dragged down the body to the tail.
- Tokens hop square by square, climb ladders, and bounce off 100 when a roll
  overshoots. The die tumbles before it settles.

## 1.2.0

- Retheme: the table is now a deep indigo ground woven with gold girih stars and
  carpet rosettes, in place of the green felt.
- The cards land on a gold medallion at the centre of the table, with a pool of
  shadow beneath it so the cards stay easy to read.
- Panels, modals, the log drawer and the emote button all recoloured to match.

## 1.1.0

- Team banners now split the header in half: bigger crests, bigger names, both
  partners listed, and larger point pips.
- Points and tricks are shown as a pair of gems; the trick gem lights up and
  pulses from 5 tricks onward, when the round is nearly won.
- Added a **last trick** panel in the top-right showing the four cards just
  played, with the winning card ringed in gold and who took it.
- Moved the won-trick piles so they no longer sit under a player's emote bubble:
  the opponents' pile lives in the top-left corner, yours stays beside you.
- The player at the top of the table now gets their emote bubble below their
  portrait instead of behind the header.
- Moved the Hokm card in from the left edge.
- Sound and log buttons moved out of the header to the bottom-right.

## 1.0.0

- Four-player online Hokm with room codes, AI bots, and reconnection.
- Drag-to-play hand with a curved fan, card animations, hero portraits, a turn
  clock with auto-play, emotes, and synthesised sound.
- Hand sorted so suit colours alternate black/red wherever the hand allows.
