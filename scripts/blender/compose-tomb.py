"""Sir Fabroos' tomb: a carved gothic headstone in Poly Haven's lichen_rock
(real displacement relief), with the name and a cross cut into the stone by
boolean (Cinzel), the grooves faintly glowing gold. Plinth, scanned mossy
border stones, his kite shield and two candlesticks. Assets must already be
in the 'walk-grass-assets' work scene: lichen_rock (texture), rock_moss_set_02,
kite_shield, wooden_candlestick. Front faces Blender -Y (glTF +Z)."""
import math
import random

import bmesh
import bpy
from mathutils import Vector

OUT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass/public/models/props/tomb.glb"
FONT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass/.font-work/cinzel.ttf"
HEAD_WIDTH = 0.82
HEAD_HEIGHT = 1.35
HEAD_DEPTH = 0.16
HEAD_LEAN_DEG = -4
PLINTH = (1.15, 0.42, 0.2)
CARVE_DEPTH = 0.012
TEXT_SIZE = 0.12
TEXT_Z = 0.62
GROOVE_GLOW = (1.0, 0.78, 0.42, 1)
GROOVE_GLOW_STRENGTH = 2.5
CANDLE_DECIMATE_RATIO = 0.06
TEXT_VOXEL_SIZE = 0.0018
SHIELD_SCALE = 0.62
BORDER_STONE_SCALE = 0.16
random.seed(3)

work = bpy.data.scenes["walk-grass-assets"]
return_to = bpy.data.scenes[work["__return_to"]]


def image(name_part):
    return next(i for i in bpy.data.images if name_part in i.name)


def stone_material():
    """Clean UV-mapped PBR material from the lichen_rock images (glTF-exportable)."""
    m = bpy.data.materials.new("tomb-stone")
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    color = nodes.new("ShaderNodeTexImage"); color.image = image("lichen_rock_Diffuse")
    rough = nodes.new("ShaderNodeTexImage"); rough.image = image("lichen_rock_Rough"); rough.image.colorspace_settings.name = "Non-Color"
    normal_tex = nodes.new("ShaderNodeTexImage"); normal_tex.image = image("lichen_rock_nor_gl"); normal_tex.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(normal_tex.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def groove_material():
    m = bpy.data.materials.new("tomb-engraving")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.05, 0.04, 0.03, 1)
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Emission Color"].default_value = GROOVE_GLOW
    bsdf.inputs["Emission Strength"].default_value = GROOVE_GLOW_STRENGTH
    return m


def link(obj):
    work.collection.objects.link(obj)
    return obj


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.data.objects:
        o.select_set(False)
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def uv_unwrap(obj, island_scale=1.0):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.data.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=island_scale)
    bpy.ops.object.mode_set(mode="OBJECT")


def bevelled(obj, width):
    """Soften the cut edges; keeps the mesh closed so booleans stay clean."""
    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width = width
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    apply_all(obj)


def gothic_headstone():
    bm = bmesh.new()
    half = HEAD_WIDTH / 2
    shoulder = HEAD_HEIGHT - HEAD_WIDTH * 0.5
    pts = [(-half, 0), (half, 0), (half, shoulder)]
    steps = 14
    for i in range(1, steps + 1):
        angle = i / steps * math.radians(60)
        pts.append((half - HEAD_WIDTH * (1 - math.cos(angle)), shoulder + HEAD_WIDTH * math.sin(angle) * 0.92))
    for x, z in reversed(pts[3:-1]):
        pts.append((-x, z))
    pts.append((-half, shoulder))
    face = bm.faces.new([bm.verts.new((x, 0, z)) for x, z in pts])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0, HEAD_DEPTH, 0), verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
    mesh = bpy.data.meshes.new("headstone")
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new("headstone", mesh))
    obj.location = (0, -HEAD_DEPTH / 2, PLINTH[2] - 0.02)
    return obj


def carve(target, cutters):
    for cutter in cutters:
        mod = target.modifiers.new("carve", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.material_mode = "TRANSFER"
        mod.object = cutter
    apply_all(target)
    for cutter in cutters:
        bpy.data.objects.remove(cutter, do_unlink=True)


def text_cutter(body, size, z, groove):
    curve = bpy.data.curves.new("epitaph", "FONT")
    curve.body = body
    curve.font = bpy.data.fonts.load(FONT, check_existing=True)
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.space_line = 1.1
    curve.extrude = 0.05
    obj = link(bpy.data.objects.new("epitaph", curve))
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.location = (0, 0, z)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.data.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    # Font outlines overlap and are not watertight; a voxel remesh makes the
    # cutter a clean closed solid so the boolean carves every letter.
    remesh = obj.modifiers.new("watertight", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = TEXT_VOXEL_SIZE
    apply_all(obj)
    obj.data.materials.append(groove)
    return obj


def cross_cutter(z, groove):
    parts = []
    for size, offset in (((0.035, 0.1, 0.2), (0, 0, 0)), ((0.13, 0.1, 0.035), (0, 0, 0.04))):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(offset[0], offset[1], z + offset[2]))
        cube = bpy.context.object
        cube.scale = size
        cube.data.materials.append(groove)
        parts.append(cube)
    return parts


def push_into_face(cutter, front_y, depth):
    """Slide a cutter along Y so it reaches `depth` behind the stone's front face."""
    bpy.context.view_layer.update()
    ys = [(cutter.matrix_world @ Vector(c)).y for c in cutter.bound_box]
    cutter.location.y += (front_y + depth) - max(ys)
    bpy.context.view_layer.update()


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return lo, hi


def place_on_ground(obj, x, y, sink=0.0):
    bpy.context.view_layer.update()
    lo, hi = world_bounds(obj)
    centre = (lo + hi) / 2
    obj.location += Vector((x - centre.x, y - centre.y, -sink - lo.z))


try:
    stone = stone_material()
    groove = groove_material()

    # Headstone: gothic arch, scanned stone relief, then the carving.
    head = gothic_headstone()
    head.data.materials.append(stone)
    bevelled(head, 0.018)
    uncarved_faces = len(head.data.polygons)
    bpy.context.view_layer.update()
    front_y = world_bounds(head)[0].y
    base_z = head.location.z
    cutters = [text_cutter("SIR\nFABROOS", TEXT_SIZE, base_z + TEXT_Z, groove)]
    cutters += cross_cutter(base_z + HEAD_HEIGHT - 0.3, groove)
    for cutter in cutters:
        push_into_face(cutter, front_y, CARVE_DEPTH)
    bpy.context.view_layer.update()
    carve(head, cutters)
    # The exact boolean occasionally collapses the mesh; never export that.
    if len(head.data.polygons) <= uncarved_faces:
        raise RuntimeError(f"carving failed: {len(head.data.polygons)} faces (uncarved {uncarved_faces})")
    # Scanned relief comes from the lichen_rock normal map; UVs after carving.
    uv_unwrap(head, 0.9)
    # Settled over the years: a slight backward lean.
    head.rotation_euler.x = math.radians(HEAD_LEAN_DEG)

    # Plinth.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, PLINTH[2] / 2 - 0.04))
    plinth = bpy.context.object
    plinth.scale = PLINTH
    bpy.ops.object.transform_apply(scale=True)
    plinth.data.materials.append(stone)
    bevelled(plinth, 0.025)
    uv_unwrap(plinth, 0.9)

    # Scanned mossy stones outlining the grave in front.
    rocks = [o for o in work.objects if o.name.startswith("rock_moss_set_02")]
    # Two rows of small stones outlining the grave in front of the plinth.
    border = [(-0.5, -0.55, 15), (0.5, -0.6, -30), (-0.55, -1.25, 60), (0.55, -1.3, 10), (-0.1, -1.75, 85)]
    for (x, y, yaw), rock in zip(border, rocks):
        rock.scale *= BORDER_STONE_SCALE
        rock.rotation_euler.z = math.radians(yaw)
        place_on_ground(rock, x, y, sink=0.04)
    for rock in rocks[len(border):]:
        bpy.data.objects.remove(rock, do_unlink=True)

    # His kite shield leaning on the plinth, front-left. Join its parts first
    # so body, trim and bolts scale and rotate as one piece.
    shield_parts = [o for o in work.objects if o.name.startswith("kite_shield")]
    for o in bpy.data.objects:
        o.select_set(False)
    for part in shield_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = shield_parts[0]
    bpy.ops.object.join()
    shield = shield_parts[0]
    shield.scale *= SHIELD_SCALE
    shield.rotation_euler = (math.radians(-22), math.radians(-6), math.radians(-18))
    place_on_ground(shield, -0.66, -0.34, sink=-0.01)

    # Candlesticks on the plinth.
    candle = next(o for o in work.objects if o.name.startswith("wooden_candlestick"))
    # The scan is ~110k vertices for a 20 cm prop; a fraction reads the same.
    simplify = candle.modifiers.new("simplify", "DECIMATE")
    simplify.ratio = CANDLE_DECIMATE_RATIO
    apply_all(candle)
    candle.scale *= 1.4
    place_on_ground(candle, 0.42, -0.12, sink=-(PLINTH[2] - 0.04))
    twin = link(candle.copy())
    place_on_ground(twin, -0.42, -0.12, sink=-(PLINTH[2] - 0.04))

    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in work.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, use_active_scene=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=85)
    print("tomb exported", OUT, "faces", len(head.data.polygons))
finally:
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = return_to
    bpy.data.scenes.remove(work)
