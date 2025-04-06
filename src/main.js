

import { Sketch } from "./Sketch";
import initJolt from 'https://www.unpkg.com/jolt-physics/dist/jolt-physics.wasm-compat.js';

initJolt().then(jolt => {
    new Sketch(document.querySelector("canvas.webgl"), jolt);
})
