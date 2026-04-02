// @ts-nocheck - lamejs 没有类型定义
import lamejs from 'lamejs';
import { fetchAudioForCutting } from '@/lib/bilibili';

/**
 * 使用 Web Audio API 解码音频
 */
async function decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * 使用 lamejs 将 AudioBuffer 编码为 MP3
 */
async function encodeAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const kbps = 128;

  const mp3encoder = new lamejs.Mp3Encoder(numChannels === 1 ? 1 : 2, sampleRate, kbps);
  const mp3Data: Int8Array[] = [];

  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

  const leftInt = floatTo16Bit(left);
  const rightInt = floatTo16Bit(right);

  const blockSize = 1152;
  const totalBlocks = Math.ceil(left.length / blockSize);

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = leftInt.subarray(i, Math.min(i + blockSize, left.length));
    const rightChunk = rightInt.subarray(i, Math.min(i + blockSize, right.length));

    let mp3buf: Int8Array;
    if (numChannels === 1) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    const blockIndex = Math.floor(i / blockSize);
    onProgress?.(Math.round((blockIndex / totalBlocks) * 100));
  }

  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }

  const totalLength = mp3Data.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Data) {
    result.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length), offset);
    offset += chunk.length;
  }

  return new Blob([result], { type: 'audio/mp3' });
}

/**
 * Float32 数组转 Int16 数组
 */
function floatTo16Bit(floatArray: Float32Array): Int16Array {
  const intArray = new Int16Array(floatArray.length);
  for (let i = 0; i < floatArray.length; i++) {
    const sample = Math.max(-1, Math.min(1, floatArray[i]));
    intArray[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return intArray;
}

/**
 * 从B站CDN获取音频流，解码，截取片段，编码为MP3
 * 替代原来的服务器端截取方案
 */
export async function cutAudioFromStream(
  bvid: string,
  cid: number,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  // Step 1: 从CDN获取音频数据
  onProgress?.(5);
  const audioData = await fetchAudioForCutting(bvid, cid);
  if (!audioData) {
    throw new Error('无法下载音频数据');
  }

  onProgress?.(20);

  // Step 2: 解码音频
  const decoded = await decodeAudio(audioData);
  onProgress?.(40);

  // Step 3: 按采样点范围截取
  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const length = Math.max(0, endSample - startSample);

  if (length <= 0) {
    throw new Error('截取时间范围无效');
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const newBuffer = audioContext.createBuffer(numChannels, length, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const sourceData = decoded.getChannelData(channel);
    const destData = newBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      destData[i] = sourceData[startSample + i];
    }
  }

  onProgress?.(60);

  // Step 4: 编码为MP3
  const mp3Blob = await encodeAudioBufferToMp3(newBuffer, (p) => {
    onProgress?.(60 + Math.round(p * 0.38));
  });

  onProgress?.(100);
  return mp3Blob;
}

/**
 * 截取音频片段 (从已有的 ArrayBuffer)
 */
export async function cutAudio(
  audioBuffer: ArrayBuffer,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  onProgress?.(10);
  const decoded = await decodeAudio(audioBuffer);

  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;

  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const length = endSample - startSample;

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const newBuffer = audioContext.createBuffer(numChannels, length, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const sourceData = decoded.getChannelData(channel);
    const destData = newBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      destData[i] = sourceData[startSample + i];
    }
  }

  onProgress?.(50);

  const mp3Blob = await encodeAudioBufferToMp3(newBuffer, (p) => {
    onProgress?.(50 + p * 0.45);
  });

  onProgress?.(100);
  return mp3Blob;
}

/**
 * 下载音频文件
 */
export function downloadAudio(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
