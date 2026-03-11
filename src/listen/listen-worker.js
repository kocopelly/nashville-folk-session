// Web Worker: loads folkfriend WASM, receives PCM frames, runs queries on demand.
// All communication via postMessage.

let ff = null;
let ptr = null; // reusable PCM window pointer
let framesReceived = 0;

const INDEX_URL = 'https://folkfriend-app-data.web.app/folkfriend-non-user-data.json';

self.onmessage = async ({ data }) => {
  switch (data.type) {
    case 'init': {
      try {
        console.log('[worker] init: loading WASM...');
        const mod = await import('./wasm/folkfriend.js');
        await mod.default(); // init wasm
        ff = new mod.FolkFriendWASM();
        console.log('[worker] WASM loaded, version:', ff.version());

        // Fetch the tune index
        self.postMessage({ type: 'status', msg: 'Downloading tune index...' });
        console.log('[worker] fetching tune index from', INDEX_URL);
        const resp = await fetch(INDEX_URL);
        const index = await resp.json();
        const settingCount = Object.keys(index.settings).length;
        console.log(`[worker] index loaded: ${settingCount} settings`);

        // Strip ABC strings before passing to WASM
        for (const sid in index.settings) {
          index.settings[sid].abc = '';
        }

        console.log('[worker] loading index into WASM...');
        ff.load_index_from_json_obj(index);

        const sr = data.sampleRate || 48000;
        console.log('[worker] setting sample rate:', sr);
        ff.set_sample_rate(sr);

        // Pre-allocate a PCM window pointer for reuse
        ptr = ff.alloc_single_pcm_window();
        console.log('[worker] PCM window allocated at ptr:', ptr);

        framesReceived = 0;
        self.postMessage({ type: 'ready' });
        console.log('[worker] ready!');
      } catch (e) {
        console.error('[worker] init error:', e);
        self.postMessage({ type: 'error', msg: e.toString() });
      }
      break;
    }

    case 'sample-rate': {
      if (ff) ff.set_sample_rate(data.sampleRate);
      break;
    }

    case 'audio': {
      // data.pcm: Float32Array of 1024 samples
      if (!ff || !ptr) return;
      const arr = ff.get_allocated_pcm_window(ptr);
      arr.set(data.pcm);
      ff.feed_single_pcm_window(ptr);
      framesReceived++;
      // Log every 100 frames (~2s of audio at 48kHz)
      if (framesReceived % 100 === 0) {
        console.log(`[worker] ${framesReceived} audio frames received`);
      }
      break;
    }

    case 'query': {
      if (!ff) {
        console.warn('[worker] query received but ff not initialized');
        return;
      }
      console.log(`[worker] query requested (${framesReceived} frames buffered)`);
      const t0 = performance.now();

      let contour;
      try {
        contour = ff.transcribe_pcm_buffer();
      } catch (e) {
        console.error('[worker] transcribe_pcm_buffer threw:', e);
        self.postMessage({ type: 'no-match', reason: 'transcription exception' });
        return;
      }

      const transcribeMs = (performance.now() - t0).toFixed(1);
      console.log(`[worker] transcribed in ${transcribeMs}ms, contour:`, contour.substring(0, 80), `(len=${contour.length})`);

      // Check for error response (JSON with .error)
      try {
        const parsed = JSON.parse(contour);
        if (parsed.error) {
          console.log('[worker] no match:', parsed.error);
          self.postMessage({ type: 'no-match', reason: parsed.error });
          framesReceived = 0;
          return;
        }
      } catch (_) {
        // Not JSON = valid contour string, continue
      }

      const t1 = performance.now();
      let resultsJson;
      try {
        resultsJson = ff.run_transcription_query(contour);
      } catch (e) {
        console.error('[worker] run_transcription_query threw:', e);
        self.postMessage({ type: 'no-match', reason: 'query exception' });
        framesReceived = 0;
        return;
      }

      const queryMs = (performance.now() - t1).toFixed(1);
      const results = JSON.parse(resultsJson);
      const topScore = results.length > 0 ? results[0].score.toFixed(3) : 'none';
      const topName = results.length > 0 ? results[0].display_name : 'none';
      console.log(`[worker] query in ${queryMs}ms — top: "${topName}" (${topScore}), ${results.length} results`);

      // Enrich top results with aliases
      for (const r of results.slice(0, 4)) {
        try {
          const aliasesJson = ff.aliases_from_tune_id(r.setting.tune_id);
          r.aliases = JSON.parse(aliasesJson);
        } catch (_) {
          r.aliases = [];
        }
      }

      framesReceived = 0;
      self.postMessage({ type: 'results', results, contour });
      break;
    }

    case 'flush': {
      if (ff) ff.flush_pcm_buffer();
      framesReceived = 0;
      break;
    }
  }
};
