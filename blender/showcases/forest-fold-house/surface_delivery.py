"""Tiled source detail on UV0, camera-independent irradiance on UV1.

The visitor multiplies linear albedo by normalized irradiance and keeps only
runtime specular. Never bake metre-scale scanned grain into room-scale atlases.
"""
import bpy, math
import numpy as np


def normalize_irradiance(image):
    pixels=np.empty(len(image.pixels),dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba=pixels.reshape(-1,4)
    assert image.is_float, 'Irradiance must be baked into a float image'
    assert np.isfinite(rgba[:,:3]).all(), 'Non-finite irradiance bake'
    maximum=float(rgba[:,:3].max())
    scale=2**max(0,math.ceil(math.log2(max(1,maximum))))
    rgba[:,:3]/=scale
    # Float bake pixels are scene-linear. Blender converts these to sRGB when
    # saving PNG; labelling the buffer sRGB would instead double-decode it.
    # Assign colour space before restoring pixels: changing it invalidates the
    # generated image buffer in Blender 5.2, even when setting the same value.
    image.colorspace_settings.name='Linear Rec.709'
    image.pixels.foreach_set(pixels)
    return scale


def create_material(source, group, irradiance, normal_image, roughness_image, scale, directory, albedo_image=None):
    material=bpy.data.materials.new(group+'__'+source.name.split('.')[0])
    material.use_nodes=True;tree=material.node_tree;tree.nodes.clear()
    shader=tree.nodes.new('ShaderNodeBsdfPrincipled');out=tree.nodes.new('ShaderNodeOutputMaterial')
    tree.links.new(shader.outputs[0],out.inputs[0])
    original=next(n for n in source.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value=original.inputs['Base Color'].default_value[:]
    shader.inputs['Metallic'].default_value=original.inputs['Metallic'].default_value
    shader.inputs['Roughness'].default_value=original.inputs['Roughness'].default_value
    shader.inputs['Emission Strength'].default_value=scale
    surface=tree.nodes.new('ShaderNodeUVMap');surface.uv_map='SurfaceUV'
    lightmap=tree.nodes.new('ShaderNodeUVMap');lightmap.uv_map='Lightmap'

    def texture(image,socket,uv,strength=1):
        node=tree.nodes.new('ShaderNodeTexImage');node.image=image
        tree.links.new(uv.outputs['UV'],node.inputs['Vector'])
        if socket=='Normal':
            normal=tree.nodes.new('ShaderNodeNormalMap');normal.uv_map=uv.uv_map
            normal.inputs['Strength'].default_value=strength
            tree.links.new(node.outputs['Color'],normal.inputs['Color'])
            tree.links.new(normal.outputs['Normal'],shader.inputs[socket])
        else:tree.links.new(node.outputs['Color'],shader.inputs[socket])

    texture(irradiance,'Emission Color',lightmap)
    if source.get('scanned_asset'):
        images={}
        for node in source.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image and node.image!=irradiance and node.image not in [normal_image,roughness_image]:
                name=node.image.name.lower()
                if '_diff_' in name:images['Base Color']=node.image
                elif '_nor_gl_' in name:images['Normal']=node.image
                elif '_rough_' in name:images['Roughness']=node.image
        assert len(images)==3, 'Missing tiled source channels: '+source.name
        # Retain the authored desaturated stone / smoked-oak finish. These are
        # derivatives of licensed PBR scans, not edits to displayed artwork.
        saturation,value=(.30,.88) if source.get('scanned_asset')=='rock_08' else (.65,.82) if source.get('scanned_asset')=='oak_veneer_01' else (1,1)
        if saturation!=1 or value!=1:
            key='surface-'+source['scanned_asset']
            adjusted=bpy.data.images.get(key)
            if adjusted is None:
                source_image=images['Base Color']
                pixels=np.empty(len(source_image.pixels),dtype=np.float32);source_image.pixels.foreach_get(pixels)
                rgba=pixels.reshape(-1,4);rgb=rgba[:,:3]
                # Byte image pixels are encoded sRGB; shader colour operations
                # see scene-linear RGB. Float image buffers are already linear.
                if not source_image.is_float:
                    rgb[:]=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
                # Blender Hue/Saturation operates in HSV: V scaling commutes
                # with the saturation interpolation towards the channel max.
                rgb[:]=(rgb*saturation+rgb.max(axis=1,keepdims=True)*(1-saturation))*value
                adjusted=bpy.data.images.new(key,width=source_image.size[0],height=source_image.size[1],alpha=False,float_buffer=True)
                adjusted.colorspace_settings.name='Linear Rec.709';adjusted.pixels.foreach_set(pixels)
                adjusted.filepath_raw=str(directory/(key+'.png'));adjusted.file_format='PNG';adjusted.save()
            images['Base Color']=adjusted
        for socket,image in images.items():texture(image,socket,surface,source.get('delivery_normal_strength',1))
        material['forest_surface_tile_m']=source['surface_tile_m']
    else:
        assert albedo_image, 'Missing procedural albedo: '+source.name
        texture(albedo_image,'Base Color',lightmap)
        texture(normal_image,'Normal',lightmap)
        texture(roughness_image,'Roughness',lightmap)
    material['forest_irradiance']=True
    material['forest_atlas_group']=group
    return material
