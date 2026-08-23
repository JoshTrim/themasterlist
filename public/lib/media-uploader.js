(function exposeMediaUploader(root, factory) {
  const uploader = factory();
  if (typeof module === 'object' && module.exports) module.exports = uploader;
  else root.MasterListMediaUploader = uploader;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMediaUploaderModule() {
  function createUploader({ fetch, XMLHttpRequest, AbortController, randomUUID, updateJob, isMobile = () => false, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), now = Date.now, random = Math.random, chunkSize = 4 * 1024 * 1024 }) {
    const mobileChains = new Map();
    const endpoint = (gigId, category) => `/api/gigs/${gigId}/${category === 'artifact' ? 'artifacts' : 'media'}`;

    function artifactHeaders(category, options = {}) {
      if (category !== 'artifact') return {};
      return {
        ...(options.artifactGroupId ? { 'X-Artifact-Group-Id': options.artifactGroupId } : {}),
        ...(options.artifactView ? { 'X-Artifact-View': options.artifactView } : {}),
        ...(options.artifactViewLabel ? { 'X-Artifact-View-Label': options.artifactViewLabel } : {})
      };
    }

    async function uploadChunked(gigId, file, jobId, category, onProgress, options) {
      const uploadPath = endpoint(gigId, category); const uploadId = randomUUID(); const controller = new AbortController();
      updateJob(jobId, { cancel: () => controller.abort() });
      let offset = 0; let uploaded = null;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize); let attempt = 0;
        while (true) {
          try {
            const response = await fetch(`${uploadPath}/chunk`, { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': file.type, 'X-Upload-Id': uploadId, 'X-Upload-Offset': String(offset), 'X-Upload-Total': String(file.size), 'X-Media-Filename': encodeURIComponent(file.name), 'X-Media-Category': category, ...artifactHeaders(category, options) }, body: chunk });
            const body = await response.json().catch(() => ({}));
            if (response.status === 409 && Number.isFinite(Number(body.offset))) { offset = Math.max(0, Math.min(file.size, Number(body.offset))); continue; }
            if (!response.ok) throw new Error(body.error || `Chunk failed (HTTP ${response.status})`);
            if (body.complete && category === 'artifact' && body.media?.category !== 'artifact') throw new Error('The server did not save this as an artifact. Restart the server and retry.');
            if (body.complete) uploaded = body.media ? { ...body.media, duplicate: Boolean(body.duplicate) } : body;
            offset = body.complete ? file.size : Math.max(offset, Number(body.offset) || 0);
            updateJob(jobId, { progress: offset / file.size * 100 }); onProgress(file, offset / file.size); break;
          } catch (error) {
            if (controller.signal.aborted) throw new Error('Upload cancelled.');
            if (++attempt >= 6) throw new Error(`${error.message || 'Network error'} after ${attempt} attempts.`);
            await sleep(Math.min(10000, 800 * (2 ** (attempt - 1))));
          }
        }
      }
      return uploaded;
    }

    function uploadDirect(gigId, file, jobId, category, onProgress, options) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest(); updateJob(jobId, { cancel: () => xhr.abort() }); xhr.open('POST', endpoint(gigId, category));
        xhr.setRequestHeader('Content-Type', file.type); xhr.setRequestHeader('X-Media-Filename', encodeURIComponent(file.name)); xhr.setRequestHeader('X-Media-Caption', encodeURIComponent(file.name)); xhr.setRequestHeader('X-Media-Category', category);
        Object.entries(artifactHeaders(category, options)).forEach(([name, value]) => xhr.setRequestHeader(name, value));
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) { updateJob(jobId, { progress: event.loaded / event.total * 100 }); onProgress(file, event.loaded / event.total); } };
        xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status >= 200 && xhr.status < 300) { if (category === 'artifact' && body.media?.category !== 'artifact' && body.category !== 'artifact') reject(new Error('The server did not save this as an artifact. Restart the server and retry.')); else resolve(body); } else reject(new Error(body.error || 'Media upload failed.')); };
        xhr.onerror = () => reject(new Error('Media upload failed.')); xhr.onabort = () => reject(new Error('Upload cancelled.')); xhr.send(file);
      });
    }

    async function uploadNow(gigId, files, onProgress = () => {}, category = 'show', options = {}) {
      const queue = [...files]; const mobile = isMobile(); const uploaded = [];
      const worker = async () => {
        while (queue.length) {
          const file = queue.shift(); const jobId = `${now()}-${random()}`;
          updateJob(jobId, { id: jobId, type: 'Uploading', name: file.name, status: 'running', progress: 0 });
          try {
            const result = mobile
              ? await uploadChunked(gigId, file, jobId, category, onProgress, options)
              : await uploadDirect(gigId, file, jobId, category, onProgress, options);
            uploaded.push(result?.media ? { ...result.media, duplicate: Boolean(result.duplicate) } : result);
            updateJob(jobId, { status: 'complete', progress: 100 });
          } catch (error) { updateJob(jobId, { status: 'error', error: error.message }); throw error; }
        }
      };
      await Promise.all(Array.from({ length: mobile ? 1 : 2 }, () => worker()));
      return uploaded.filter(Boolean);
    }

    function upload(gigId, files, onProgress = () => {}, category = 'show', options = {}) {
      if (!isMobile()) return uploadNow(gigId, files, onProgress, category, options);
      const previous = mobileChains.get(gigId) || Promise.resolve(); const next = previous.catch(() => {}).then(() => uploadNow(gigId, files, onProgress, category, options));
      mobileChains.set(gigId, next); next.finally(() => { if (mobileChains.get(gigId) === next) mobileChains.delete(gigId); }).catch(() => {}); return next;
    }

    return { endpoint, upload, uploadNow };
  }

  return { createUploader };
}));
