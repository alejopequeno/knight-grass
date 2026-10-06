import bpy, math, os, random

OUT_DIR = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass/public/models/props"
os.makedirs(OUT_DIR, exist_ok=True)
random.seed(7)

# Work in a throwaway scene so the user's open scene is never touched.
original_scene = bpy.context.window.scene
work_scene = bpy.data.scenes.new("walk-grass-props")
bpy.context.window.scene = work_scene


def clear():
    for obj in list(work_scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


try:


    def material(name, rgb, roughness=0.8, metallic=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        return m

    def export(name):
        # Select exactly the work scene's objects; the exporter otherwise picks up
        # selections from other scenes (e.g. the user's default cube).
        for obj in bpy.data.objects:
            obj.select_set(False)
        for obj in work_scene.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(OUT_DIR, f"{name}.glb"),
            use_selection=True,
            use_active_scene=True,
            export_apply=True,
        )

    STEEL = (0.32, 0.33, 0.35)
    WOOD = (0.22, 0.14, 0.08)
    STONE = (0.30, 0.30, 0.28)
    CLOTH = (0.35, 0.06, 0.05)

    # Broken shield: kite-ish plate tilted into the ground, with a boss.
    clear()
    bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=0.45, depth=0.05, location=(0, 0, 0.32), rotation=(math.radians(75), 0, math.radians(12)))
    shield = bpy.context.object
    shield.scale = (1, 1.35, 1)
    shield.data.materials.append(material("shield", WOOD))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.09, location=(0, -0.05, 0.36))
    bpy.context.object.data.materials.append(material("boss", STEEL, 0.4, 0.8))
    export("shield")

    # Circle of broken standing stones.
    clear()
    stone_mat = material("stone", STONE, 0.95)
    for i in range(7):
        angle = i / 7 * math.tau
        height = random.uniform(0.6, 1.6)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(angle) * 2.6, math.sin(angle) * 2.6, height / 2))
        stone = bpy.context.object
        stone.scale = (0.35, 0.25, height)
        stone.rotation_euler = (random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12), angle + random.uniform(-0.3, 0.3))
        bevel = stone.modifiers.new("bevel", "BEVEL")
        bevel.width = 0.06
        stone.data.materials.append(stone_mat)
    export("stones")

    # Sword driven into a rock.
    clear()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.7, location=(0, 0, 0.25))
    rock = bpy.context.object
    rock.scale = (1.2, 1, 0.6)
    rock.data.materials.append(material("rock", STONE, 0.95))
    steel = material("blade", STEEL, 0.3, 0.9)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.15))
    blade = bpy.context.object
    blade.scale = (0.07, 0.015, 1.1)
    blade.data.materials.append(steel)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.72))
    bpy.context.object.scale = (0.38, 0.05, 0.05)
    bpy.context.object.data.materials.append(steel)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.32, location=(0, 0, 1.92))
    bpy.context.object.data.materials.append(material("grip", CLOTH, 0.9))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(0, 0, 2.1))
    bpy.context.object.data.materials.append(steel)
    export("sword")
finally:
    clear()
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(work_scene)
print("props exported to", OUT_DIR)
