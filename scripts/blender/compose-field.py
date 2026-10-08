"""Ground props scattered through the field: a fallen trunk and two erratic
boulders, straight from Poly Haven scans.

Every one of these is scaled up. The grass reaches about 1.56 m and all three
scans are shorter than that at their native size, so untouched they would sit
completely buried. Scaled they read as what a plain this old would actually
hold: a tree that came down years ago, and stones a glacier left behind.

Download these through the MCP addon before running this script:
    download_polyhaven_asset(asset_id="dead_tree_trunk_02",     asset_type="models", resolution="1k")
    download_polyhaven_asset(asset_id="boulder_01",             asset_type="models", resolution="1k")
    download_polyhaven_asset(asset_id="namaqualand_boulder_02", asset_type="models", resolution="1k")

Exports field.glb and saves the work scene as a .blend copy.
"""
import os

import bpy
from mathutils import Vector

PROJECT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass"
exec(open(os.path.join(PROJECT, "scripts/blender/polyhaven.py")).read())  # noqa: S102

OUT = os.path.join(PROJECT, "public/models/props/field.glb")
BLEND_OUT = os.path.join(PROJECT, "blender-work/field.blend")

# Source object → exported name, triangle budget, and the height in metres it
# should stand once scaled. The grass tops out near 1.56 m.
SOURCES = (
    {"source": "dead_tree_trunk_02", "name": "log_0", "triangles": 2600, "height": 1.5},
    {"source": "boulder_01", "name": "boulder_0", "triangles": 2000, "height": 1.9},
    {"source": "boulder_02", "name": "boulder_1", "triangles": 2000, "height": 1.7},
)
# Sink each prop so it beds into the ground instead of resting on a single point.
EMBED = 0.12


def bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return low, high


def build_prop(scene, spec):
    source = require_object(spec["source"])  # noqa: F821 (from polyhaven.py)
    prop = source.copy()
    prop.data = source.data.copy()
    scene.collection.objects.link(prop)
    select_only(prop)  # noqa: F821
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    decimate(prop, spec["triangles"])  # noqa: F821

    for mat in prop.data.materials:
        if mat:
            prepare_material(mat, closed_solid=False)  # noqa: F821

    # Scale uniformly to the wanted height: the scans carry their own UVs, and
    # anything but a uniform scale smears the texture across them.
    low, high = bounds(prop)
    native_height = max(high.z - low.z, 1e-6)
    factor = spec["height"] / native_height
    for vertex in prop.data.vertices:
        vertex.co *= factor

    # Sit it on z = 0 with its base just under the surface.
    low, _ = bounds(prop)
    for vertex in prop.data.vertices:
        vertex.co.z -= low.z + EMBED
    prop.name = spec["name"]
    bpy.ops.object.shade_smooth()
    return prop


original_scene = bpy.context.window.scene
work = bpy.data.scenes.new("walk-grass-field")
bpy.context.window.scene = work

try:
    built = [build_prop(work, spec) for spec in SOURCES]

    # Lay the variants out in a row so the .blend is readable when opened.
    for index, obj in enumerate(built):
        obj.location = (index * 8, 0, 0)
    bpy.context.view_layer.update()

    for obj in built:
        obj.data.calc_loop_triangles()
    counts = ", ".join(f"{obj.name}={len(obj.data.loop_triangles)}" for obj in built)
    sizes = ", ".join(f"{obj.name}={(bounds(obj)[1] - bounds(obj)[0]).z:.2f}m" for obj in built)

    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    # copy=True: Blender writes the file but keeps this session pointed at
    # whatever the user already had open.
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT, copy=True)
    export_glb(work, OUT)  # noqa: F821
    print(f"field exported {OUT}\ntriangles: {counts}\nheights: {sizes}\nblend: {BLEND_OUT}")
finally:
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(work)
