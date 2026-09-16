"""Preserve authored PBR constants when exporting unbaked procedural materials.

glTF cannot carry Blender Noise/ColorRamp/Bump graphs. Its exporter otherwise
replaces a linked Base Color with white. Baked room emission textures are kept.
"""
import bpy


def apply():
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        for shader in tree.nodes:
            if shader.type != 'BSDF_PRINCIPLED':
                continue
            for name in ['Base Color', 'Normal']:
                socket = shader.inputs[name]
                for link in list(socket.links):
                    if link.from_node.type in {'VALTORGB', 'BUMP'}:
                        tree.links.remove(link)


if __name__ == '__main__':
    apply()
