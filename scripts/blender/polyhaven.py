"""Shared helpers for the compose-* scripts that build props out of Poly Haven
assets. Not a Blender addon and not importable over the MCP bridge — each
compose script pulls it in with `exec(open(...).read())` near the top.

Everything here deals with the gap between what the MCP addon imports and what
a glTF for the web actually needs: wired normal maps, no unread maps, sane map
sizes, and polygon counts a browser can carry.
"""
import bpy

# Longest side any exported map keeps. These props are seen from metres away at
# best, so full Poly Haven resolution is megabytes of detail nobody resolves.
MAX_MAP_SIZE = 512
# Maps the addon loads but never wires into the shader.
UNUSED_MAP_SUFFIXES = ("_Displacement", "_nor_dx", "_AO", "_arm", "_rough_ao")


def select_only(obj):
    for other in bpy.data.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def downscale(image):
    """Shrink a map in place, keeping its aspect."""
    width, height = image.size
    longest = max(width, height)
    if longest <= MAX_MAP_SIZE:
        return
    factor = MAX_MAP_SIZE / longest
    image.scale(max(int(width * factor), 1), max(int(height * factor), 1))


def prepare_material(mat, closed_solid):
    """Wire the normal map the addon leaves unconnected, drop the maps nothing
    reads, and shrink what is left.

    `closed_solid` decides backface culling. Photogrammetry scans are open
    shells with thousands of boundary edges, so culling their backfaces turns
    every opening into a hole you can see the sky through. Only procedural
    solids are watertight enough to cull.
    """
    tree = mat.node_tree
    principled = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        return mat
    image_nodes = [n for n in tree.nodes if n.type == "TEX_IMAGE" and n.image]

    if not principled.inputs["Normal"].is_linked:
        # OpenGL-convention normals are what glTF and three.js expect.
        source = next((n for n in image_nodes if "_nor_gl" in n.image.name), None)
        if source is not None:
            source.image.colorspace_settings.name = "Non-Color"
            normal_map = tree.nodes.new("ShaderNodeNormalMap")
            tree.links.new(source.outputs["Color"], normal_map.inputs["Color"])
            tree.links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    for node in image_nodes:
        if any(suffix in node.image.name for suffix in UNUSED_MAP_SUFFIXES):
            bpy.data.images.remove(node.image, do_unlink=True)
            tree.nodes.remove(node)

    for node in tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            downscale(node.image)

    mat.use_backface_culling = closed_solid
    return mat


def require_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(
            f"object '{name}' is missing — import it first with the MCP addon: "
            f'download_polyhaven_asset(asset_id="{name}", asset_type="models", resolution="1k")'
        )
    return obj


def require_material(name, closed_solid):
    mat = bpy.data.materials.get(name)
    if mat is None:
        raise RuntimeError(
            f"material '{name}' is missing — download it first with the MCP addon: "
            f'download_polyhaven_asset(asset_id="{name}", asset_type="textures", resolution="1k")'
        )
    return prepare_material(mat, closed_solid=closed_solid)


def clean_mesh(obj):
    """Collapsing a scan hard leaves degenerate slivers and stray verts that
    read as shards of glass stuck to the surface. Sweep them up."""
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0015)
    bpy.ops.mesh.dissolve_degenerate()
    bpy.ops.mesh.delete_loose()
    # No normals_make_consistent here: it needs a closed volume to decide what
    # "outside" means, and on an open scan it inverts whole patches instead.
    bpy.ops.object.mode_set(mode="OBJECT")


def weld(obj, threshold=1e-5):
    """Merge the duplicate vertices a scan ships with.

    Poly Haven scans split vertices along UV and shading seams — boulder_01
    arrives with 67k vertices that weld down to 33k. Collapse decimation cannot
    merge across those splits, so an unwelded scan hits a floor far above its
    budget and tears into slivers on the way. UVs survive: they live per loop,
    not per vertex.
    """
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=threshold)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def decimate(obj, target_triangles):
    """Thin a scan to a web budget. Only ever call this once per mesh —
    decimating already-decimated geometry shatters it."""
    weld(obj)
    obj.data.calc_loop_triangles()
    current = len(obj.data.loop_triangles)
    if current <= target_triangles:
        return obj
    select_only(obj)
    modifier = obj.modifiers.new("thin", "DECIMATE")
    modifier.ratio = target_triangles / current
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="thin")
    clean_mesh(obj)
    return obj


def export_glb(scene, path):
    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in scene.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        use_active_scene=True,
        export_apply=True,
        export_image_format="JPEG",
        export_jpeg_quality=80,
    )
