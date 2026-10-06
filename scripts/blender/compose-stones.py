"""Stone circle for 'La colina del juramento' from Poly Haven's
rock_moss_set_02 scans (imported into the 'walk-grass-assets' work scene):
weathered standing stones in a ring, one fallen. Exports stones.glb and
drops the work scene."""
import math
import random

import bpy
from mathutils import Matrix, Vector

OUT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass/public/models/props/stones.glb"
RING_RADIUS = 3.2
STONE_COUNT = 7
FALLEN_INDEX = 4
HEIGHT_RANGE = (1.4, 2.3)
WIDTH_RANGE = (0.55, 0.8)
DEPTH_RANGE = (0.35, 0.5)
random.seed(21)

work = bpy.data.scenes["walk-grass-assets"]
return_to = bpy.data.scenes[work["__return_to"]]


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return lo, hi


def bake(obj):
    """Bake the object's transform into its (own copy of the) mesh."""
    obj.data = obj.data.copy()
    obj.data.transform(obj.matrix_world)
    obj.matrix_world.identity()


try:
    sources = [o for o in work.objects if o.type == "MESH" and o.name.startswith("rock_moss_set_02")]
    stones = []
    for i in range(STONE_COUNT):
        stone = sources[i % len(sources)].copy()
        work.collection.objects.link(stone)
        bake(stone)
        stone.data.transform(Matrix.Rotation(math.radians(90), 4, "Y"))
        bpy.context.view_layer.update()
        lo, hi = world_bounds(stone)
        size = hi - lo
        height = random.uniform(*HEIGHT_RANGE)
        stone.scale = (random.uniform(*WIDTH_RANGE) / size.x, random.uniform(*DEPTH_RANGE) / size.y, height / size.z)
        angle = i / STONE_COUNT * math.tau + random.uniform(-0.12, 0.12)
        lean = 0 if i != FALLEN_INDEX else math.radians(78)
        stone.rotation_euler = (lean + random.uniform(-0.06, 0.06), random.uniform(-0.06, 0.06), angle + math.pi / 2)
        bpy.context.view_layer.update()
        lo, hi = world_bounds(stone)
        centre = (lo + hi) / 2
        target = Vector((math.cos(angle) * RING_RADIUS, math.sin(angle) * RING_RADIUS, 0))
        stone.location += Vector((target.x - centre.x, target.y - centre.y, -lo.z - 0.12))
        stones.append(stone)
    for source in sources:
        bpy.data.objects.remove(source, do_unlink=True)

    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in work.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, use_active_scene=True, export_apply=True, export_image_format="JPEG", export_jpeg_quality=85)
    print("stones exported", OUT, len(stones))
finally:
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = return_to
    bpy.data.scenes.remove(work)
