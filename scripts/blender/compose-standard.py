"""The fallen order's standard: weathered wooden pole and crossbar with a torn
order-blue (#0344DC) linen banner draped by a real cloth simulation. Uses Poly Haven's
rough_linen and rough_wood materials (downloaded into the 'walk-grass-assets'
work scene). Exports standard.glb and drops the work scene."""
import math
import random

import bmesh
import bpy

OUT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass/public/models/props/standard.glb"
POLE_HEIGHT = 3.4
POLE_RADIUS = 0.05
POLE_LEAN_DEG = 7
CROSSBAR_WIDTH = 1.15
BANNER_WIDTH = 1.0
BANNER_LENGTH = 1.9
BANNER_CUTS_X = 26
BANNER_CUTS_Y = 48
TEAR_DEPTH = 0.45
SIM_FRAMES = 110
WIND_STRENGTH = 2500
# #0344DC in linear space (the order's blue; the emblem is added in the app).
ORDER_BLUE = (0.00091, 0.0578, 0.7157, 1)
# Banner plane distance in front of the pole axis: clears the pole (radius
# 0.05) and the cloth's drape, so the wood never shows through. The app's
# wind shader keeps the same gap (src/story/banner-wind.ts).
BANNER_POLE_GAP = 0.12
random.seed(5)

work = bpy.data.scenes["walk-grass-assets"]
return_to = bpy.data.scenes[work["__return_to"]]


def tinted(material_name, tint):
    """Copy a Poly Haven material and multiply its base colour by a tint."""
    material = bpy.data.materials[material_name].copy()
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base = bsdf.inputs["Base Color"]
    source = base.links[0].from_socket if base.links else None
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = tint
    if source is not None:
        links.new(source, mix.inputs["A"])
    links.new(mix.outputs["Result"], base)
    return material


try:
    wood = bpy.data.materials["rough_wood"]
    linen = tinted("rough_linen", ORDER_BLUE)

    # Pole + crossbar, leaning a little like it was planted in haste.
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=POLE_RADIUS, depth=POLE_HEIGHT, location=(0, 0, POLE_HEIGHT / 2))
    pole = bpy.context.object
    pole.data.materials.append(wood)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=POLE_RADIUS * 0.7, depth=CROSSBAR_WIDTH,
                                        location=(0, 0, POLE_HEIGHT - 0.15), rotation=(0, math.radians(90), 0))
    crossbar = bpy.context.object
    crossbar.data.materials.append(wood)
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=POLE_RADIUS * 1.3, depth=0.18, location=(0, 0, POLE_HEIGHT + 0.09))
    finial = bpy.context.object
    finial.data.materials.append(wood)

    # Banner plane hanging from the crossbar (in the XZ plane, facing -Y).
    top = POLE_HEIGHT - 0.2
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=BANNER_CUTS_X, y_subdivisions=BANNER_CUTS_Y,
                                    size=1, location=(0, -BANNER_POLE_GAP, top - BANNER_LENGTH / 2), rotation=(math.radians(90), 0, 0))
    banner = bpy.context.object
    banner.name = "banner"
    banner.scale = (BANNER_WIDTH, BANNER_LENGTH, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    banner.data.materials.append(linen)

    # Torn bottom: ragged swallow-tail cut (no holes: the emblem sits mid-cloth).
    bm = bmesh.new()
    bm.from_mesh(banner.data)
    doomed = []
    for face in bm.faces:
        centre = face.calc_center_median()
        x = centre.x / (BANNER_WIDTH / 2)
        tail_cut = TEAR_DEPTH * (1 - abs(x)) + random.uniform(0, 0.12)
        height_from_bottom = centre.z - (-BANNER_LENGTH / 2)
        if height_from_bottom < tail_cut:
            doomed.append(face)
    bmesh.ops.delete(bm, geom=list(set(doomed)), context="FACES")
    # Keep only cloth still connected to the top edge: torn-off scraps would
    # otherwise fall away during the simulation.
    bm.verts.ensure_lookup_table()
    top_z = max(v.co.z for v in bm.verts)
    seen = set()
    stack = [v for v in bm.verts if v.co.z > top_z - 1e-4]
    while stack:
        vert = stack.pop()
        if vert in seen:
            continue
        seen.add(vert)
        stack.extend(edge.other_vert(vert) for edge in vert.link_edges)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in seen], context="VERTS")
    bm.to_mesh(banner.data)
    bm.free()

    # Pin the top row to the crossbar and drape it with a cloth sim + wind.
    pin = banner.vertex_groups.new(name="pin")
    top_local = max(v.co.z for v in banner.data.vertices)
    pin.add([v.index for v in banner.data.vertices if v.co.z > top_local - 1e-4], 1.0, "REPLACE")
    cloth = banner.modifiers.new("cloth", "CLOTH")
    cloth.settings.vertex_group_mass = "pin"
    cloth.settings.quality = 6
    cloth.settings.mass = 0.25
    cloth.settings.tension_stiffness = 12
    cloth.settings.bending_stiffness = 0.05
    cloth.settings.air_damping = 0.4
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = SIM_FRAMES
    solidify = banner.modifiers.new("thickness", "SOLIDIFY")
    solidify.thickness = 0.008
    bpy.ops.object.effector_add(type="WIND", location=(-2.5, -1.5, top - 0.8))
    wind = bpy.context.object
    wind.rotation_euler = (math.radians(90), 0, math.radians(-60))
    wind.field.strength = WIND_STRENGTH
    wind.field.noise = 6
    wind.field.flow = 0.6
    turbulence_location = (0.5, -0.8, top - 1.0)
    bpy.ops.object.effector_add(type="TURBULENCE", location=turbulence_location)
    turbulence = bpy.context.object
    turbulence.field.strength = 60
    turbulence.field.size = 0.6

    work.frame_start = 1
    work.frame_end = SIM_FRAMES
    for frame in range(1, SIM_FRAMES + 1):
        work.frame_set(frame)

    # Freeze the draped shape.
    bpy.context.view_layer.objects.active = banner
    for obj in bpy.data.objects:
        obj.select_set(False)
    banner.select_set(True)
    bpy.ops.object.convert(target="MESH")
    bpy.data.objects.remove(wind, do_unlink=True)
    bpy.data.objects.remove(turbulence, do_unlink=True)

    # Lean the whole standard.
    for obj in (pole, crossbar, finial, banner):
        obj.select_set(True)
    root = bpy.data.objects.new("standard_root", None)
    work.collection.objects.link(root)
    for obj in (pole, crossbar, finial, banner):
        obj.parent = root
    root.rotation_euler = (math.radians(-POLE_LEAN_DEG), math.radians(3), 0)

    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in work.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, use_active_scene=True, export_apply=True, export_image_format="JPEG", export_jpeg_quality=85)
    print("standard exported", OUT, "banner verts", len(banner.data.vertices))
finally:
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = return_to
    bpy.data.scenes.remove(work)
