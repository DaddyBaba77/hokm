# The piece model

Drop a **`piece.glb`** in this folder and every player's four men become that
model, tinted in their colour. Nothing else needs changing — the board picks it
up the next time somebody opens a Ghahr Nakon table, and falls back to the
turned pawn it draws itself if the file is not here.

What the board does with it:

- it is measured and scaled so the widest part is about four fifths of a square,
  whatever units it was modelled in;
- it is stood on the board, so model it with its feet at the origin or anywhere
  else — the bottom of its bounding box becomes the bottom of the piece;
- it is centred on the square by its bounding box, so an off-centre model is
  fine;
- every mesh inside it is given the player's colour, so textures and materials
  in the file are replaced. One solid shape reads best.

Keep it small — a few thousand triangles is plenty, since twenty-four of them
stand on the board at once. glTF binary (`.glb`) is the format; if you have an
`.obj`, `.fbx` or a Blender file, send it over and it can be converted.
