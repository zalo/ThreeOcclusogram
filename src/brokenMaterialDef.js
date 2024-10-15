this.implicitMaterial = new THREE.ShaderMaterial( {
    side: THREE.FrontSide,
    defines: {
        USE_SHADER_RAYCAST: this.contactParams.useRaycastForInsidedness ? 1 : 0
    },
    uniforms: {
        matrix: { value: new THREE.Matrix4().copy( this.upperTeeth.matrix ).invert() },
        bvh: { value: new MeshBVHUniformStruct() },
        distanceOffset: { value: this.contactParams.distanceOffset },
        specularStrength: { value: 0.5 },
        specularShininess: { value: 0.5 },
        opacity: { value: 1.0 },
        diffuse: { value: new THREE.Color( 0xffffff ) },
        emissive: { value: new THREE.Color( 0x000000 )},
        specular: { value: new THREE.Color( 0xffffff ) },
    },
    vertexShader: `

        #define PHONG

        varying vec3 vViewPosition;

        #include <common>
        //#include <envmap_pars_vertex>
        #include <color_pars_vertex>
        #include <normal_pars_vertex>
        //#include <shadowmap_pars_vertex>

        attribute float penetrationDepth;
        varying vec3 vWorldPosition;
        void main() {
            #include <color_vertex>

            #include <beginnormal_vertex>
            #include <defaultnormal_vertex>
            #include <normal_vertex>

            #include <begin_vertex>
            #include <project_vertex>
            #include <clipping_planes_vertex>

            vViewPosition = - mvPosition.xyz;

            //#include <worldpos_vertex>
            //#include <envmap_vertex>
            //#include <shadowmap_vertex>
            #include <fog_vertex>

            vWorldPosition = (modelMatrix * vec4( position, 1.0 )).xyz;
        }`,
    fragmentShader: `
        #define PHONG
        //precision highp isampler2D;
        //precision highp usampler2D;

        uniform vec3 diffuse;
        uniform vec3 emissive;
        uniform vec3 specular;
        uniform float shininess;
        uniform float opacity;
        uniform float specularStrength;

        #include <common>
        #include <packing>
        #include <dithering_pars_fragment>
        #include <color_pars_fragment>
        
        //#include <envmap_common_pars_fragment>
        //#include <envmap_pars_fragment>
        #include <bsdfs>
        #include <lights_pars_begin>
        #include <normal_pars_fragment>
        #include <lights_phong_pars_fragment>
        //#include <shadowmap_pars_fragment>
        #include <clipping_planes_pars_fragment>

        // fifth-order polynomial approximation of Turbo based on: https://observablehq.com/@mbostock/turbo
        vec4 turbo(float x) {
            float r = 0.1357 + x * ( 4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375))));
            float g = 0.0914 + x * ( 2.1856 + x * ( 4.8052 - x * ( 14.0195 - x * (  4.2109 + x *  2.7747))));
            float b = 0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * ( 88.5066 - x * 26.8183))));
            return vec4(r, g, b, 1.0);
        }

        ${ BVHShaderGLSL.common_functions }
        ${ BVHShaderGLSL.bvh_struct_definitions }
        ${ BVHShaderGLSL.bvh_ray_functions }
        ${ BVHShaderGLSL.bvh_distance_functions }

        varying vec3 vWorldPosition;

        uniform BVH bvh;
        uniform float distanceOffset;
        uniform mat4 matrix;

        void main() {
            // compute the point in space to check
            vec3 point = ( matrix * vec4( vWorldPosition, 1.0 ) ).xyz;

            // retrieve the distance and other values
            uvec4 faceIndices;
            vec3 faceNormal, barycoord, outPoint;
            float side, rayDist;
            float dist = bvhClosestPointToPoint( bvh, point.xyz, faceIndices, faceNormal, barycoord, side, outPoint );

            // This currently causes issues on some devices when rendering to 3d textures and texture arrays
            #if USE_SHADER_RAYCAST
            side = 1.0;
            bvhIntersectFirstHit( bvh, point.xyz, vec3( 0.0, 0.0, 1.0 ), faceIndices, faceNormal, barycoord, side, rayDist );
            #endif

            // if the triangle side is the back then it must be on the inside and the value negative
            vec4 diffuseColor = turbo( clamp(((-side * dist) + distanceOffset) * 0.5, 0.0, 1.0) ); 

            #include <clipping_planes_fragment>
        
            ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
            vec3 totalEmissiveRadiance = emissive;

            #include <color_fragment>
            #include <normal_fragment_begin>
            #include <normal_fragment_maps>
        
            // accumulation
            #include <lights_phong_fragment>
            #include <lights_fragment_begin>
            //#include <lights_fragment_maps>
            #include <lights_fragment_end>
        
            vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
        
            //#include <envmap_fragment>
            #include <opaque_fragment>
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
            #include <premultiplied_alpha_fragment>
            #include <dithering_fragment>

            //gl_FragColor = diffuseColor;
        }`});
this.implicitMaterial.uniforms.bvh.value.updateFrom( this.bvh2 );
this.implicitMaterial.needsUpdate = true;

/*this.implicitMaterial = new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide });
this.implicitMaterial.defines.USE_SHADER_RAYCAST = this.contactParams.useRaycastForInsidedness ? 1 : 0;
this.implicitMaterial.uniforms = {};
this.implicitMaterial.uniforms.matrix = { value: new THREE.Matrix4().copy( this.upperTeeth.matrix ).invert() };
this.implicitMaterial.uniforms.bvh = { value: new MeshBVHUniformStruct() };
this.implicitMaterial.uniforms.distanceOffset = { value: this.contactParams.distanceOffset };
this.implicitMaterial.uniforms.bvh.value.updateFrom( this.bvh2 );
this.implicitMaterial.needsUpdate = true;

this.implicitMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader =
    shader.vertexShader.slice(0, 17) +
    `varying vec3 vWorldPosition; \n` +
    shader.vertexShader.slice(17, - 1) +
    `vWorldPosition = (modelMatrix * vec4( position, 1.0 )).xyz; }`;

  // Fragment Shader: Set Diffuse Color to Represent Distance to Point
  let indexToInsert = shader.fragmentShader.indexOf("#include <alphamap_fragment>");
  shader.fragmentShader =
    shader.fragmentShader.slice(0, 17) +
        `
        precision highp isampler2D;
        precision highp usampler2D;
        varying vec3 vPosition;
        uniform vec3 embeddedSamplePoint;
        // fifth-order polynomial approximation of Turbo based on: https://observablehq.com/@mbostock/turbo
        vec3 turboPoly(float x) {
            float r = 0.1357 + x * ( 4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375))));
            float g = 0.0914 + x * ( 2.1856 + x * ( 4.8052 - x * ( 14.0195 - x * (  4.2109 + x *  2.7747))));
            float b = 0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * ( 88.5066 - x * 26.8183))));
            return vec3(r, g, b);
        }
        vec3 turbo (in float t) {
            const vec3 a = vec3(0.13830712, 0.49827032, 0.47884378);
            const vec3 b = vec3(0.8581176, -0.50469547, 0.40234273);
            const vec3 c = vec3(0.67796707, 0.84353134, 1.111561);
            const vec3 d = vec3(0.50833158, 1.11536091, 0.76036415);
            vec3 tt = clamp(vec3(t), vec3(0.375, 0.0, 0.0), vec3(1.0, 1.0, 0.7));
            return a + b * cos(6.28318 * (c * tt + d));
        }
        ${ BVHShaderGLSL.common_functions }
        ${ BVHShaderGLSL.bvh_struct_definitions }
        ${ BVHShaderGLSL.bvh_ray_functions }
        ${ BVHShaderGLSL.bvh_distance_functions }

        varying vec3 vWorldPosition;

        uniform BVH bvh;
        uniform float distanceOffset;
        uniform mat4 matrix;
        ` +
        shader.fragmentShader.substring(17, indexToInsert) +
        `
            // compute the point in space to check
            vec3 point = ( matrix * vec4( vWorldPosition, 1.0 ) ).xyz;

            // retrieve the distance and other values
            uvec4 faceIndices;
            vec3 faceNormal, barycoord, outPoint;
            float side, rayDist;
            float dist = bvhClosestPointToPoint( bvh, point.xyz, faceIndices, faceNormal, barycoord, side, outPoint );

            // This currently causes issues on some devices when rendering to 3d textures and texture arrays
            #if USE_SHADER_RAYCAST
            side = 1.0;
            bvhIntersectFirstHit( bvh, point.xyz, vec3( 0.0, 0.0, 1.0 ), faceIndices, faceNormal, barycoord, side, rayDist );
            #endif

            // if the triangle side is the back then it must be on the inside and the value negative
            diffuseColor.rgb = turbo( clamp(((-side * dist) + distanceOffset) * 0.5, 0.0, 1.0) ); 
        ` + shader.fragmentShader.substring(indexToInsert);

    //// Set the sample point into the model
    //shader.uniforms.embeddedSamplePoint = this.implicitMaterial.uniforms.embeddedSamplePoint;
};*/