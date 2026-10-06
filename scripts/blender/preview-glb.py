"""Render a front preview of an exported prop GLB in a throwaway scene.
Set PREVIEW_GLB / PREVIEW_PNG before sending (prepended by the caller)."""
import math

import bpy
from mathutils import Vector

original = bpy.context.window.scene
scene = bpy.data.scenes.new("walk-grass-preview")
bpy.context.window.scene = scene
try:
    bpy.ops.import_scene.gltf(filepath=PREVIEW_GLB)  # noqa: F821 (injected)
    objects = [o for o in scene.objects if o.type == "MESH"]
    lo = Vector((min((o.matrix_world @ Vector(c)).x for o in objects for c in o.bound_box),
                 min((o.matrix_world @ Vector(c)).y for o in objects for c in o.bound_box),
                 min((o.matrix_world @ Vector(c)).z for o in objects for c in o.bound_box)))
    hi = Vector((max((o.matrix_world @ Vector(c)).x for o in objects for c in o.bound_box),
                 max((o.matrix_world @ Vector(c)).y for o in objects for c in o.bound_box),
                 max((o.matrix_world @ Vector(c)).z for o in objects for c in o.bound_box)))
    centre = (lo + hi) / 2
    span = max(hi - lo)
    cam_data = bpy.data.cameras.new("preview-cam")
    cam = bpy.data.objects.new("preview-cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = centre + Vector((span * 0.35, -span * 1.6, span * 0.35))
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun_data = bpy.data.lights.new("preview-sun", "SUN")
    sun_data.energy = 3.5
    sun = bpy.data.objects.new("preview-sun", sun_data)
    sun.rotation_euler = (math.radians(55), 0, math.radians(-30))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("preview-world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.06, 0.09, 1)
    scene.world = world
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.filepath = PREVIEW_PNG  # noqa: F821
    bpy.ops.render.render(write_still=True)
    print("preview written", PREVIEW_PNG)  # noqa: F821
finally:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = original
    bpy.data.scenes.remove(scene)
