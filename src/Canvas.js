import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import initJolt from 'https://www.unpkg.com/jolt-physics/dist/jolt-physics.wasm-compat.js';

import GUI from 'lil-gui';

initJolt().then(function (Jolt) {

    const gui = new GUI();

    const texLoader = new THREE.TextureLoader();
	let compliance = 0.00001;

	// Graphics variables
	var container;
	var camera, controls, scene, renderer;

	// Timers
	var clock = new THREE.Clock();
	var time = 0;

	// Physics variables
	var jolt;
	var physicsSystem;
	var bodyInterface;

	// List of objects spawned
	var dynamicObjects = [];
	// var rigidBodies = [];
	// var rigidIndexes = [];

	// The update function
	var onExampleUpdate;

	const wrapVec3 = (v) => new THREE.Vector3(v.GetX(), v.GetY(), v.GetZ());
	const wrapQuat = (q) => new THREE.Quaternion(q.GetX(), q.GetY(), q.GetZ(), q.GetW());

	// Object layers
	const LAYER_NON_MOVING = 0;
	const LAYER_MOVING = 1;
	const NUM_OBJECT_LAYERS = 2;

    let width = 1;
    let height = 1.5;
    let segmentsMultiplier = 50;
    let widthSegments = Math.ceil( width * segmentsMultiplier);
    let heightSegments = 10;

	let planeGeo = null;
	let mesh = null;

	const tex = texLoader.load('/mask3.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

		const xTile = Math.ceil((0.789 * widthSegments) / (widthSegments/2)) 
		const yTile = Math.ceil((0.789 * heightSegments) / (heightSegments/2)) 
        
        texture.repeat.set(xTile, yTile);
		texture.needsUpdate = true;
    })
    let material = new THREE.MeshStandardMaterial({map: tex, side: THREE.DoubleSide});

	const params = {
		width: width,
		height: height,
		wireframe: false,
		// animate: () => animateAnchors()
	};

	gui.add(params, 'width', 1, 5, 0.01).onChange(() => {
		width = params.width;
		widthSegments = Math.ceil(width * segmentsMultiplier);
		updatePlaneSize()
	});

	gui.add(params, 'height', 1, 5, 0.01).onChange(() => {
		height = params.height;
		updatePlaneSize()
	});

	gui.add(params, 'wireframe').onChange(() => {
		material.wireframe = params.wireframe;
		material.needsUpdate = true;
	});

	// gui.add(params, 'animate');

	function onWindowResize() {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize(window.innerWidth, window.innerHeight);
	}

	function initGraphics() {
		renderer = new THREE.WebGLRenderer();
		renderer.setClearColor(0xbfd1e5);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);

		camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 2000);
		camera.position.set(0, 2, 3);
		camera.lookAt(new THREE.Vector3(0, 0, 0));

		scene = new THREE.Scene();

        scene.add(new THREE.AmbientLight(0xffffff, 2));

		controls = new OrbitControls(camera, container);

		container.appendChild(renderer.domElement);

		window.addEventListener('resize', onWindowResize, false);
	}

	let setupCollisionFiltering = function (settings) {
		// Layer that objects can be in, determines which other objects it can collide with
		// Typically you at least want to have 1 layer for moving bodies and 1 layer for static bodies, but you can have more
		// layers if you want. E.g. you could have a layer for high detail collision (which is not used by the physics simulation
		// but only if you do collision testing).
		let objectFilter = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
		objectFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
		objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

		// Each broadphase layer results in a separate bounding volume tree in the broad phase. You at least want to have
		// a layer for non-moving and moving objects to avoid having to update a tree full of static objects every frame.
		// You can have a 1-on-1 mapping between object layers and broadphase layers (like in this case) but if you have
		// many object layers you'll be creating many broad phase trees, which is not efficient.
		const BP_LAYER_NON_MOVING = new Jolt.BroadPhaseLayer(0);
		const BP_LAYER_MOVING = new Jolt.BroadPhaseLayer(1);
		const NUM_BROAD_PHASE_LAYERS = 2;
		let bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BROAD_PHASE_LAYERS);
		bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, BP_LAYER_NON_MOVING);
		bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, BP_LAYER_MOVING);

		settings.mObjectLayerPairFilter = objectFilter;
		settings.mBroadPhaseLayerInterface = bpInterface;
		settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(settings.mBroadPhaseLayerInterface, NUM_BROAD_PHASE_LAYERS, settings.mObjectLayerPairFilter, NUM_OBJECT_LAYERS);
	};

	function initPhysics() {

		// Initialize Jolt
		let settings = new Jolt.JoltSettings();
		settings.mMaxWorkerThreads = 3; // Limit the number of worker threads to 3 (for a total of 4 threads working on the simulation). Note that this value will always be clamped against the number of CPUs in the system - 1.
		setupCollisionFiltering(settings);
		jolt = new Jolt.JoltInterface(settings);
		Jolt.destroy(settings);
		physicsSystem = jolt.GetPhysicsSystem();
		physicsSystem.SetGravity(new Jolt.Vec3(0, -9.8, 0));
		bodyInterface = physicsSystem.GetBodyInterface();
	}

	function updatePhysics(deltaTime) {

		// When running below 55 Hz, do 2 steps instead of 1
		var numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1;

		// Step the physics world
		jolt.Step(deltaTime, numSteps);
	}

	function initExample(Jolt, updateFunction) {
		window.Jolt = Jolt;

		container = document.getElementById('container');

        onExampleUpdate = updateFunction;

        initGraphics();
        initPhysics();
        renderExample();
	}

	function renderExample() {

		requestAnimationFrame(renderExample);

		// Don't go below 30 Hz to prevent spiral of death
		var deltaTime = clock.getDelta();
		deltaTime = Math.min(deltaTime, 1.0 / 30.0);

		if (onExampleUpdate != null)
			onExampleUpdate(time, deltaTime);

		// Update object transforms
		for (let i = 0, il = dynamicObjects.length; i < il; i++) {
			let objThree = dynamicObjects[i];
			let body = objThree.userData.body;
			objThree.position.copy(wrapVec3(body.GetPosition()));
			objThree.quaternion.copy(wrapQuat(body.GetRotation()));

			if (body.GetBodyType() == Jolt.EBodyType_SoftBody) {
				if (objThree.userData.updateVertex) {
					objThree.userData.updateVertex();
				} else {
					objThree.geometry = createMeshForShape(body.GetShape());
				}
			}
		}

		time += deltaTime;

		updatePhysics(deltaTime);

		controls.update(deltaTime);

		renderer.render(scene, camera);
	}

	function addToThreeScene(body, material, mesh = null) {
		let threeObject = !mesh ? getThreeObjectForBody(body, material) : mesh;
		threeObject.userData.body = body;
		scene.add(threeObject);
		dynamicObjects.push(threeObject);
	}

	function addToScene(body, material, mesh = null) {
		bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);
		addToThreeScene(body, material, mesh);
	}

	function createFloor(size = 5) {
		var shape = new Jolt.BoxShape(new Jolt.Vec3(size, 0.2, size), 0.05, null);
		var creationSettings = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(0, -0.5, 0), new Jolt.Quat(0, 0, 0, 1), Jolt.EMotionType_Static, LAYER_NON_MOVING);
		let body = bodyInterface.CreateBody(creationSettings);
		Jolt.destroy(creationSettings); 
		addToScene(body, new THREE.MeshStandardMaterial({ color: 0xc7c7c7 }));
		return body;
	}

	function createMeshForShape(shape) {
		// Get triangle data
		let scale = new Jolt.Vec3(1, 1, 1);
		let triContext = new Jolt.ShapeGetTriangles(shape, Jolt.AABox.prototype.sBiggest(), shape.GetCenterOfMass(), Jolt.Quat.prototype.sIdentity(), scale);
		Jolt.destroy(scale);

		// Get a view on the triangle data (does not make a copy)
		let vertices = new Float32Array(Jolt.HEAPF32.buffer, triContext.GetVerticesData(), triContext.GetVerticesSize() / Float32Array.BYTES_PER_ELEMENT);

		// Now move the triangle data to a buffer and clone it so that we can free the memory from the C++ heap (which could be limited in size)
		let buffer = new THREE.BufferAttribute(vertices, 3).clone();
		Jolt.destroy(triContext);

		// Create a three mesh
		let geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', buffer);
		geometry.computeVertexNormals();

		return geometry;
	}

	function getThreeObjectForBody(body, material) {
		let threeObject;
		let shape = body.GetShape();
		if (body.GetBodyType() == Jolt.EBodyType_SoftBody)
			threeObject = getSoftBodyMesh(body, material);
		else
			threeObject = new THREE.Mesh(createMeshForShape(shape), material);

		threeObject.position.copy(wrapVec3(body.GetPosition()));
		threeObject.quaternion.copy(wrapQuat(body.GetRotation()));

		return threeObject;
	}

    function getFrequency(width){
        let foldCalibrationfactor = 3.5;
        let frequency = width * foldCalibrationfactor;
        let roundedFrequency = parseInt(frequency);
        if(frequency > roundedFrequency) {
            roundedFrequency++;
        }
        return roundedFrequency;
    }

	function vertexIndex(x, y) {
		return x + y * widthSegments;
	} 

	function updateGeometry(planeGeo){
		const posAttr = planeGeo.getAttribute('position');
		const frequency = getFrequency(width);
		const totalWaveLength = frequency * 2 * Math.PI;
		const waveStepSize = totalWaveLength / (widthSegments + 1);
		const waveAmplitude = 0.05;
		
		let sineWaveInput = 0;
		const numVerticesX = widthSegments + 1;
		const numVerticesY = heightSegments + 1;
		for (let ix = 0; ix < numVerticesX; ix++) {
			const z = waveAmplitude * Math.sin(sineWaveInput - Math.PI/2);
			for (let iy = 0; iy < numVerticesY; iy++) {
				const index = ix + iy * numVerticesX;
				posAttr.setZ(index, z);
			}
			sineWaveInput = waveStepSize * (ix + 1);
		}
	
		posAttr.needsUpdate = true;
	}

	function createAnchor(position, count) {
		const radius = 0.001;
		const bodies = [];

		const aX = position.x - width/2;
		const aY = position.y + height/2;
		const aZ = position.z;

		// const shape = new Jolt.BoxShape(new Jolt.Vec3(0.0, 0.0, 0.0), 0.01, null); // size, convex radius
		const shape = new Jolt.SphereShape(radius);

		for(var i = 0; i < count; i++) {

			// 2. Create body settings (static or dynamic)
			const sphereSettings = new Jolt.BodyCreationSettings(
				shape,
				new Jolt.RVec3(aX + (i/widthSegments), aY, aZ), // position
				Jolt.Quat.prototype.sIdentity(), // rotation
				Jolt.EMotionType_Static, // use Dynamic if you want it to move
				LAYER_MOVING
			);

			// 3. Create and add to physics world
			const sphereBody = bodyInterface.CreateBody(sphereSettings);
			bodyInterface.AddBody(sphereBody.GetID(), Jolt.EActivation_Activate);

			bodies.push(sphereBody);
		}

		return bodies;
	}

	function createPhysicsForCloth(planeGeo) {
		const posAttr = planeGeo.getAttribute('position');
		const vertices = [];
		for (let i = 0; i < posAttr.count; i++) {
			const x = posAttr.getX(i);
			const y = posAttr.getY(i);
			const z = posAttr.getZ(i);

			const v = new Jolt.SoftBodySharedSettingsVertex();
			v.mPosition = new Jolt.Float3(x, y, z);
			vertices.push(v);
		}

		const indexAttr = planeGeo.index;
		const faces = [];
		for (let i = 0; i < indexAttr.count; i += 3) {
			const v0 = indexAttr.getX(i);
			const v1 = indexAttr.getX(i + 1);
			const v2 = indexAttr.getX(i + 2);

			const face = new Jolt.SoftBodySharedSettingsFace(v0, v1, v2, 0); // material index = 0
			faces.push(face);
		}

		let sharedSettings = new Jolt.SoftBodySharedSettings;
		vertices.forEach(v => sharedSettings.mVertices.push_back(v));
		faces.forEach(f => sharedSettings.AddFace(f));

		// Create edges
		const attributes = new Jolt.SoftBodySharedSettingsVertexAttributes();
		attributes.mCompliance = compliance;
		attributes.mShearCompliance = compliance;
		attributes.mBendCompliance = 0.001;  
		sharedSettings.CreateConstraints(attributes, 1);

		for(var i = 0; i < widthSegments + 1; i++) {
			sharedSettings.mVertices.at(vertexIndex(i, 0)).mInvMass = 0.0;
		}

		// Optimize shared settings
		sharedSettings.Optimize();

		// new Jolt.Quat( 0.7071068, 0, 0, 0.7071068)
		// new Jolt.Quat( -0.3826834, 0, 0, 0.9238795 )

		// Create soft body
		let bodyCreationSettings = new Jolt.SoftBodyCreationSettings(
			sharedSettings, 
			new Jolt.RVec3(0, 0.4, 0), 
			Jolt.Quat.prototype.sIdentity()
			// new Jolt.Quat( 0.7071068, 0, 0, 0.7071068)
		);

		bodyCreationSettings.mObjectLayer = LAYER_MOVING;
		bodyCreationSettings.mUpdatePosition = false;
		let body = bodyInterface.CreateSoftBody(bodyCreationSettings);

		/*rigidBodies.splice(0, rigidBodies.length)
		rigidIndexes.splice(0, rigidIndexes.length)

		rigidBodies = createAnchor(new THREE.Vector3(0, 0.4, 0), widthSegments+1);

		for(var i = 0; i < widthSegments + 1; i++) {
			sharedSettings.mVertices.at(vertexIndex(i, 0)).mInvMass = 0.0;
			const idx = vertexIndex(i, 0);
			rigidIndexes.push(idx)
			sharedSettings.mVertices.at(idx).mPosition = rigidBodies[i].GetPosition();
		} */

		return body;
	}

	function updateVertexSettings(body, mesh) {
		// update function!
		const motionProperties = Jolt.castObject(body.GetMotionProperties(), Jolt.SoftBodyMotionProperties);
		const vertexSettings = motionProperties.GetVertices();
		const positionOffset = Jolt.SoftBodyVertexTraits.prototype.mPositionOffset;
	
		// Get a view on the triangle data
		const softVertex = [];
		for (let i = 0; i < vertexSettings.size(); i++) {
			softVertex.push(new Float32Array(Jolt.HEAP32.buffer, Jolt.getPointer(vertexSettings.at(i)) + positionOffset, 3));
		}
	
		// Create a three mesh
		let verts = mesh.geometry.getAttribute('position');
	
		mesh.userData.updateVertex = () => {

			/* rigidIndexes.forEach((idx, i) => {
				const vertex = motionProperties.GetVertex(idx);
				const rigidBodyPosition = rigidBodies[i].GetPosition();

				vertex.mPosition = rigidBodyPosition;
			}) */

			for (let i = 0; i < softVertex.length; i++) {
				verts.setX(i, softVertex[i][0]);
				verts.setY(i, softVertex[i][1]);
				verts.setZ(i, softVertex[i][2]);
			}
			mesh.geometry.computeVertexNormals();
			mesh.geometry.getAttribute('position').needsUpdate = true;
			mesh.geometry.getAttribute('normal').needsUpdate = true;
		}
		mesh.userData.updateVertex();
	}

	function createSoftCloth() {
		planeGeo = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);

		updateGeometry(planeGeo);
		let body = createPhysicsForCloth(planeGeo);
	
		mesh = new THREE.Mesh(planeGeo, material)
		mesh.position.copy(wrapVec3(body.GetPosition()));
		mesh.quaternion.copy(wrapQuat(body.GetRotation()));

		updateVertexSettings(body, mesh)
		addToScene(body, material, mesh );
	}

	function updatePlaneSize() {
		mesh.geometry.dispose();

		widthSegments = Math.ceil( width * segmentsMultiplier);

		planeGeo = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
        mesh.geometry = planeGeo;
		updateGeometry(planeGeo);

		const xTile = Math.ceil((0.789 * widthSegments) / (widthSegments/2)) 
		const yTile = Math.ceil((0.789 * heightSegments) / (heightSegments/2)) 
        
        mesh.material.map.repeat.set(xTile, yTile);
		mesh.material.map.needsUpdate = true;

		let body = createPhysicsForCloth(planeGeo);
		mesh.userData.body = body;

		bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);
		updateVertexSettings(body, mesh)
	}

	function disposeSoftbody() {

	}

	// Initialize this example
	initExample(Jolt, () => { });

	// Create a basic floor
	createFloor();

	// create soft cloth
    createSoftCloth();
});