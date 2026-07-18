function parseProgressTime(buffer, chunk) {
  const combined = `${buffer || ''}${chunk || ''}`;
  const finalBreak = combined.lastIndexOf('\n');
  const complete = finalBreak >= 0 ? combined.slice(0, finalBreak + 1) : '';
  const values = complete.split(/\r?\n/).map((line) => line.match(/^out_time_(?:ms|us)=(\d+)$/)?.[1]).filter(Boolean);
  const value = values.length ? Number(values.at(-1)) : null;
  const lastLine = finalBreak >= 0 ? combined.slice(finalBreak + 1) : combined;
  return { buffer: lastLine.slice(-100), microseconds: Number.isFinite(value) ? value : null };
}

function createMediaProcessor({ spawn, fs, path, root, existsSync, env = process.env, logger = console }) {
  function run(command, args, { onProgress = () => {}, onProcess = () => {}, errorMessage = 'Media processing failed.' } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      onProcess(child);
      let progressBuffer = '';
      let error = '';
      child.stdout?.on('data', (chunk) => {
        const parsed = parseProgressTime(progressBuffer, chunk.toString());
        progressBuffer = parsed.buffer;
        if (parsed.microseconds !== null) onProgress(parsed.microseconds);
      });
      child.stderr?.on('data', (chunk) => { error += chunk.toString(); });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(signal === 'SIGTERM' ? 'Media processing was cancelled.' : error.slice(-700) || errorMessage));
      });
    });
  }

  function probeDuration(inputPath, { onProcess } = {}) {
    return new Promise((resolve) => {
      const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath]);
      onProcess?.(child);
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.once('close', () => resolve(Number(output.trim()) || 0));
      child.once('error', () => resolve(0));
    });
  }

  async function createPlaybackProxy(inputPath, outputPath, options = {}) {
    logger.log(`[media] starting playback encode: ${inputPath}`);
    try {
      await run('ffmpeg', ['-y', '-nostdin', '-i', inputPath, '-vf', 'scale=-2:1080', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outputPath], { ...options, errorMessage: 'Playback encode failed.' });
      logger.log(`[media] playback encode complete: ${outputPath}`);
      return true;
    } catch (error) {
      logger.error(`[media] playback encode failed: ${error.message}`);
      return false;
    }
  }

  function rotateVideo(inputPath, outputPath, direction = 'clockwise', options = {}) {
    const transpose = direction === 'counterclockwise' ? 'transpose=2' : 'transpose=1';
    return run('ffmpeg', ['-y', '-nostdin', '-i', inputPath, '-map', '0', '-vf', transpose, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', outputPath], { ...options, errorMessage: 'Video rotation failed.' });
  }

  function trimVideo(inputPath, outputPath, start, duration, options = {}) {
    return run('ffmpeg', ['-y', '-nostdin', '-ss', String(start), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', outputPath], { ...options, errorMessage: 'ffmpeg trim failed.' });
  }

  function extractRecognitionSample(inputPath, outputPath, startSeconds = 0, options = {}) {
    return run('ffmpeg', ['-y', '-nostdin', '-ss', String(Math.max(0, startSeconds)), '-i', inputPath, '-t', '12', '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', outputPath], { ...options, errorMessage: 'Could not extract an audio sample.' });
  }

  function removeImageBackground(inputPath, outputPath, options = {}) {
    const bundledCommand = path.join(root, '.venv', 'bin', 'rembg');
    const command = env.REMBG_COMMAND || (existsSync(bundledCommand) ? bundledCommand : 'rembg');
    const model = String(env.REMBG_MODEL || 'isnet-general-use').trim();
    return run(command, ['i', '-m', model, inputPath, outputPath], { ...options, errorMessage: 'Background removal failed.' }).catch((error) => {
      if (error.code === 'ENOENT') throw new Error('Background removal is not installed. Run npm run setup:background-removal, then restart the server.');
      throw error;
    });
  }

  return { run, probeDuration, createPlaybackProxy, rotateVideo, trimVideo, extractRecognitionSample, removeImageBackground };
}

module.exports = { parseProgressTime, createMediaProcessor };
