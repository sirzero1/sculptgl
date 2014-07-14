define([
  'gui/GuiTR',
  'mesh/multiresolution/Multimesh',
  'states/StateMultiresolution'
], function (TR, Multimesh, StateMultiresolution) {

  'use strict';

  function GuiMultiresolution(guiParent, ctrlGui) {
    this.ctrlGui_ = ctrlGui;
    this.sculptgl_ = ctrlGui.sculptgl_; // main application
    this.ctrlResolution_ = null; // multiresolution controller
    this.securityBelt_ = true; // security belt
    this.init(guiParent);
  }

  GuiMultiresolution.prototype = {
    /** Initialize */
    init: function (guiParent) {
      // multires fold
      var foldMultires = guiParent.addFolder(TR('multiresTitle'));
      foldMultires.add(this, 'subdivide').name(TR('multiresSubdivide'));
      foldMultires.add(this, 'reverse').name(TR('multiresReverse'));
      this.ctrlResolution_ = foldMultires.add({
        dummy: 1
      }, 'dummy', 1, 1).step(1).name(TR('multiresResolution'));
      foldMultires.add(this, 'deleteHigher').name(TR('multiresDelHigher'));
      foldMultires.add(this, 'deleteLower').name(TR('multiresDelLower'));
      this.ctrlResolution_.onChange(this.onResolutionChanged.bind(this));
      foldMultires.close();
    },
    /** Check if the mesh is a multiresolution one */
    isMultimesh: function (mesh) {
      return mesh.meshes_ !== undefined;
    },
    /** Convert a mesh into a multiresolution one */
    convertToMultimesh: function (mesh) {
      var multimesh = new Multimesh(mesh);
      this.sculptgl_.replaceMesh(mesh, multimesh);
      return multimesh;
    },
    /** Subdivide the mesh */
    subdivide: function () {
      var main = this.sculptgl_;
      var mul = main.mesh_;
      if (!this.isMultimesh(mul))
        mul = this.convertToMultimesh(mul);
      if (mul.sel_ !== mul.meshes_.length - 1) {
        window.alert(TR('multiresSelectHighest'));
        return;
      }
      if (this.securityBelt_ && mul.getNbTriangles() > 400000) {
        window.alert(TR('multiresWarnBigMesh', mul.getNbFaces() * 4));
        this.securityBelt_ = false;
        return;
      }
      this.securityBelt_ = true;
      main.states_.pushState(new StateMultiresolution(mul, StateMultiresolution.SUBDIVISION));
      this.ctrlGui_.updateMeshInfo(mul.addLevel());
      this.updateMeshResolution(mul);
      main.scene_.render();
    },
    /** Inverse subdivision */
    reverse: function () {
      var main = this.sculptgl_;
      var mul = main.mesh_;
      if (!this.isMultimesh(mul))
        mul = main.mesh_ = this.convertToMultimesh(mul);
      if (mul.sel_ !== 0) {
        window.alert(TR('multiresSelectLowest'));
        return;
      }
      var stateRes = new StateMultiresolution(mul, StateMultiresolution.REVERSION);
      var newMesh = mul.computeReverse();
      if (!newMesh) {
        window.alert(TR('multiresNotReversible'));
        return;
      }
      main.states_.pushState(stateRes);
      this.ctrlGui_.updateMeshInfo(newMesh);
      this.updateMeshResolution(mul);
      main.scene_.render();
    },
    /** Delete the lower meshes */
    deleteLower: function () {
      var main = this.sculptgl_;
      var mul = main.mesh_;
      if (!this.isMultimesh(mul) || mul.sel_ === 0) {
        window.alert(TR('multiresNoLower'));
        return;
      }
      main.states_.pushState(new StateMultiresolution(mul, StateMultiresolution.DELETE_LOWER));
      mul.deleteLower();
      this.updateMeshResolution(mul);
    },
    /** Delete the higher meshes */
    deleteHigher: function () {
      var main = this.sculptgl_;
      var mul = main.mesh_;
      if (!this.isMultimesh(mul) || mul.sel_ === mul.meshes_.length - 1) {
        window.alert(TR('multiresNoHigher'));
        return;
      }
      main.states_.pushState(new StateMultiresolution(mul, StateMultiresolution.DELETE_HIGHER));
      mul.deleteHigher();
      this.updateMeshResolution(mul);
    },
    /** Change resoltuion */
    onResolutionChanged: function (value) {
      var uiRes = value - 1;
      var main = this.sculptgl_;
      var multimesh = main.mesh_;
      if (!this.isMultimesh(multimesh) || multimesh.sel_ === uiRes)
        return;
      main.states_.pushState(new StateMultiresolution(multimesh, StateMultiresolution.SELECTION));
      multimesh.selectResolution(uiRes);
      this.ctrlGui_.updateMeshInfo(multimesh);
      main.scene_.render();
    },
    /** Update the mesh resolution slider */
    updateMeshResolution: function (multimesh) {
      if (!this.isMultimesh(multimesh)) {
        this.ctrlResolution_.max(1);
        this.ctrlResolution_.setValue(0);
        return;
      }
      this.ctrlResolution_.max(multimesh.meshes_.length);
      this.ctrlResolution_.setValue(multimesh.sel_ + 1);
    }
  };

  return GuiMultiresolution;
});