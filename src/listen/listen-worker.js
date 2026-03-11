// Web Worker: loads folkfriend WASM, receives PCM frames, runs queries on demand.
// All communication via postMessage.

let ff = null;
let wasm = null;
let ptr = null; // reusable PCM window pointer

const INDEX_URL = 'https://folkfriend-app-data.web.app/folkfriend-non-user-data.json';

self.onmessage = async ({ data }) => {
  switch (data.type) {
    case 'init': {
      try {
        // Dynamic import of the WASM glue (ES module worker)
        const mod = await import('./wasm/folkfriend.js');
        await mod.default(); // init wasm
        ff = new mod.FolkFriendWASM();

        // Fetch the tune index (~15MB, cached by browser)
        self.postMessage({ type: 'status', msg: 'Downloading tune index...' });
        const resp = await fetch(INDEX_URL);
        const index = await resp.json();

        // Strip ABC strings before passing to WASM (they slow down loading
        // and aren't needed for matching — same trick Tom uses in his app)
        for (const sid in index.settings) {
          index.settings[sid].abc = '';
        }

        ff.load_index_from_json_obj(index);
        ff.set_sample_rate(data.sampleRate || 48000);

        // Pre-allocate a PCM window pointer for reuse
        ptr = ff.alloc_single_pcm_window();

        self.postMessage({ type: 'ready' });
      } catch (e) {
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
      break;
    }

    case 'query': {
      if (!ff) return;
      const contour = ff.transcribe_pcm_buffer();

      // Check for error response (JSON with .error)
      try {
        const parsed = JSON.parse(contour);
        if (parsed.error) {
          self.postMessage({ type: 'no-match', reason: parsed.error });
          return;
        }
      } catch (_) {
        // Not JSON = valid contour string, continue
      }

      const resultsJson = ff.run_transcription_query(contour);
      const results = JSON.parse(resultsJson);

      self.postMessage({ type: 'results', results, contour });
      break;
    }

    case 'flush': {
      if (ff) ff.flush_pcm_buffer();
      break;
    }
  }
};
