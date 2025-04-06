import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

// import GUI from 'lil-gui';

class Sketch {

    constructor(container, jolt) {
        this.container = container;
        window.Jolt = jolt;
        console.log("jolt", Jolt)

        // threejs vars
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        // this.controls = null;

        this.sizes = {};
        this.frameId = null;
        this.clock = null;
        // this.gui = new GUI();

        // plane variables
        this.segmentsMultiplier = 25;
        this.width = 1;
        this.height = 1.5;
        this.widthSegments = Math.ceil(this.width * this.segmentsMultiplier);
        this.heightSegments = 10;

        // physics variables
        this.jolt;
        this.physicsSystem;
        this.bodyInterface;
        // create cloth
        this.towerHeight = 11;
        this.gridSize = 40;
        this.gridSpacing = 0.5;
        this.offset = -0.5 * this.gridSpacing * (this.gridSize - 1);
        this.compliance = 0.00001;
        this.colors = [0xff0000, 0xd9b1a3, 0x4d4139, 0xccad33, 0xf2ff40, 0x00ff00, 0x165943, 0x567371, 0x80d5ff, 0x69778c, 0xbeb6f2, 0x7159b3, 0x73004d, 0xd90074, 0xff8091, 0xbf3030, 0x592400, 0xa66c29, 0xb3aa86, 0x296600, 0x00e600, 0x66ccaa, 0x00eeff, 0x3d9df2, 0x000e33, 0x3d00e6, 0xb300a7, 0xff80d5, 0x330d17, 0x59332d, 0xff8c40, 0x33210d, 0x403c00, 0x89d96c, 0x0d3312, 0x0d3330, 0x005c73, 0x0066ff, 0x334166, 0x1b0066, 0x4d3949, 0xbf8faf, 0x59000c]

        // List of objects spawned
        this.dynamicObjects = [];

        // Object layers
        this.layers = {
            LAYER_NON_MOVING: 0,
            LAYER_MOVING: 1,
            NUM_OBJECT_LAYERS: 2
        }

        this.initialize();
    }

    initialize = () => {
        this.scene = new THREE.Scene();

        this.sizes.width = window.innerWidth;
        this.sizes.height = window.innerHeight;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            canvas: this.container
        });
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0xC5D3E8, 1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.clock = new THREE.Clock();

        this.raycaster = new THREE.Raycaster();

        this.ballMaterial = new THREE.MeshBasicMaterial({color: "black"})

        // camera & resize
        this.setupCamera();
        this.setupResize();

        // wramup calls
        this.resize();
        this.render();

        // world setup
        this.addLights();
        
        // Physics setup
        this.initPhysics();

        this.addContents();

        // start animation loop
        this.start();
    }

    initPhysics() {
        // Initialize jolt
        var settings = new Jolt.JoltSettings();
        settings.mMaxWorkerThreads = 3; // Limit the number of worker threads to 3 (for a total of 4 threads working on the simulation). Note that this value will always be clamped against the number of CPUs in the system - 1.
        this.setupCollisionFiltering(settings);
        this.jolt = new Jolt.JoltInterface(settings);
        Jolt.destroy(settings);
        this.physicsSystem = this.jolt.GetPhysicsSystem();
        this.bodyInterface = this.physicsSystem.GetBodyInterface();
    }

    setupCollisionFiltering = (settings) => {

        const { LAYER_MOVING, LAYER_NON_MOVING, NUM_OBJECT_LAYERS} = this.layers;
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

    addLights = () => {
        this.scene.add(new THREE.AmbientLight(0xffffff, 2));
    }

    setupCamera = () => {
        this.camera = new THREE.PerspectiveCamera(
            60,
            (this.sizes.width / this.sizes.height),
            0.1,
            1000
        );
        this.camera.position.set(0, 15, 30);
	    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    }

    setupResize = () => {
        window.addEventListener('resize', this.resize);
    }

    resize = () => {
        this.sizes.width = window.innerWidth;
        this.sizes.height = window.innerHeight;

        this.camera.aspect = this.sizes.width / this.sizes.height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.sizes.width, this.sizes.height)

    }

    start = () => {
        if (!this.frameId) {
            this.frameId = window.requestAnimationFrame(this.update);
        }
    }

    stop = () => {
        cancelAnimationFrame(this.frameId);
    }

    // phtsics functions
    wrapVec3 = (v) => new THREE.Vector3(v.GetX(), v.GetY(), v.GetZ());
    wrapQuat = (q) => new THREE.Quaternion(q.GetX(), q.GetY(), q.GetZ(), q.GetW());

    addToThreeScene(body, color) {
        let threeObject = this.getThreeObjectForBody(body, color);
        threeObject.userData.body = body;
        this.scene.add(threeObject);
        this.dynamicObjects.push(threeObject);
    }
    
    addToScene(body, color) {
        this.bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);
        this.addToThreeScene(body, color);
    }
    
    createFloor(size = 50) {
        var shape = new Jolt.BoxShape(new Jolt.Vec3(size, 0.5, size), 0.05, null);
        var creationSettings = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(0, -0.5, 0), new Jolt.Quat(0, 0, 0, 1), Jolt.EMotionType_Static, this.layers.LAYER_NON_MOVING);
        let body = this.bodyInterface.CreateBody(creationSettings);
        Jolt.destroy(creationSettings);
        this.addToScene(body, 0xc7c7c7);
        return body;
    }
    
    createMeshForShape(shape) {
        console.log("IN HERE TOO")
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
    
    getSoftBodyMesh(body, material) {
        const motionProperties = Jolt.castObject(body.GetMotionProperties(), Jolt.SoftBodyMotionProperties);
        const vertexSettings = motionProperties.GetVertices();
        const settings = motionProperties.GetSettings();
        const positionOffset = Jolt.SoftBodyVertexTraits.prototype.mPositionOffset;
        const faceData = settings.mFaces;
    
        // Get a view on the triangle data
        const softVertex = [];
        for (let i = 0; i < vertexSettings.size(); i++) {
            softVertex.push(new Float32Array(Jolt.HEAP32.buffer, Jolt.getPointer(vertexSettings.at(i))+positionOffset, 3));
        }
    
        // Define faces (indices of vertices for the triangles)
        const faces = new Uint32Array(faceData.size()*3);
        for (let i = 0; i < faceData.size(); i++) {
            faces.set(new Uint32Array(Jolt.HEAP32.buffer, Jolt.getPointer(faceData.at(i)), 3), i * 3);
        }
        
        // Create a three mesh
        let geometry = new THREE.BufferGeometry();
        let vertices = new Float32Array(vertexSettings.size() * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(faces, 1));
        material.side = THREE.DoubleSide;
        const threeObject = new THREE.Mesh(geometry, material);
        threeObject.userData.updateVertex = () => {
            for (let i = 0; i < softVertex.length; i++) {
                vertices.set(softVertex[i], i * 3);
            }
            geometry.computeVertexNormals();
            geometry.getAttribute('position').needsUpdate = true;
            geometry.getAttribute('normal').needsUpdate = true;
        }
        threeObject.userData.updateVertex();
        return threeObject;
    }
    
    getThreeObjectForBody(body, color) {
        let material = new THREE.MeshPhongMaterial({ color: color });
    
        let threeObject;
    
        let shape = body.GetShape();
        switch (shape.GetSubType()) {
            case Jolt.EShapeSubType_Box:
                let boxShape = Jolt.castObject(shape, Jolt.BoxShape);
                let extent = this.wrapVec3(boxShape.GetHalfExtent()).multiplyScalar(2);
                threeObject = new THREE.Mesh(new THREE.BoxGeometry(extent.x, extent.y, extent.z, 1, 1, 1), material);
                break;
            case Jolt.EShapeSubType_Sphere:
                let sphereShape = Jolt.castObject(shape, Jolt.SphereShape);
                threeObject = new THREE.Mesh(new THREE.SphereGeometry(sphereShape.GetRadius(), 32, 32), material);
                break;
            default:
                if (body.GetBodyType() == Jolt.EBodyType_SoftBody)
                    threeObject = this.getSoftBodyMesh(body, material);
                else
                    threeObject = new THREE.Mesh(this.createMeshForShape(shape), material);
                break;
        }
    
        threeObject.position.copy(this.wrapVec3(body.GetPosition()));
        threeObject.quaternion.copy(this.wrapQuat(body.GetRotation()));
    
        return threeObject;
    }

    // Function to get the vertex index of a point on the cloth
    vertexIndex = (inX, inY) =>{
        return inX + inY * this.gridSize;
    };

    createCloth = () => {
        // Create shared settings
        let sharedSettings = new Jolt.SoftBodySharedSettings;

        // Create vertices
        let v = new Jolt.SoftBodySharedSettingsVertex;
        for (let y = 0; y < this.gridSize; ++y)
            for (let x = 0; x < this.gridSize; ++x) {
                v.mPosition = new Jolt.Float3(this.offset + x * this.gridSpacing, 0.0, this.offset + y * this.gridSpacing);
                sharedSettings.mVertices.push_back(v);
            }

        // Fixate corners
        for(var i = 0; i <= this.gridSize; i += 2) {
            sharedSettings.mVertices.at(this.vertexIndex(0, i)).mInvMass = 0.0;
        }
        sharedSettings.mVertices.at(this.vertexIndex(0, this.gridSize - 1)).mInvMass = 0.0;
        
        // sharedSettings.mVertices.at(this.vertexIndex(this.gridSize - 1, 0)).mInvMass = 0.0;
        // sharedSettings.mVertices.at(this.vertexIndex(this.gridSize - 1, 0)).mInvMass = 0.0;
        // sharedSettings.mVertices.at(this.vertexIndex(this.gridSize - 1, this.gridSize - 1)).mInvMass = 0.0;

        // Create faces
        const face = new Jolt.SoftBodySharedSettingsFace(0, 0, 0, 0);
        for (let y = 0; y < this.gridSize - 1; ++y) {
            for (let x = 0; x < this.gridSize - 1; ++x) {
                face.set_mVertex(0, this.vertexIndex(x, y));
                face.set_mVertex(1, this.vertexIndex(x, y + 1));
                face.set_mVertex(2, this.vertexIndex(x + 1, y + 1));
                sharedSettings.AddFace(face);
                
                face.set_mVertex(1, this.vertexIndex(x + 1, y + 1));
                face.set_mVertex(2, this.vertexIndex(x + 1, y));
                sharedSettings.AddFace(face);
            }
        }

        // Create edges
        const attributes = new Jolt.SoftBodySharedSettingsVertexAttributes();
        attributes.mCompliance = this.compliance;
        attributes.mShearCompliance = this.compliance;
        sharedSettings.CreateConstraints(attributes, 1);

        // Optimize shared settings
        sharedSettings.Optimize();

        // Create soft body
        let bodyCreationSettings = new Jolt.SoftBodyCreationSettings(sharedSettings, new Jolt.RVec3(0, 10, 0), Jolt.Quat.prototype.sIdentity());
        bodyCreationSettings.mObjectLayer = this.layers.LAYER_MOVING;
        bodyCreationSettings.mUpdatePosition = false;
        let body = this.bodyInterface.CreateSoftBody(bodyCreationSettings);
        this.addToScene(body, 0xffffff);
    }

    createBalls = () => {
        // Create spheres to fall on soft body
        for (let s = 0; s < this.colors.length; ++s) {
            let x = 2.0 * Math.random();
            let z = 2.0 * Math.random();
            let radius = 0.75;
            let shape = new Jolt.SphereShape(radius, null);
            let creationSettings = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(x, 15 + 2.0 * radius * s, z), Jolt.Quat.prototype.sIdentity(), Jolt.EMotionType_Dynamic, this.layers.LAYER_MOVING);
            creationSettings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
            creationSettings.mMassPropertiesOverride.mMass = 100.0;
            let body = this.bodyInterface.CreateBody(creationSettings);
            this.addToScene(body, this.colors[s]);
        }
    }

    addContents = () => {
        // create floor
        this.createFloor()
        this.createCloth()
        // this.createBalls();
    }

    update = () => {
        this.elpasedTime = this.clock.getElapsedTime();
        let deltaTime = this.clock.getDelta();
        deltaTime = Math.min(deltaTime, 1.0 / 30.0);

        this.updatePhysics(deltaTime)

        this.render();
        this.frameId = window.requestAnimationFrame(this.update);
    }

    updatePhysics = (deltaTime) => {
        // Update object transforms
        for (let i = 0, il = this.dynamicObjects.length; i < il; i++) {
            let objThree = this.dynamicObjects[i];
            let body = objThree.userData.body;
            objThree.position.copy(this.wrapVec3(body.GetPosition()));
            objThree.quaternion.copy(this.wrapQuat(body.GetRotation()));

            if (body.GetBodyType() == Jolt.EBodyType_SoftBody) {
                if (objThree.userData.updateVertex) {
                    objThree.userData.updateVertex();
                } else {
                    objThree.geometry = this.createMeshForShape(body.GetShape());
                }
            }
        }
	
        // When running below 55 Hz, do 2 steps instead of 1
        var numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1;
        // Step the physics world
        this.jolt.Step(deltaTime, 1);
    }

    render = () => {
        let { renderer, scene, camera, } = this;
        if (renderer) {
            renderer.render(scene, camera);
        }
    }
}

export { Sketch };