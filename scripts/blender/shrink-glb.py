"""Shrink already-exported prop glbs in place.

The story props were authored straight out of Poly Haven at 1k maps and scan
density. That is 16 MB of tomb, standard and stones for things the player sees
once, and it is what makes the dev server choke on first load.

This re-imports each glb, downscales its maps, thins the meshes that can take
it, and writes it back. Node and material names are never touched: the web
side looks up `headstone` (for the epitaph) and `banner-cloth` (for the wind
shader) by name, and decimation is skipped for any mesh carrying delicate
geometry such as the carved inscription.

Run with Blender open and the MCP addon connected:
    python3 scripts/blender/send.py scripts/blender/shrink-glb.py
"""
import os

import bpy

PROJECT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass"
exec(open(os.path.join(PROJECT, "scripts/blender/polyhaven.py")).read())  # noqa: S102

PROPS_DIR = os.path.join(PROJECT, "public/models/props")

# Materials whose geometry is too fine to decimate: cut lettering and the
# cross on the headstone would turn to mush.
PROTECTED_MATERIALS = ("tomb-engraving",)

# Per-file: the triangle budget for a single mesh, and meshes left alone.
# Budgets are per object, not per file — these props are a handful of objects.
PLAN = (
    {"file": "tomb.glb", "mesh_triangles": 2600, "keep": ("headstone", "kite_shield_body.001")},
    {"file": "stones.glb", "mesh_triangles": 2600, "keep": ()},
    {"file": "standard.glb", "mesh_triangles": 3000, "keep": ("banner-cloth",)},
)


def import_only(path, scene):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before and o.name in scene.objects]


def stem(name):
    """Blender suffixes a datablock it has seen before — 'tomb-engraving.004'.
    Protection has to match the stem or it silently stops protecting the
    second time this script runs in one session."""
    head, dot, tail = name.rpartition(".")
    return head if dot and tail.isdigit() else name


def is_protected(obj):
    return any(mat and stem(mat.name) in PROTECTED_MATERIALS for mat in obj.data.materials)


def shrink(spec, scene):
    path = os.path.join(PROPS_DIR, spec["file"])
    before = os.path.getsize(path)
    imported = import_only(path, scene)

    seen_materials = set()
    # Mesh data shared by several objects (the paired candlesticks) is stored
    # once in the glb. Decimate it once and re-point the rest at the result,
    # so thinning never costs us that sharing.
    thinned = {}
    report = []
    for obj in imported:
        if obj.type != "MESH":
            continue
        for mat in obj.data.materials:
            if mat and mat.name not in seen_materials:
                seen_materials.add(mat.name)
                # Keep whatever culling each material already declares; this
                # pass is about weight, not about how anything is shaded.
                prepare_material(mat, closed_solid=mat.use_backface_culling)  # noqa: F821

        obj.data.calc_loop_triangles()
        start = len(obj.data.loop_triangles)
        if obj.name in spec["keep"] or is_protected(obj):
            report.append(f"{obj.name}={start}(kept)")
            continue

        shared_key = obj.data.name
        if shared_key in thinned:
            obj.data = thinned[shared_key]
            report.append(f"{obj.name}=shared")
            continue
        # Single-user copy so the modifier can be applied at all.
        obj.data = obj.data.copy()
        decimate(obj, spec["mesh_triangles"])  # noqa: F821
        thinned[shared_key] = obj.data
        obj.data.calc_loop_triangles()
        report.append(f"{obj.name}={start}->{len(obj.data.loop_triangles)}")

    export_glb(scene, path)  # noqa: F821
    after = os.path.getsize(path)
    print(f"{spec['file']}: {before / 1e6:.2f} MB -> {after / 1e6:.2f} MB")
    print(f"    {', '.join(report)}")


original_scene = bpy.context.window.scene
work = bpy.data.scenes.new("walk-grass-shrink")
bpy.context.window.scene = work

try:
    for spec in PLAN:
        for obj in list(work.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        shrink(spec, work)
finally:
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(work)
