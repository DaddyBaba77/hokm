# The piece

`piece.glb` is what every player's four men are made of, tinted in their colour.
The board falls back to a turned wooden pawn it draws itself if the file is not
here.

The dragon in this folder started as a 250,000-triangle Meshy export with no
normals, no texture coordinates and no material at all. `tools/make-piece.py`
turned it into something twenty-four copies of can stand on a board at once:

- **cut to about 6,000 triangles** by quadric decimation, which is where the
  wings stop losing their shape;
- **stood on the floor, centred and scaled** so it is exactly one unit tall,
  whatever units it was modelled in;
- **ambient occlusion baked into its vertex colours** — the board multiplies the
  player's colour by that, so the folds of the wings and the underside of the
  jaw stay dark instead of flooding flat;
- **split into `dragon` and `plinth`**, so the thing it stands on can be stone
  while the beast itself is the player's colour.

## Using a different model

    pip install trimesh fast-simplification numpy
    python3 tools/make-piece.py your-model.glb public/models/piece.glb

Anything trimesh can read goes in — `.glb`, `.obj`, `.stl`, `.ply`. Name a part
"plinth", "base", "pedestal" or "stand" and it keeps the darker stone; anything
else takes the player's colour. Nothing else in the game needs changing.

What the board does with whatever comes out:

- it is scaled so it stands about one and three-quarter squares tall, and reined
  in if it is wide enough to overhang its neighbours;
- it is stood on the board and given a ring at its feet in the player's colour,
  so you can tell whose it is from straight overhead;
- it is turned to face the way it is walking — outward in the yard, along the
  path on the ring, and inward up the home column;
- it picks up the candlelight like everything else, and glows a little brighter
  when it is one you can move.
