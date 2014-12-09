define([
  'misc/Utils',
  'editor/Sculpt',
  'files/Import',
  'files/ReplayWriter',
  'files/ReplayReader',
  'gui/Gui',
  'math3d/Camera',
  'math3d/Picking',
  'mesh/Background',
  'mesh/Grid',
  'mesh/Mesh',
  'mesh/multiresolution/Multimesh',
  'states/States',
  'render/Render',
  'render/shaders/ShaderMatcap'
], function (Utils, Sculpt, Import, ReplayWriter, ReplayReader, Gui, Camera, Picking, Background, Grid, Mesh, Multimesh, States, Render, ShaderMatcap) {

  'use strict';

  function SculptGL() {
    this.gl_ = null; // webgl context
    this.canvas_ = document.getElementById('canvas');

    // controllers stuffs
    this.mouseX_ = 0; // the x position
    this.mouseY_ = 0; // the y position
    this.lastMouseX_ = 0; // the last x position
    this.lastMouseY_ = 0; // the last y position
    this.sumDisplacement_ = 0; // sum of the displacement mouse
    this.mouseButton_ = 0; // which mouse button is pressed

    // core of the app
    this.states_ = new States(this); // for undo-redo
    this.sculpt_ = new Sculpt(this.states_); // sculpting management
    this.camera_ = new Camera(); // the camera
    this.picking_ = new Picking(this); // the ray picking
    this.pickingSym_ = new Picking(this); // the symmetrical picking

    // renderable stuffs
    this.showGrid_ = true;
    this.grid_ = null; // the grid
    this.background_ = null; // the background
    this.meshes_ = []; // the meshes
    this.mesh_ = null; // the selected mesh

    // ui stuffs
    this.gui_ = new Gui(this); // gui
    this.focusGui_ = false; // if the gui is being focused

    // misc stuffs
    this.replayerWriter_ = new ReplayWriter(this); // the user event stack replayer
    this.replayerReader_ = new ReplayReader(this); // reader replayer
    this.isReplayed_ = false; // if we want to save the replay mode
    this.preventRender_ = false; // prevent multiple render per render
  }

  SculptGL.prototype = {
    /** Initialization */
    start: function () {
      this.initWebGL();
      if (!this.gl_)
        return;
      this.background_ = new Background(this.gl_);
      this.grid_ = new Grid(this.gl_);
      this.loadTextures();
      this.gui_.initGui();
      this.onCanvasResize();
      this.addEvents();
      this.addSphere();
      this.getReplayReader().checkURL();
    },
    getReplayWriter: function () {
      return this.replayerWriter_;
    },
    getReplayReader: function () {
      return this.replayerReader_;
    },
    getBackground: function () {
      return this.background_;
    },
    getCanvas: function () {
      return this.canvas_;
    },
    getCamera: function () {
      return this.camera_;
    },
    getGui: function () {
      return this.gui_;
    },
    getMeshes: function () {
      return this.meshes_;
    },
    getMesh: function () {
      return this.mesh_;
    },
    getPicking: function () {
      return this.picking_;
    },
    getPickingSymmetry: function () {
      return this.pickingSym_;
    },
    getSculpt: function () {
      return this.sculpt_;
    },
    getStates: function () {
      return this.states_;
    },
    isReplayed: function () {
      return this.isReplayed_;
    },
    setReplayed: function (isReplayed) {
      this.isReplayed_ = isReplayed;
    },
    setMesh: function (mesh) {
      this.mesh_ = mesh;
      this.getGui().updateMesh();
      this.render();
    },
    /** Request a render */
    render: function () {
      if (this.preventRender_ === true)
        return;
      window.requestAnimationFrame(this.applyRender.bind(this));
      this.preventRender_ = true;
    },
    /** Render the scene */
    applyRender: function () {
      this.preventRender_ = false;
      var gl = this.gl_;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.background_.render();
      this.computeMatricesAndSort();
      if (this.showGrid_)
        this.grid_.render();
      for (var i = 0, meshes = this.meshes_, nb = meshes.length; i < nb; ++i)
        meshes[i].render(this);
    },
    /** Pre compute matrices and sort meshes */
    computeMatricesAndSort: function () {
      var meshes = this.meshes_;
      var cam = this.camera_;
      this.grid_.computeMatrices(cam);
      for (var i = 0, nb = meshes.length; i < nb; ++i)
        meshes[i].computeMatrices(cam);
      meshes.sort(Mesh.sortFunction);
    },
    /** Load webgl context */
    initWebGL: function () {
      // TODO : add an option to toggle antialias if possible ?
      var attributes = {
        antialias: true,
        stencil: true
      };
      var canvas = document.getElementById('canvas');
      var gl = this.gl_ = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
      if (!gl) {
        window.alert('Could not initialise WebGL. You should try Chrome or Firefox.');
      }
      if (gl) {
        if (!gl.getExtension('OES_element_index_uint')) {
          Render.ONLY_DRAW_ARRAYS = true;
        }
        gl.viewportWidth = window.innerWidth;
        gl.viewportHeight = window.innerHeight;
        gl.clearColor(0.2, 0.2, 0.2, 1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
    },
    /** Load textures (preload) */
    loadTextures: function () {
      var self = this;
      var loadTex = function (path, idMaterial) {
        var mat = new Image();
        mat.src = path;
        var gl = self.gl_;
        mat.onload = function () {
          var idTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, idTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mat);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.bindTexture(gl.TEXTURE_2D, null);
          ShaderMatcap.textures[idMaterial] = idTex;
        };
      };
      for (var i = 0, mats = ShaderMatcap.matcaps, l = mats.length; i < l; ++i)
        loadTex(mats[i].path, i);
    },
    /** Called when the window is resized */
    onCanvasResize: function () {
      var newWidth = this.gl_.viewportWidth = this.camera_.width_ = this.canvas_.width;
      var newHeight = this.gl_.viewportHeight = this.camera_.height_ = this.canvas_.height;

      if (!this.isReplayed())
        this.getReplayWriter().pushCameraSize(newWidth, newHeight);

      this.background_.onResize(newWidth, newHeight);
      this.gl_.viewport(0, 0, newWidth, newHeight);
      this.camera_.updateProjection();
      this.render();
    },
    /** Initialize */
    addEvents: function () {
      var canvas = this.canvas_;

      var cbMouseMove = Utils.throttle(this.onMouseMove.bind(this), 16.66);
      var cbMouseDown = this.onMouseDown.bind(this);
      var cbMouseUp = this.onMouseUp.bind(this);
      var cbMouseOut = this.onMouseOut.bind(this);
      var cbMouseOver = this.onMouseOver.bind(this);
      var cbMouseWheel = this.onMouseWheel.bind(this);
      var cbTouchStart = this.onTouchStart.bind(this);
      var cbTouchMove = this.onTouchMove.bind(this);

      // mouse
      canvas.addEventListener('mousedown', cbMouseDown, false);
      canvas.addEventListener('mouseup', cbMouseUp, false);
      canvas.addEventListener('mouseout', cbMouseOut, false);
      canvas.addEventListener('mouseover', cbMouseOver, false);
      canvas.addEventListener('mousemove', cbMouseMove, false);
      canvas.addEventListener('mousewheel', cbMouseWheel, false);
      canvas.addEventListener('DOMMouseScroll', cbMouseWheel, false);

      // multi touch
      canvas.addEventListener('touchstart', cbTouchStart, false);
      canvas.addEventListener('touchmove', cbTouchMove, false);
      canvas.addEventListener('touchend', cbMouseUp, false);
      canvas.addEventListener('touchcancel', cbMouseUp, false);
      canvas.addEventListener('touchleave', cbMouseUp, false);

      var cbContextLost = this.onContextLost.bind(this);
      var cbContextRestored = this.onContextRestored.bind(this);
      var cbLoadFiles = this.loadFiles.bind(this);
      var cbLoadBackground = this.loadBackground.bind(this);
      var cbStopAndPrevent = this.stopAndPrevent.bind(this);

      // misc
      canvas.addEventListener('webglcontextlost', cbContextLost, false);
      canvas.addEventListener('webglcontextrestored', cbContextRestored, false);
      window.addEventListener('dragenter', cbStopAndPrevent, false);
      window.addEventListener('dragover', cbStopAndPrevent, false);
      window.addEventListener('drop', cbLoadFiles, false);
      document.getElementById('fileopen').addEventListener('change', cbLoadFiles, false);
      document.getElementById('backgroundopen').addEventListener('change', cbLoadBackground, false);

      this.removeCallback = function () {
        // mouse
        canvas.removeEventListener('mousedown', cbMouseDown, false);
        canvas.removeEventListener('mouseup', cbMouseUp, false);
        canvas.removeEventListener('mouseout', cbMouseOut, false);
        canvas.removeEventListener('mouseover', cbMouseOver, false);
        canvas.removeEventListener('mousemove', cbMouseMove, false);
        canvas.removeEventListener('mousewheel', cbMouseWheel, false);
        canvas.removeEventListener('DOMMouseScroll', cbMouseWheel, false);

        // multi touch
        canvas.removeEventListener('touchstart', cbTouchStart, false);
        canvas.removeEventListener('touchmove', cbTouchMove, false);
        canvas.removeEventListener('touchend', cbMouseUp, false);
        canvas.removeEventListener('touchcancel', cbMouseUp, false);
        canvas.removeEventListener('touchleave', cbMouseUp, false);

        // misc
        canvas.removeEventListener('webglcontextlost', cbContextLost, false);
        canvas.removeEventListener('webglcontextrestored', cbContextRestored, false);
        window.removeEventListener('dragenter', cbStopAndPrevent, false);
        window.removeEventListener('dragover', cbStopAndPrevent, false);
        window.removeEventListener('drop', cbLoadFiles, false);
        document.getElementById('fileopen').removeEventListener('change', cbLoadFiles, false);
        document.getElementById('backgroundopen').removeEventListener('change', cbLoadBackground, false);
      };
    },
    stopAndPrevent: function (event) {
      event.stopPropagation();
      event.preventDefault();
    },
    /** Remove events */
    removeEvents: function () {
      if (this.removeCallback) this.removeCallback();
    },
    /** Load background */
    loadBackground: function (event) {
      if (event.target.files.length === 0)
        return;
      var file = event.target.files[0];
      if (!file.type.match('image.*'))
        return;
      var reader = new FileReader();
      var canvas = this.getCanvas();
      var self = this;
      reader.onload = function (evt) {
        var bg = new Image();
        bg.src = evt.target.result;
        self.getBackground().loadBackgroundTexture(bg);
        self.getBackground().onResize(canvas.width, canvas.height);
        self.render();
        document.getElementById('backgroundopen').value = '';
      };
      reader.readAsDataURL(file);
    },
    /** Return the file type */
    getFileType: function (name) {
      var lower = name.toLowerCase();
      if (lower.endsWith('.obj')) return 'obj';
      if (lower.endsWith('.sgl')) return 'sgl';
      if (lower.endsWith('.stl')) return 'stl';
      if (lower.endsWith('.ply')) return 'ply';
      if (lower.endsWith('.rep')) return 'rep';
      return;
    },
    /** Load file */
    loadFiles: function (event) {
      event.stopPropagation();
      event.preventDefault();
      var files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
      for (var i = 0, nb = files.length; i < nb; ++i) {
        var file = files[i];
        var fileType = this.getFileType(file.name);
        this.readFile(file, fileType);
        if (fileType === 'rep')
          return;
      }
    },
    readFile: function (file, ftype) {
      var fileType = ftype || this.getFileType(file.name);
      if (!fileType)
        return;

      var reader = new FileReader();
      var self = this;
      reader.onload = function (evt) {
        if (fileType === 'rep')
          self.getReplayReader().import(evt.target.result, null, file.name.substr(0, file.name.length - 4));
        else
          self.loadScene(evt.target.result, fileType);
        document.getElementById('fileopen').value = '';
      };

      if (fileType === 'obj')
        reader.readAsText(file);
      else
        reader.readAsArrayBuffer(file);
    },
    computeBoundingBoxMeshes: function (meshes) {
      var bigBound = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (var i = 0, l = meshes.length; i < l; ++i) {
        var bound = meshes[i].getBound();
        if (bound[0] < bigBound[0]) bigBound[0] = bound[0];
        if (bound[1] < bigBound[1]) bigBound[1] = bound[1];
        if (bound[2] < bigBound[2]) bigBound[2] = bound[2];
        if (bound[3] > bigBound[3]) bigBound[3] = bound[3];
        if (bound[4] > bigBound[4]) bigBound[4] = bound[4];
        if (bound[5] > bigBound[5]) bigBound[5] = bound[5];
      }
      return bigBound;
    },
    centerMeshes: function (meshes) {
      var box = this.computeBoundingBoxMeshes(meshes);
      var trans = [-(box[0] + box[3]) * 0.5, -(box[1] + box[4]) * 0.5, -(box[2] + box[5]) * 0.5];
      for (var i = 0, l = meshes.length; i < l; ++i)
        meshes[i].translate(trans);
    },
    /** Load a file */
    loadScene: function (fileData, fileType) {
      var newMeshes;
      if (fileType === 'obj') newMeshes = Import.importOBJ(fileData, this.gl_);
      else if (fileType === 'sgl') newMeshes = Import.importSGL(fileData, this.gl_);
      else if (fileType === 'stl') newMeshes = Import.importSTL(fileData, this.gl_);
      else if (fileType === 'ply') newMeshes = Import.importPLY(fileData, this.gl_);
      var nbNewMeshes = newMeshes.length;
      if (nbNewMeshes === 0)
        return;

      var meshes = this.meshes_;
      var ignoreTransform = fileType === 'sgl';
      for (var i = 0; i < nbNewMeshes; ++i) {
        var mesh = newMeshes[i] = new Multimesh(newMeshes[i]);
        mesh.init(ignoreTransform);
        mesh.initRender();
        meshes.push(mesh);
      }

      if (!this.isReplayed())
        this.getReplayWriter().pushLoadMeshes(newMeshes, fileData, fileType);

      this.centerMeshes(newMeshes);
      this.states_.pushStateAdd(newMeshes);
      this.setMesh(meshes[meshes.length - 1]);
      this.camera_.resetView();
    },
    /** Load the sphere */
    addSphere: function () {
      if (!this.isReplayed())
        this.getReplayWriter().pushAddSphere();

      // make a cube and subdivide it
      var mesh = new Mesh(this.gl_);

      var v = new Float32Array(24);
      v[1] = v[2] = v[4] = v[6] = v[7] = v[9] = v[10] = v[11] = v[14] = v[18] = v[21] = v[23] = -10.0;
      v[0] = v[3] = v[5] = v[8] = v[12] = v[13] = v[15] = v[16] = v[17] = v[19] = v[20] = v[22] = 10.0;

      var uv = new Float32Array(28);
      uv[0] = uv[6] = uv[8] = uv[10] = uv[11] = uv[13] = uv[16] = uv[23] = uv[25] = 0.5;
      uv[1] = uv[3] = 1.0;
      uv[2] = uv[4] = uv[9] = uv[12] = uv[14] = uv[15] = uv[18] = 0.25;
      uv[5] = uv[7] = uv[21] = uv[24] = uv[26] = uv[27] = 0.75;
      uv[17] = uv[19] = uv[20] = uv[22] = 0.0;

      var f = new Int32Array(24);
      var ft = new Int32Array(24);
      f[0] = f[8] = f[21] = ft[0] = 0;
      f[1] = f[11] = f[12] = ft[1] = 1;
      f[2] = f[15] = f[16] = ft[2] = ft[15] = ft[16] = 2;
      f[3] = f[19] = f[22] = ft[3] = ft[19] = ft[22] = 3;
      f[4] = f[9] = f[20] = ft[4] = ft[9] = 4;
      f[7] = f[10] = f[13] = ft[5] = ft[18] = ft[23] = 5;
      f[6] = f[14] = f[17] = ft[6] = ft[14] = ft[17] = 6;
      f[5] = f[18] = f[23] = ft[7] = ft[10] = 7;
      ft[8] = 8;
      ft[11] = 9;
      ft[12] = 10;
      ft[13] = 11;
      ft[20] = 12;
      ft[21] = 13;

      mesh.setVertices(v);
      mesh.setFaces(f);
      mesh.initTexCoordsDataFromOBJData(uv, ft);

      mesh.init();
      mesh.initRender();

      mesh = new Multimesh(mesh);
      while (mesh.getNbFaces() < 20000)
        mesh.addLevel();
      // discard the very low res
      mesh.meshes_.splice(0, 3);
      mesh.sel_ -= 3;

      this.meshes_.push(mesh);
      this.states_.pushStateAdd(mesh);
      this.setMesh(mesh);
    },
    /** Clear the scene */
    clearScene: function () {
      this.getStates().reset();
      this.getMeshes().length = 0;
      this.getCamera().resetView();
      this.showGrid_ = true;
      this.setMesh(null);
      this.mouseButton_ = 0;
      this.getReplayWriter().reset();
    },
    /** Delete the current selected mesh */
    deleteCurrentMesh: function () {
      if (!this.mesh_)
        return;

      if (!this.isReplayed())
        this.getReplayWriter().pushDeleteMesh();

      this.states_.pushStateRemove(this.mesh_);
      this.meshes_.splice(this.meshes_.indexOf(this.mesh_), 1);
      this.setMesh(null);
    },
    /** WebGL context is lost */
    onContextLost: function () {
      window.alert('shit happens : context lost');
    },
    /** WebGL context is restored */
    onContextRestored: function () {
      window.alert('context is restored');
    },
    /** Mouse over event */
    onMouseOver: function () {
      this.focusGui_ = false;
    },
    /** Mouse out event */
    onMouseOut: function (event) {
      this.focusGui_ = true;
      this.onMouseUp(event);
    },
    /** Mouse released event */
    onMouseUp: function (event) {
      event.preventDefault();

      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceUp();

      this.canvas_.style.cursor = 'default';
      this.mouseButton_ = 0;
      Multimesh.RENDER_HINT = Multimesh.NONE;
      this.sculpt_.end();
      this.render();
    },
    /** Mouse wheel event */
    onMouseWheel: function (event) {
      event.stopPropagation();
      event.preventDefault();

      var dir = (event.detail < 0 || event.wheelDelta > 0) ? 1 : -1;
      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceWheel(dir);

      this.camera_.zoom(dir * 0.02);
      Multimesh.RENDER_HINT = Multimesh.CAMERA;
      this.render();
    },
    /** Set mouse position from event */
    setMousePosition: function (event) {
      this.mouseX_ = event.pageX - this.canvas_.offsetLeft;
      this.mouseY_ = event.pageY - this.canvas_.offsetTop;
    },
    /** Touch start event */
    onTouchStart: function (event) {
      event.stopPropagation();
      event.preventDefault();
      var touches = event.targetTouches;
      var evProxy = {};
      evProxy.pageX = touches[0].pageX;
      evProxy.pageY = touches[0].pageY;
      if (touches.length === 1) evProxy.which = 1;
      else if (touches.length === 2) evProxy.which = 4;
      else evProxy.which = 2;
      this.onDeviceDown(evProxy);
    },
    /** Touch move event */
    onTouchMove: function (event) {
      event.stopPropagation();
      event.preventDefault();
      var touches = event.targetTouches;
      var evProxy = {};
      evProxy.pageX = touches[0].pageX;
      evProxy.pageY = touches[0].pageY;
      this.onDeviceMove(evProxy);
    },
    /** Mouse down event */
    onMouseDown: function (event) {
      event.stopPropagation();
      event.preventDefault();
      this.onDeviceDown(event);
    },
    /** Mouse move event */
    onMouseMove: function (event) {
      event.stopPropagation();
      event.preventDefault();
      this.onDeviceMove(event);
    },
    /** Device down event */
    onDeviceDown: function (event) {
      if (!this.isReplayed()) {
        if (this.focusGui_)
          return;
        this.setMousePosition(event);
      }
      var mouseX = this.mouseX_;
      var mouseY = this.mouseY_;
      var button = this.mouseButton_ = event.which;

      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceDown(button, mouseX, mouseY, event);

      if (button === 1) {
        this.sumDisplacement_ = 0;
        this.sculpt_.start(this);
      }
      var picking = this.picking_;
      var pickedMesh = picking.getMesh();
      if (button === 1 && pickedMesh)
        this.canvas_.style.cursor = 'none';

      if ((!pickedMesh || button === 3) && event.ctrlKey)
        this.mouseButton_ = 4; // zoom camera
      else if ((!pickedMesh || button === 3) && event.altKey)
        this.mouseButton_ = 2; // pan camera
      else if (button === 3 || (button === 1 && !pickedMesh)) {
        this.mouseButton_ = 3; // rotate camera
        if (this.camera_.usePivot_)
          picking.intersectionMouseMeshes(this.meshes_, mouseX, mouseY);
        this.camera_.start(mouseX, mouseY, picking);
      }
      this.lastMouseX_ = mouseX;
      this.lastMouseY_ = mouseY;
    },
    /** Device move event */
    onDeviceMove: function (event) {
      if (!this.isReplayed()) {
        if (this.focusGui_)
          return;
        this.setMousePosition(event);
      }
      var mouseX = this.mouseX_;
      var mouseY = this.mouseY_;
      var button = this.mouseButton_;

      if (!this.isReplayed())
        this.getReplayWriter().pushDeviceMove(mouseX, mouseY);

      if (button !== 1 || this.sculpt_.allowPicking()) {
        Multimesh.RENDER_HINT = Multimesh.PICKING;
        if (this.mesh_ && button === 1)
          this.picking_.intersectionMouseMesh(this.mesh_, mouseX, mouseY);
        else
          this.picking_.intersectionMouseMeshes(this.meshes_, mouseX, mouseY);
        if (this.sculpt_.getSymmetry() && this.mesh_)
          this.pickingSym_.intersectionMouseMesh(this.mesh_, mouseX, mouseY, true);
      }
      if (button !== 0) {
        if (button === 2) {
          this.camera_.translate((mouseX - this.lastMouseX_) / 3000, (mouseY - this.lastMouseY_) / 3000);
          Multimesh.RENDER_HINT = Multimesh.CAMERA;
        } else if (button === 4) {
          this.camera_.zoom((mouseX - this.lastMouseX_) / 3000);
          Multimesh.RENDER_HINT = Multimesh.CAMERA;
        } else if (button === 3) {
          this.camera_.rotate(mouseX, mouseY);
          Multimesh.RENDER_HINT = Multimesh.CAMERA;
        } else if (button === 1) {
          Multimesh.RENDER_HINT = Multimesh.SCULPT;
          this.sculpt_.update(this);
          if (this.getMesh().getDynamicTopology)
            this.gui_.updateMeshInfo();
        }
      }
      this.lastMouseX_ = mouseX;
      this.lastMouseY_ = mouseY;
      this.render();
    },
    getIndexMesh: function (mesh) {
      var meshes = this.meshes_;
      var id = mesh.getID();
      for (var i = 0, nbMeshes = meshes.length; i < nbMeshes; ++i) {
        var testMesh = meshes[i];
        if (testMesh === mesh || testMesh.getID() === id)
          return i;
      }
      return -1;
    },
    /** Replace a mesh in the scene */
    replaceMesh: function (mesh, newMesh) {
      var index = this.getIndexMesh(mesh);
      if (index >= 0) this.meshes_[index] = newMesh;
      if (this.mesh_ === mesh) this.setMesh(newMesh);
    }
  };

  return SculptGL;
});