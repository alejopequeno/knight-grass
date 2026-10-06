"""Remove orphaned datablocks (zero users) left behind by the walk-grass
build scripts: Poly Haven images/materials and generated meshes, curves and
fonts survive scene deletion otherwise. Anything still in use — the user's
own data — is never touched."""
import bpy

COLLECTIONS = ("images", "materials", "meshes", "textures", "curves", "fonts", "node_groups")

# Removing a material can orphan its images, so sweep until nothing changes.
removed = 0
while True:
    swept = 0
    for name in COLLECTIONS:
        blocks = getattr(bpy.data, name)
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)
                swept += 1
    removed += swept
    if swept == 0:
        break
print("removed", removed)
