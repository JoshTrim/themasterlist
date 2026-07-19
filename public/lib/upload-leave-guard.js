(function initUploadLeaveGuard(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListUploadLeaveGuard = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function uploadLeaveGuardFactory() {
  function hasActiveUpload(jobQueue, mobileBusy = false) {
    return Boolean(mobileBusy) || [...jobQueue.values()].some((job) => job.type === 'Uploading' && job.status === 'running');
  }

  function createGuard({ window, jobQueue, isMobileBusy }) {
    function beforeUnload(event) {
      if (!hasActiveUpload(jobQueue, isMobileBusy())) return false;
      event.preventDefault();
      event.returnValue = '';
      return true;
    }

    function bind() {
      window.addEventListener('beforeunload', beforeUnload);
    }

    function unbind() {
      window.removeEventListener?.('beforeunload', beforeUnload);
    }

    return { bind, unbind, beforeUnload };
  }

  return { createGuard, hasActiveUpload };
}));
