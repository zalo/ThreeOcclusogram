import * as THREE from '../node_modules/three/build/three.module.js';
import { GUI } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import { mergeVertices } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { STLLoader } from '../node_modules/three/examples/jsm/loaders/STLLoader.js';
import World from './World.js';

import { TransformControls } from '../node_modules/three/examples/jsm/controls/TransformControls.js';

// Import the BVH Acceleration Structure and monkey-patch the Mesh class with it
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast, MeshBVH, BVHShaderGLSL, MeshBVHUniformStruct } from '../node_modules/three-mesh-bvh/build/index.module.js';
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

/** The fundamental set up and animation structures for 3D Visualization */
export default class Main {

    constructor() {
        // Intercept Main Window Errors
        window.realConsoleError = console.error;
        window.addEventListener('error', (event) => {
            let path = event.filename.split("/");
            this.display((path[path.length - 1] + ":" + event.lineno + " - " + event.message));
        });
        console.error = this.fakeError.bind(this);
        this.deferredConstructor();
    }
    async deferredConstructor() {
        // Configure Settings
        this.contactParams = {
            useRaycastForInsidedness: false, // This fixes some artifacts, but is way more expensive and breaks viewing from Safari
            distanceOffset: 1.0,
            teethOpacity: 0.1,
        };
        this.gui = new GUI();
        this.gui.add(this.contactParams, 'useRaycastForInsidedness').name( 'Use Expensive Raycast' ).disable();
        this.gui.add(this.contactParams, 'distanceOffset', 0.0, 2.0).name( 'Distance Offset' );
        this.gui.add(this.contactParams, 'teethOpacity', 0.0, 1.0).name( 'Teeth Opacity' );

        // Construct the render world
        this.world = new World(this);

        this.stlLoader = new STLLoader();
        this.isDeployed = document.pathname !== '/';
        this.stlLoader.setPath( this.isDeployed ? './assets/' : '../assets/' ).load( 'LR.stl', ( lowerGeo ) => {
            this.stlLoader.load( 'UR.stl', ( upperGeo ) => {
                let mergedUpperGeometry = mergeVertices(upperGeo, 1e-6);
                let mergedLowerGeometry = mergeVertices(lowerGeo, 1e-6);
                mergedUpperGeometry.computeVertexNormals();
                mergedLowerGeometry.computeVertexNormals();

                /** @type {MeshBVH} */
                this.bvh2 = mergedUpperGeometry.computeBoundsTree();
                this.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: this.contactParams.teethOpacity, side: THREE.FrontSide, }); //
                this.upperTeeth = new THREE.Mesh( mergedUpperGeometry , this.material  );
                this.upperTeeth.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI*0.5);
                this.world.scene.add( this.upperTeeth );
                this.upperTeeth.position.set(0, 20.0, 0.0);

                this.control = new TransformControls( this.world.camera, this.world.renderer.domElement );
                this.control.addEventListener( 'dragging-changed', ( event ) => { this.world.controls.enabled = ! event.value; } );
                this.control.attach( this.upperTeeth );
                this.world.scene.add( this.control );
                
                this.implicitMaterial = new THREE.ShaderMaterial( {
                    side: THREE.FrontSide,
                    defines: {
                        USE_SHADER_RAYCAST: this.contactParams.useRaycastForInsidedness ? 1 : 0
                    },
                    uniforms: {
                        matrix: { value: new THREE.Matrix4().copy( this.upperTeeth.matrix ).invert() },
                        bvh: { value: new MeshBVHUniformStruct() },
                        distanceOffset: { value: this.contactParams.distanceOffset },
                    },
                    vertexShader: `
                        varying vec3 vViewPosition;

                        #include <common>
                        #include <color_pars_vertex>
                        #include <normal_pars_vertex>
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
                            #include <fog_vertex>

                            vWorldPosition = (modelMatrix * vec4( position, 1.0 )).xyz;
                        }`,
                    fragmentShader: `
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
                        varying vec3 vNormal;

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

                            vec4 simpleShading = vec4(0.5, 0.5, 0.5, 1.0);
                            simpleShading.rgb += 0.3 * clamp(dot(vec3(1.0, 1.0, 1.0), vNormal), 0.0, 1.0);

                            // if the triangle side is the back then it must be on the inside and the value negative
                            float signedDistance = ((-side * dist) + distanceOffset);
                            gl_FragColor = signedDistance > 0.0 ? turbo( clamp(signedDistance * 0.5, 0.0, 1.0) ) : simpleShading; 
                        }`});
                this.implicitMaterial.uniforms.bvh.value.updateFrom( this.bvh2 );
                this.implicitMaterial.needsUpdate = true;

                this.lowerTeeth = new THREE.Mesh( mergedLowerGeometry , this.implicitMaterial );
                this.lowerTeeth.castShadow = false;
                this.lowerTeeth.receiveShadow = false;
                this.world.scene.add( this.lowerTeeth );
                this.lowerTeeth.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI*0.5);
                this.lowerTeeth.position.set(0, 20.0, 0.0);

            });
        });
    }

    update(timeMS) {
        this.timeMS = timeMS;
        if(this.implicitMaterial){
            this.implicitMaterial.uniforms.matrix.value.copy( this.upperTeeth.matrix ).invert();
            this.implicitMaterial.uniforms.distanceOffset.value = this.contactParams.distanceOffset;
            this.implicitMaterial.defines.useRaycastForInsidedness = this.contactParams.useRaycastForInsidedness ? 1 : 0;
            this.implicitMaterial.needsUpdate = true;
            this.material.opacity = this.contactParams.teethOpacity;
            this.material.needsUpdate = true;
        }
        this.world.controls.update();
        this.world.renderer.render(this.world.scene, this.world.camera);
        this.world.stats.update();
    }

    // Log Errors as <div>s over the main viewport
    fakeError(...args) {
        if (args.length > 0 && args[0]) { this.display(JSON.stringify(args[0])); }
        window.realConsoleError.apply(console, arguments);
    }

    display(text) {
        let errorNode = window.document.createElement("div");
        errorNode.innerHTML = text.fontcolor("red");
        window.document.getElementById("info").appendChild(errorNode);
    }
}

var main = new Main();
