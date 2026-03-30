/**
 * 本地伴侣服务器通信客户端
 * 注意：这些函数只能在 background script 中调用（content script 受 CORS 限制）
 */

export const DEFAULT_SERVER_URL = 'http://localhost:9721';

export interface HealthResponse {
  status: 'ok';
  version: string;
  dependencies: {
    'yt-dlp': boolean;
    ffmpeg: boolean;
  };
}

/**
 * 检查本地服务是否运行
 */
export async function checkServerHealth(
  url: string = DEFAULT_SERVER_URL
): Promise<{ ok: boolean; data?: HealthResponse }> {
  try {
    const resp = await fetch(`${url}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return { ok: false };
    const data = await resp.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/**
 * 请求服务器下载并截取音频
 * 返回 MP3 ArrayBuffer
 */
export async function downloadAndCut(
  params: {
    bvid: string;
    startTime: number;
    endTime: number;
  },
  url: string = DEFAULT_SERVER_URL
): Promise<ArrayBuffer> {
  const resp = await fetch(`${url}/api/download-and-cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(errorText || `服务器错误: ${resp.status}`);
  }

  return resp.arrayBuffer();
}
