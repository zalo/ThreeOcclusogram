# [ThreeOcclusogram](https://zalo.github.io/ThreeOcclusogram/)

<p align="left">
  <a href="https://github.com/zalo/ThreeOcclusogram/deployments/activity_log?environment=github-pages">
      <img src="https://img.shields.io/github/deployments/zalo/ThreeOcclusogram/github-pages?label=Github%20Pages%20Deployment" title="Github Pages Deployment"></a>
  <a href="https://github.com/zalo/ThreeOcclusogram/commits/main">
      <img src="https://img.shields.io/github/last-commit/zalo/ThreeOcclusogram" title="Last Commit Date"></a>
  <!--<a href="https://github.com/zalo/ThreeOcclusogram/blob/master/LICENSE">
      <img src="https://img.shields.io/github/license/zalo/ThreeOcclusogram" title="License: Apache V2"></a>-->  <!-- No idea what license this should be! -->
</p>

A simple proof of concept for computing and visualizing Dental Occlusograms on the GPU

![ThreeOcclusogramDemo](./assets/OcclusogramDemo.gif)

This demo uses `three-mesh-bvh` to treat the meshes like SDFs, but prebaking the meshes to 3D textures would probably be much faster.

Inspired by this Github Issue: https://github.com/zalo/ThreeHydroelasticContacts/issues/1

 # Building

This demo can either be run without building (in Chrome/Edge/Opera since raw three.js examples need [Import Maps](https://caniuse.com/import-maps)), or built with:
```
npm install
npm run build
```
After building, make sure to edit the index .html to point from `"./src/main.js"` to `"./build/main.js"`.

 # Dependencies
 - [three.js](https://github.com/mrdoob/three.js/) (3D Rendering Engine)
 - [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (Accelerated Raycasting and Closest Point Queries)
 - [esbuild](https://github.com/evanw/esbuild/) (Bundler)