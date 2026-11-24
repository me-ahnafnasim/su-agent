/** Browser-side helpers: turn a recorded clip into 16 kHz mono 16-bit WAV (a format Gemini accepts). */

export const STT_SAMPLE_RATE = 16000;

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Decodes any recorded blob (webm/ogg/mp4) and resamples it to 16 kHz mono WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const decodeCtx = new AudioContext();
  try {
    const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * STT_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, STT_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded; // multi-channel input is down-mixed to mono by the 1-channel context
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), STT_SAMPLE_RATE);
  } finally {
    void decodeCtx.close().catch(() => undefined);
  }
}
