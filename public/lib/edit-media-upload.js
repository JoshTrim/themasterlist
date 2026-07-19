(function initEditMediaUpload(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListEditMediaUpload = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function editMediaUploadFactory() {
  function createController({
    isMobile, input, message, pendingFiles, mobileState, startMobileQueue,
    pollRecognition, renderWorkspace, uploadFiles, fetchJson
  }) {
    function files() {
      return pendingFiles.get(input) || [...(input?.files || [])];
    }

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('error', isError);
    }

    function progressMessage(file, fraction, saving = false) {
      if (saving && fraction >= 1) return `Upload complete · preparing mobile playback for ${file.name}…`;
      return `Uploading ${file.name} · ${Math.round(fraction * 100)}%`;
    }

    function setup(gig) {
      if (input.dataset.immediateUpload) return false;
      input.dataset.immediateUpload = 'true';
      if (isMobile()) {
        const state = mobileState(input, gig.id);
        state.onUploaded = (item) => setMessage(`${item.name} uploaded.`);
        state.onDrained = async () => pollRecognition(gig.id, (refreshed) => renderWorkspace(gig, refreshed));
        startMobileQueue(input, gig.id, state.onUploaded, state.onDrained);
        return true;
      }
      input.addEventListener('change', async () => {
        const uploads = files();
        if (!uploads.length) return;
        setMessage(`Uploading ${uploads.length} file${uploads.length === 1 ? '' : 's'}…`);
        try {
          await uploadFiles(gig.id, uploads, (file, fraction) => setMessage(progressMessage(file, fraction)));
          pendingFiles.set(input, []);
          input.value = '';
          setMessage('Media uploaded.');
          renderWorkspace(gig, await fetchJson(`/api/gigs/${gig.id}/media`));
        } catch (error) {
          setMessage(error.message, true);
        }
      });
      return true;
    }

    function uploadForSave(record, uploads) {
      return uploadFiles(record.id, uploads, (file, fraction) => setMessage(progressMessage(file, fraction, true)));
    }

    return { files, setup, uploadForSave, progressMessage };
  }

  return { createController };
}));
