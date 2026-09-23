"""Preserve authored PBR constants when exporting unbaked procedural materials.

glTF cannot carry Blender Noise/ColorRamp/Bump graphs. Its exporter otherwise
replaces a linked Base Color with white. Baked room emission textures are kept.
"""
import bpy,json
from pathlib import Path


def apply():
    root=Path(__file__).resolve().parent/'materials'
    manifest=json.loads((root/'sources.json').read_text())
    # The licensed plant sources use Blender shader groups / translucency.
    # Export an explicit PBR + alpha-test graph rather than losing their leaves.
    sources=[('fern_02','fern_02','fern_02','alpha'),('periwinkle_plant','periwinkle_plant','periwinkle_plant','opacity'),
             ('tree_small_02_trunk','tree_small_02','tree_small_02',None),
             ('tree_small_02_branches','tree_small_02','tree_small_02_branch',None),
             ('tree_small_02_leaves','tree_small_02','tree_small_02_leaves','alpha')]
    for name,slug,prefix,alpha in sources:
        material=bpy.data.materials.get(name)
        if not material:continue
        tree=material.node_tree;tree.nodes.clear()
        shader=tree.nodes.new('ShaderNodeBsdfPrincipled');out=tree.nodes.new('ShaderNodeOutputMaterial')
        tree.links.new(shader.outputs[0],out.inputs[0])
        channels=[('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal')]+([(alpha,'Alpha')] if alpha else [])
        for token,socket in channels:
            file=next(f for f in manifest['files'] if f['asset']==slug and Path(f['path']).name.startswith(prefix+'_'+token+'_'))
            im=bpy.data.images.load(str(root/file['path']),check_existing=True)
            im.colorspace_settings.name='sRGB' if socket=='Base Color' else 'Non-Color'
            tex=tree.nodes.new('ShaderNodeTexImage');tex.image=im
            if socket=='Normal':
                n=tree.nodes.new('ShaderNodeNormalMap');tree.links.new(tex.outputs['Color'],n.inputs['Color']);tree.links.new(n.outputs['Normal'],shader.inputs[socket])
            elif socket=='Alpha':
                clip=tree.nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.5
                tree.links.new(tex.outputs['Color'],clip.inputs[0]);tree.links.new(clip.outputs[0],shader.inputs[socket])
            else:tree.links.new(tex.outputs['Color'],shader.inputs[socket])
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
                    if name == 'Base Color' and material.name.startswith('M01') and link.from_node.type == 'HUE_SAT':
                        # This scanned finish is baked on architecture. Loose
                        # landscape rocks still need an exportable colour map;
                        # never let the unsupported colour node turn them white.
                        texture = link.from_node.inputs['Color'].links[0].from_socket
                        tree.links.remove(link)
                        tree.links.new(texture, socket)
                        continue
                    if name == 'Normal' and material.get('scanned_asset') and link.from_node.type == 'BUMP':
                        # glTF carries the photographed tangent normal directly;
                        # source-only height bump stays in the Cycles master.
                        bump = link.from_node
                        normal = bump.inputs['Normal'].links[0].from_socket
                        tree.links.remove(link)
                        tree.links.new(normal, socket)
                        continue
                    if link.from_node.type in {'VALTORGB', 'BUMP'}:
                        tree.links.remove(link)


if __name__ == '__main__':
    apply()
