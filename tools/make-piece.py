"""Turn Meshy's raw dragon into a board piece.

The upload is 250,000 triangles of bare geometry — no normals, no texture
coordinates, no material. Twenty-four of them stand on the board at once, so it
is cut down to something a phone can draw, split into the beast and the plinth
it stands on, and given a baked ambient-occlusion pass so the candle finds the
folds of its wings instead of washing it flat.

Run it over any model you want as the board piece:

    pip install trimesh fast-simplification numpy
    python3 tools/make-piece.py new-model.glb public/models/piece.glb

The board colours what comes out, so the model needs no material of its own.
Any part of it whose name mentions a plinth, base, pedestal or stand keeps the
darker stone; everything else takes the player's colour.
"""
import sys
import numpy as np, trimesh, fast_simplification as fs

SRC = sys.argv[1] if len(sys.argv) > 1 else "piece-source.glb"
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/models/piece.glb"
TARGET_FACES = int(sys.argv[3]) if len(sys.argv) > 3 else 6000

scene = trimesh.load(SRC, force='scene')
mesh = trimesh.util.concatenate([g for g in scene.geometry.values()])
mesh.merge_vertices()
print(f"source: {len(mesh.faces)} faces")

# ── cut it down
ratio = 1.0 - TARGET_FACES / len(mesh.faces)
v, f = fs.simplify(np.asarray(mesh.vertices, np.float32),
                   np.asarray(mesh.faces, np.int32),
                   target_reduction=float(np.clip(ratio, 0, 0.999)))
low = trimesh.Trimesh(vertices=v, faces=f, process=True)
low.merge_vertices()
print(f"cut to: {len(low.faces)} faces, {len(low.vertices)} vertices")

# ── stand it on the floor, centre it, and scale to one unit tall
low.apply_translation(-low.bounds.mean(axis=0))
low.apply_translation([0, -low.bounds[0][1], 0])
height = low.bounds[1][1]
low.apply_scale(1.0 / height)
print(f"height now {low.bounds[1][1]:.3f}, footprint "
      f"{low.extents[0]:.3f} x {low.extents[2]:.3f}")

# ── bake ambient occlusion through a voxel grid
# A real ray bake against 6,000 triangles is too slow to be worth it; marching a
# handful of rays through an occupancy grid gets the same soft creases for a
# fraction of the work.
PITCH = 1.0 / 110
vox = low.voxelized(pitch=PITCH).fill()
grid = np.asarray(vox.matrix, dtype=bool)
origin = np.asarray(vox.transform)[:3, 3]
shape = np.array(grid.shape)
print(f"occupancy grid {grid.shape}")

rng = np.random.default_rng(7)
DIRS, STEPS = 48, 26
# cosine-weighted directions over a hemisphere, reused for every vertex
u = rng.random(DIRS); vv = rng.random(DIRS)
r = np.sqrt(u); th = 2 * np.pi * vv
local = np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(np.maximum(0, 1 - u))], axis=1)

normals = np.asarray(low.vertex_normals)
verts = np.asarray(low.vertices)

# a basis per vertex, so the hemisphere sits on its normal
up = np.tile(np.array([0.0, 0.0, 1.0]), (len(verts), 1))
flip = np.abs(normals[:, 2]) > 0.9
up[flip] = np.array([1.0, 0.0, 0.0])
tang = np.cross(up, normals); tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
bitan = np.cross(normals, tang)

start = verts + normals * (PITCH * 1.6)
hits = np.zeros(len(verts), dtype=np.float32)
step = PITCH * 1.25
for d in range(DIRS):
    ld = local[d]
    ray = tang * ld[0] + bitan * ld[1] + normals * ld[2]
    blocked = np.zeros(len(verts), dtype=bool)
    for s in range(1, STEPS + 1):
        pts = start + ray * (step * s)
        idx = np.floor((pts - origin) / PITCH + 0.5).astype(np.int64)
        inside = np.all((idx >= 0) & (idx < shape), axis=1)
        probe = np.zeros(len(verts), dtype=bool)
        ii = idx[inside]
        probe[inside] = grid[ii[:, 0], ii[:, 1], ii[:, 2]]
        blocked |= probe
    hits += blocked
ao = 1.0 - hits / DIRS
# keep it as shading rather than dirt: lift the floor and flatten the top
ao = np.clip(ao, 0.0, 1.0) ** 0.85
ao = 0.54 + 0.46 * (ao - ao.min()) / max(1e-6, ao.max() - ao.min())
print(f"ambient occlusion {ao.min():.2f} – {ao.max():.2f}")

# ── split the beast from the plinth it stands on
cent = low.triangles_center[:, 1]
PLINTH_TOP = 0.155
is_base = cent < PLINTH_TOP
print(f"plinth {is_base.sum()} faces, dragon {(~is_base).sum()} faces")

def part(face_mask, name):
    faces = low.faces[face_mask]
    used = np.unique(faces)
    remap = np.full(len(low.vertices), -1, np.int64)
    remap[used] = np.arange(len(used))
    sub = trimesh.Trimesh(vertices=low.vertices[used], faces=remap[faces], process=False)
    sub.vertex_normals = low.vertex_normals[used]
    shade = ao[used]
    cols = np.stack([shade, shade, shade, np.ones_like(shade)], axis=1)
    sub.visual = trimesh.visual.ColorVisuals(sub, vertex_colors=(cols * 255).astype(np.uint8))
    sub.metadata['name'] = name
    return sub

body = part(~is_base, 'dragon')
base = part(is_base, 'plinth')

out = trimesh.Scene()
out.add_geometry(body, geom_name='dragon', node_name='dragon')
out.add_geometry(base, geom_name='plinth', node_name='plinth')
out.export(OUT)
print(f"wrote {OUT}")
