import { Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector2, type WebGLRenderer } from 'three';
import { smooth } from './cameraFlight';
import { portalPreview, WORLD_PORTALS } from './worldPortals';

export function createWorldPortal(id: string, compact: boolean, renderer: WebGLRenderer, schedule: () => void) {
  const spec=WORLD_PORTALS[id];
  if(!spec)return null;
  let disposed=false,loaded=false;
  const texture=new TextureLoader().load(portalPreview(spec.next,compact),()=>{
    if(disposed){texture.dispose();return;}
    loaded=true;schedule();
  });
  texture.colorSpace=SRGBColorSpace;
  const material=new ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{preview:{value:texture},viewport:{value:new Vector2()},imageAspect:{value:compact?390/844:1440/1000},opacity:{value:0}},
    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D preview; uniform vec2 viewport; uniform float imageAspect; uniform float opacity;
      void main(){
        vec2 uv=gl_FragCoord.xy/viewport;
        float aspect=viewport.x/viewport.y;
        if(aspect>imageAspect)uv.y=(uv.y-.5)*imageAspect/aspect+.5;
        else uv.x=(uv.x-.5)*aspect/imageAspect+.5;
        gl_FragColor=vec4(texture2D(preview,uv).rgb,opacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new Mesh(new PlaneGeometry(spec.size[0],spec.size[1]),material);
  mesh.position.fromArray(spec.position);mesh.rotation.y=spec.rotation;mesh.visible=false;
  return {mesh,
    update(progress:number){
      mesh.visible=loaded&&progress>.7;
      material.uniforms.opacity.value=smooth(Math.max(0,Math.min(1,(progress-.7)/.17)));
      renderer.getDrawingBufferSize(material.uniforms.viewport.value);
    },
    dispose(){disposed=true;mesh.geometry.dispose();material.dispose();texture.dispose();},
  };
}
