(function initAddMediaUpload(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListAddMediaUpload = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function addMediaUploadFactory() {
  function createController({
    input, pendingFiles, mobileState, startMobileQueue, pollRecognition,
    uploadFiles, setMessage, onRecognized
  }) {
    function files() {
      return pendingFiles.get(input) || [...(input?.files || [])];
    }

    function progressMessage(file, fraction) {
      return fraction >= 1
        ? `Upload complete · preparing mobile playback for ${file.name}…`
        : `Uploading ${file.name} · ${Math.round(fraction * 100)}%`;
    }

    async function queueMobile(record) {
      const state = mobileState(input, record.id);
      state.releaseAfterDrain = true;
      const onUploaded = (item) => setMessage(`${item.name} uploaded. Continuing the queue…`);
      const onDrained = async () => {
        try {
          await pollRecognition(record.id, (media) => onRecognized(record, media));
        } catch { /* The upload itself has already succeeded. */ }
      };
      startMobileQueue(input, record.id, onUploaded, onDrained);
      return state;
    }

    function uploadForSave(record, uploads) {
      return uploadFiles(record.id, uploads, (file, fraction) => setMessage(progressMessage(file, fraction)));
    }

    return { files, queueMobile, uploadForSave, progressMessage };
  }

  return { createController };
}));
