"""Dead trees and broken ruins for the field.

The trees are kitbashed from Poly Haven's `dead_tree_trunk_02` scan — a 4 m
photoreal bark branch. One copy stands as the trunk and smaller copies become
limbs and twigs, the way production tree assets are built out of scanned
pieces. Every copy is scaled *uniformly*, so the scan's own UVs and bark never
stretch; a procedural tube with projected UVs reads as a polished cone instead.

Poly Haven has no standing dead tree, which is why the trunk is a lying branch
stood upright rather than a model of a whole tree.

Download these through the MCP addon before running this script:
    download_polyhaven_asset(asset_id="dead_tree_trunk_02", asset_type="models", resolution="1k")
    download_polyhaven_asset(asset_id="castle_wall_slates", asset_type="textures", resolution="1k")

Exports horizon.glb (one named object per variant) and saves the work scene as
a .blend copy for later tweaking."""
import math
import os
import random

import bpy
from mathutils import Quaternion, Vector

PROJECT = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass"
exec(open(os.path.join(PROJECT, "scripts/blender/polyhaven.py")).read())  # noqa: S102
OUT = os.path.join(PROJECT, "public/models/props/horizon.glb")
BLEND_OUT = os.path.join(PROJECT, "blender-work/horizon.blend")

SCAN_SOURCE = "dead_tree_trunk_02"
STONE_MATERIAL = "castle_wall_slates"
STONE_TILE = 1.6

TREE_COUNT = 5
TREE_HEIGHT_RANGE = (8.0, 12.5)

# The scan is 83k triangles. Thin each piece once, before kitbashing, and never
# again: decimating already-decimated geometry shatters it into loose shards
# that stick out of the trunk like broken glass.
PIECE_TRIANGLES = 1100

# Fraction of the tree's height taken by the standing trunk.
TRUNK_SHARE = 0.46
LIMB_LEVELS = 2
CHILDREN_PER_LIMB = {0: (4, 5), 1: (2, 3)}
CHILD_LENGTH = {0: (0.58, 0.78), 1: (0.55, 0.75)}
# Where along the parent a child attaches, as a fraction of its length. High
# values keep a clear trunk under the crown.
CHILD_SPAN = {0: (0.72, 0.98), 1: (0.45, 0.9)}
# Swing off the parent. Past ~50° a limb leaving a vertical trunk is already
# near horizontal, and it reads as a pole bolted on rather than a branch.
BRANCH_ANGLE = (math.radians(36), math.radians(60))
# Limbs claw upward; only the last twigs sag.
LIFT_BY_LEVEL = {0: 0.15, 1: 0.05}
# How far a piece may roll away from "curve upward". Enough that the crown is
# not symmetrical, not enough to point a limb at the ground.
ROLL_JITTER = math.radians(38)
# Fraction of a piece's length sampled at each end to measure its curve.
BEND_SAMPLE_SPAN = 0.22
WORLD_UP = Vector((0, 0, 1))
# Girth multiplier relative to the piece's natural proportions.
TRUNK_GIRTH = 1.15
LIMB_GIRTH = 0.85

def build_template(scene):
    """A unit-length copy of the scan, running from its own origin along +X.

    Returned normalised so that placing a piece is a single uniform scale:
    length 1 is the scan's natural length, and girth follows automatically.
    """
    source = require_object(SCAN_SOURCE)
    template = source.copy()
    template.data = source.data.copy()
    scene.collection.objects.link(template)
    select_only(template)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    decimate(template, PIECE_TRIANGLES)

    for mat in template.data.materials:
        if mat:
            prepare_material(mat, closed_solid=False)

    corners = [Vector(c) for c in template.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    span = high - low
    # The scan lies along its longest axis; everything below assumes that is X.
    length = max(span.x, 1e-6)
    centre_y = (low.y + high.y) / 2
    centre_z = (low.z + high.z) / 2
    for vertex in template.data.vertices:
        vertex.co = Vector(
            (
                (vertex.co.x - low.x) / length,
                (vertex.co.y - centre_y) / length,
                (vertex.co.z - centre_z) / length,
            )
        )
    template.hide_set(True)
    return template, intrinsic_bend(template)


def intrinsic_bend(template):
    """Which way the scan curves, in its own yz plane.

    The piece is a real branch, not a straight rod: its tip sits well off the
    axis through its butt. Placing it with a random roll therefore points that
    curve anywhere — including straight down, which is what makes a limb read
    as broken rather than growing.
    """
    butt = [v.co for v in template.data.vertices if v.co.x < BEND_SAMPLE_SPAN]
    tip = [v.co for v in template.data.vertices if v.co.x > 1 - BEND_SAMPLE_SPAN]
    if not butt or not tip:
        return Vector((0, 1, 0))
    offset = Vector(
        (
            0,
            sum(v.y for v in tip) / len(tip) - sum(v.y for v in butt) / len(butt),
            sum(v.z for v in tip) / len(tip) - sum(v.z for v in butt) / len(butt),
        )
    )
    return offset.normalized() if offset.length > 1e-5 else Vector((0, 1, 0))


def lift_roll(direction, aim, bend):
    """Roll angle about `direction` that turns the piece's own curve upward.

    Everything alive reaches for the light; a dead tree keeps the shape it
    grew into. Aligning the scan's bend with world up is what stops limbs from
    hanging like snapped poles.
    """
    axis = direction.normalized()
    world_bend = aim @ bend
    flat_bend = world_bend - axis * world_bend.dot(axis)
    flat_up = WORLD_UP - axis * WORLD_UP.dot(axis)
    if flat_bend.length < 1e-5 or flat_up.length < 1e-5:
        return 0.0
    flat_bend.normalize()
    flat_up.normalize()
    return math.atan2(flat_bend.cross(flat_up).dot(axis), flat_bend.dot(flat_up))


def place_piece(scene, template, bend, origin, direction, length, girth, rng):
    """One kitbashed limb: the template aimed along `direction`, rolled so its
    own curve sweeps upward, then jittered so no two pieces look stamped."""
    piece = template.copy()
    piece.data = template.data.copy()
    scene.collection.objects.link(piece)
    piece.hide_set(False)

    aim = Vector((1, 0, 0)).rotation_difference(direction.normalized())
    upward = lift_roll(direction, aim, bend)
    roll = Quaternion(direction.normalized(), upward + rng.uniform(-ROLL_JITTER, ROLL_JITTER))
    piece.rotation_mode = "QUATERNION"
    piece.rotation_quaternion = roll @ aim
    # Uniform in the two cross-section axes so bark never smears; girth only
    # trades thickness for length, which the eye reads as a younger limb.
    piece.scale = (length, length * girth, length * girth)
    piece.location = origin
    return piece


def branch_direction(parent_direction, lift, rng):
    reference = Vector((0, 0, 1)) if abs(parent_direction.z) < 0.9 else Vector((1, 0, 0))
    axis = parent_direction.cross(reference).normalized()
    axis = (Quaternion(parent_direction.normalized(), rng.uniform(0, math.tau)) @ axis).normalized()
    swung = Quaternion(axis, rng.uniform(*BRANCH_ANGLE)) @ parent_direction.normalized()
    return (swung + Vector((0, 0, lift))).normalized()


def grow_limbs(scene, template, bend, pieces, origin, direction, length, girth, level, rng):
    if level >= LIMB_LEVELS:
        return
    low, high = CHILDREN_PER_LIMB[level]
    for _ in range(rng.randint(low, high)):
        attach = rng.uniform(*CHILD_SPAN[level])
        child_origin = origin + direction.normalized() * (length * attach)
        child_direction = branch_direction(direction, LIFT_BY_LEVEL[level], rng)
        child_length = length * rng.uniform(*CHILD_LENGTH[level])
        pieces.append(
            place_piece(scene, template, bend, child_origin, child_direction, child_length, girth, rng)
        )
        grow_limbs(
            scene, template, bend, pieces, child_origin, child_direction, child_length, girth, level + 1, rng
        )


def join(parts, name):
    """Merge parts into one object so the web side instances a single mesh."""
    for obj in bpy.data.objects:
        obj.select_set(False)
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return merged


def dead_tree(scene, template, bend, name, height, rng):
    lean = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 1)).normalized()
    trunk_length = height * TRUNK_SHARE
    # Sink the butt so the scan's broken end never shows above the grass.
    origin = Vector((0, 0, -0.35))
    pieces = [place_piece(scene, template, bend, origin, lean, trunk_length, TRUNK_GIRTH, rng)]
    grow_limbs(scene, template, bend, pieces, origin, lean, trunk_length, LIMB_GIRTH, 0, rng)
    tree = join(pieces, name)
    bpy.ops.object.shade_smooth()
    return tree


COURSE_HEIGHT = 0.52
BLOCK_JITTER = 0.05
CHIP_WIDTH = 0.035


def cube_project(obj, tile):
    """Box projection at a fixed world scale — right for blocky masonry."""
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=tile, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def stone_block(size, location, rotation_z, rng):
    """One dressed block, bevelled so its edges catch light like chipped stone."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    block = bpy.context.object
    block.scale = size
    block.rotation_euler = (
        rng.uniform(-BLOCK_JITTER, BLOCK_JITTER),
        rng.uniform(-BLOCK_JITTER, BLOCK_JITTER),
        rotation_z,
    )
    bevel = block.modifiers.new("chip", "BEVEL")
    bevel.width = CHIP_WIDTH
    bevel.segments = 1
    # Bake the bevel now: join() keeps only the active object's modifiers.
    select_only(block)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


def rubble(centre, count, spread, rng):
    """Fallen stones piled where the structure came down."""
    return [
        stone_block(
            (size, size * rng.uniform(0.6, 1.0), size * rng.uniform(0.4, 0.8)),
            (centre[0] + rng.uniform(-spread, spread), centre[1] + rng.uniform(-spread, spread), size * 0.3),
            rng.uniform(0, math.tau),
            rng,
        )
        for size in (rng.uniform(0.25, 0.6) for _ in range(count))
    ]


def finish_ruin(parts, name, mat):
    for part in parts:
        part.data.materials.append(mat)
    ruin = join(parts, name)
    cube_project(ruin, STONE_TILE)
    return ruin


def broken_arch(name, mat, rng):
    """Masonry piers carrying the springing of an arch that has lost its crown."""
    parts = []
    for side, courses in ((-1, 11), (1, 7)):
        for course in range(courses):
            width = 1.25 - course * 0.025
            drift = side * course * 0.02
            parts.append(
                stone_block(
                    (width, 1.0, COURSE_HEIGHT),
                    (side * 2.2 + drift, 0, COURSE_HEIGHT * (course + 0.5)),
                    rng.uniform(-0.03, 0.03),
                    rng,
                )
            )
    springing = 11 * COURSE_HEIGHT
    for index in range(4):
        angle = math.radians(14 + index * 15)
        reach = 0.75 + index * 0.62
        voussoir = stone_block(
            (0.8, 0.95, 0.6), (-2.2 + reach, 0, springing + math.sin(angle) * reach * 0.55), 0, rng
        )
        voussoir.rotation_euler = (0, -angle, 0)
        parts.append(voussoir)
    parts += rubble((0.6, 0), 7, 1.9, rng)
    return finish_ruin(parts, name, mat)


def broken_wall(name, mat, rng):
    """A curtain wall in courses, collapsed through the middle so the skyline
    steps down instead of ending in one flat silhouette."""
    parts = []
    bays = ((-4.6, 7), (-3.0, 6), (-1.5, 2), (0.0, 0), (1.5, 3), (3.0, 6), (4.6, 5))
    for offset, courses in bays:
        for course in range(courses):
            # The top course of a ruin is always a broken half-block.
            partial = 0.55 if course == courses - 1 else 1.0
            parts.append(
                stone_block(
                    (1.45 * partial, 0.95, COURSE_HEIGHT),
                    (offset + (1 - partial) * 0.3, 0, COURSE_HEIGHT * (course + 0.5)),
                    rng.uniform(-0.02, 0.02),
                    rng,
                )
            )
    parts += rubble((0, 0), 9, 2.4, rng)
    return finish_ruin(parts, name, mat)


original_scene = bpy.context.window.scene
work = bpy.data.scenes.new("walk-grass-horizon")
bpy.context.window.scene = work

try:
    stone = require_material(STONE_MATERIAL, closed_solid=True)
    template, bend = build_template(work)

    built = []
    for index in range(TREE_COUNT):
        # One stream per tree: re-running a variant never reshuffles the rest.
        rng = random.Random(4100 + index)
        built.append(dead_tree(work, template, bend, f"tree_{index}", rng.uniform(*TREE_HEIGHT_RANGE), rng))
    built.append(broken_arch("arch_0", stone, random.Random(77)))
    built.append(broken_wall("wall_0", stone, random.Random(78)))

    bpy.data.objects.remove(template, do_unlink=True)

    # Lay the variants out in a row so the .blend is readable when opened.
    for index, obj in enumerate(built):
        obj.location = (index * 16, 0, 0)
    bpy.context.view_layer.update()

    for obj in built:
        obj.data.calc_loop_triangles()
    counts = ", ".join(f"{obj.name}={len(obj.data.loop_triangles)}" for obj in built)

    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    # copy=True: Blender writes the file but keeps this session pointed at
    # whatever the user already had open.
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT, copy=True)

    export_glb(work, OUT)
    print(f"horizon exported {OUT}\ntriangles: {counts}\nblend: {BLEND_OUT}")
finally:
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(work)
