(function exposeShowFormController(root, factory) {
  const controller = factory();
  if (typeof module === 'object' && module.exports) module.exports = controller;
  else root.MasterListShowFormController = controller;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createShowFormController() {
  async function createShow({ payload, mediaFiles = [], mobile = false, saveShow, uploadFiles, queueMobileUploads, addExternalMedia }) {
    const saved = await saveShow(payload);
    if (mediaFiles.length) {
      if (mobile) await queueMobileUploads(saved, mediaFiles);
      else await uploadFiles(saved, mediaFiles);
    }
    await addExternalMedia(saved);
    return { saved, uploadsQueued: mobile && mediaFiles.length > 0, uploadCount: mediaFiles.length };
  }

  async function updateShow({ gig, update, mediaFiles = [], saveShow, uploadFiles, addExternalMedia, refreshMedia }) {
    const saved = await saveShow(gig, update);
    if (mediaFiles.length) await uploadFiles(gig, mediaFiles);
    await addExternalMedia(gig);
    const media = await refreshMedia(gig);
    return { saved, media, uploadCount: mediaFiles.length };
  }

  return { createShow, updateShow };
}));
