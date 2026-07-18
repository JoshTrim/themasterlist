(function exposeJobs(root, factory) {
  const jobs = factory();
  if (typeof module === 'object' && module.exports) module.exports = jobs;
  else root.MasterListJobs = jobs;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createJobsModule() {
  function createJobQueue({ document, fetchJson, escapeHtml, hideUploads = () => false }) {
    const queue = new Map();
    const panel = document.createElement('aside');
    panel.className = 'job-queue';
    panel.hidden = true;
    panel.innerHTML = '<p class="eyebrow">Background jobs</p><div class="job-queue-list"></div>';
    document.body.append(panel);

    function visibleJobs() {
      return [...queue.values()].filter((job) => !hideUploads() || job.type !== 'Uploading');
    }

    function render() {
      const jobs = visibleJobs();
      const list = panel.querySelector('.job-queue-list');
      if (!jobs.length) {
        panel.hidden = true;
        if (list.childElementCount) list.replaceChildren();
        return;
      }
      list.innerHTML = jobs.map((job) => `<div class="job-entry" data-job-id="${escapeHtml(job.id)}"><div><strong>${escapeHtml(job.type)}</strong><span>${escapeHtml(job.name)}</span><button class="job-dismiss" type="button" aria-label="Cancel or dismiss job">×</button></div><div class="job-bar"><i style="width:${job.progress || 0}%"></i></div><small>${job.status === 'complete' ? 'Complete' : job.status === 'error' ? 'Failed' : job.status === 'cancelled' ? 'Cancelled' : `${Math.round(job.progress || 0)}%`}</small></div>`).join('');
      list.querySelectorAll('.job-dismiss').forEach((button) => button.addEventListener('click', async () => {
        const job = queue.get(button.closest('.job-entry').dataset.jobId);
        if (!job) return;
        if (job.status === 'running' && job.cancel) job.cancel();
        else if (['running', 'queued'].includes(job.status)) {
          try { await fetchJson(`/api/jobs/${job.id}`, { method: 'DELETE' }); } catch { /* It may already be complete. */ }
        }
        queue.delete(job.id);
        render();
      }));
      panel.hidden = false;
    }

    function update(id, patch) {
      queue.set(id, { ...queue.get(id), ...patch, id });
      render();
    }

    async function loadPersistent() {
      try {
        const jobs = await fetchJson('/api/jobs');
        jobs.forEach((job) => update(job.id, job));
      } catch { /* Jobs are optional UI state; page loading should continue. */ }
    }

    return { queue, panel, update, render, loadPersistent, visibleJobs };
  }

  return { createJobQueue };
}));
