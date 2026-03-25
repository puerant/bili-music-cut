// @ts-nocheck - lamejs 没有类型定义
import lamejs from 'lamejs';

/**
 * 从视频元素捕获音频片段
 * 使用 MediaRecorder API 直接从 video 元素录制音频
 */
export async function captureAudioFromVideo(
  videoElement: HTMLVideoElement,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const duration = endTime - startTime;

      // 创建音频上下文
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sampleRate = audioContext.sampleRate;

      // 从视频元素获取音频流
      let mediaStream: MediaStream;

      // 尝试使用 captureStream (Chrome)
      if ((videoElement as any).captureStream) {
        mediaStream = (videoElement as any).captureStream();
      } else if ((videoElement as any).mozCaptureStream) {
        mediaStream = (videoElement as any).mozCaptureStream();
      } else {
        throw new Error('浏览器不支持 captureStream API');
      }

      // 只获取音频轨道
      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('无法获取音频轨道');
      }

      const audioStream = new MediaStream(audioTracks);

      // 使用 MediaRecorder 录制
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        try {
          onProgress?.(30);

          // 合并录制的音频块
          const webmBlob = new Blob(chunks, { type: mimeType });

          // 将 WebM 转换为 WAV，再转换为 MP3
          const audioBuffer = await decodeAudio(await webmBlob.arrayBuffer());

          onProgress?.(60);

          // 编码为 MP3
          const mp3Blob = await encodeAudioBufferToMp3(audioBuffer, (p) => {
            onProgress?.(60 + p * 0.35);
          });

          onProgress?.(100);
          resolve(mp3Blob);
        } catch (error) {
          reject(error);
        }
      };

      recorder.onerror = (e) => {
        reject(new Error('录音失败: ' + (e as any).error?.message));
      };

      // 跳转到开始位置
      videoElement.currentTime = startTime;

      // 等待视频准备好
      await new Promise<void>((res) => {
        const handler = () => {
          videoElement.removeEventListener('seeked', handler);
          res();
        };
        videoElement.addEventListener('seeked', handler);
      });

      onProgress?.(5);

      // 开始录制
      recorder.start();

      // 播放视频
      await videoElement.play();

      onProgress?.(10);

      // 设置定时器在指定时间后停止
      const stopTimer = setTimeout(() => {
        recorder.stop();
        videoElement.pause();
      }, duration * 1000);

      // 监听视频结束
      const endedHandler = () => {
        clearTimeout(stopTimer);
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        videoElement.removeEventListener('ended', endedHandler);
      };
      videoElement.addEventListener('ended', endedHandler);

    } catch (error) {
      reject(error);
    }
  });
}

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

  // lamejs 只支持单声道或立体声
  const mp3encoder = new lamejs.Mp3Encoder(numChannels === 1 ? 1 : 2, sampleRate, kbps);
  const mp3Data: Int8Array[] = [];

  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

  // 转换为 16 位整数
  const leftInt = floatTo16Bit(left);
  const rightInt = floatTo16Bit(right);

  // 分块编码
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

  // 完成编码
  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(endBuf);
  }

  // 合并所有数据
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
 * 截取音频片段 (从 ArrayBuffer) - 保留兼容性
 */
export async function cutAudio(
  audioBuffer: ArrayBuffer,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  // 解码音频
  onProgress?.(10);
  const decoded = await decodeAudio(audioBuffer);

  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;

  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const length = endSample - startSample;

  // 创建新的 AudioBuffer
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const newBuffer = audioContext.createBuffer(numChannels, length, sampleRate);

  // 复制数据
  for (let channel = 0; channel < numChannels; channel++) {
    const sourceData = decoded.getChannelData(channel);
    const destData = newBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      destData[i] = sourceData[startSample + i];
    }
  }

  onProgress?.(50);

  // 编码为 MP3
  const mp3Blob = await encodeAudioBufferToMp3(newBuffer, (p) => {
    onProgress?.(50 + p * 0.45);
  });

  onProgress?.(100);
  return mp3Blob;
}

/**
 * 将音频转换为 MP3 (不截取)
 */
export async function convertToMp3(
  audioBuffer: ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  onProgress?.(10);
  const decoded = await decodeAudio(audioBuffer);

  const mp3Blob = await encodeAudioBufferToMp3(decoded, (p) => {
    onProgress?.(10 + p * 0.85);
  });

  onProgress?.(100);
  return mp3Blob;
}

/**
 * 获取音频时长
 */
export async function getAudioDuration(audioBuffer: ArrayBuffer): Promise<number> {
  const decoded = await decodeAudio(audioBuffer);
  return decoded.duration;
}

/**
 * 检查音频处理是否就绪
 */
export function isAudioProcessorReady(): boolean {
  return true;
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
