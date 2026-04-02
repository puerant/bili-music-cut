// B站视频信息接口
export interface BilibiliVideoInfo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  duration: number;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  cid: number;
  pages: Array<{
    cid: number;
    part: string;
    duration: number;
  }>;
}

// 音频流信息
export interface AudioStreamInfo {
  id: number;
  baseUrl: string;
  backupUrl: string[];
  bandwidth: number;
  mimeType: string;
  codecs: string;
}

// 从URL提取BV号
export function extractBvid(url: string): string | null {
  const match = url.match(/BV[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

// 获取视频信息
export async function getVideoInfo(bvid: string): Promise<BilibiliVideoInfo | null> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      {
        credentials: 'include',
        headers: {
          Referer: 'https://www.bilibili.com',
        },
      }
    );
    const json = await response.json();

    if (json.code !== 0) {
      console.error('B站API错误:', json.message);
      return null;
    }

    const data = json.data;
    return {
      bvid: data.bvid,
      aid: data.aid,
      title: data.title,
      cover: data.pic,
      duration: data.duration,
      owner: {
        mid: data.owner.mid,
        name: data.owner.name,
        face: data.owner.face,
      },
      cid: data.cid,
      pages: data.pages.map((p: any) => ({
        cid: p.cid,
        part: p.part,
        duration: p.duration,
      })),
    };
  } catch (error) {
    console.error('获取视频信息失败:', error);
    return null;
  }
}

// 获取视频分P列表（获取cid）
export async function getCid(bvid: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}&jsonp=jsonp`,
      {
        credentials: 'include',
        headers: {
          Referer: 'https://www.bilibili.com',
        },
      }
    );
    const json = await response.json();

    if (json.code !== 0 || !json.data || json.data.length === 0) {
      console.error('获取cid失败:', json.message);
      return null;
    }

    return json.data[0].cid;
  } catch (error) {
    console.error('获取cid失败:', error);
    return null;
  }
}

// 获取音频流地址（需提供cid）
export async function getAudioStreamUrl(
  bvid: string,
  cid: number
): Promise<AudioStreamInfo | null> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=16&fnval=16&fnver=0&fourk=0`,
      {
        credentials: 'include',
        headers: {
          Referer: 'https://www.bilibili.com',
        },
      }
    );
    const json = await response.json();

    if (json.code !== 0) {
      console.error('获取播放地址失败:', json.message);
      return null;
    }

    const dash = json.data.dash;
    if (!dash || !dash.audio || dash.audio.length === 0) {
      console.error('没有找到音频流');
      return null;
    }

    const audio = dash.audio.sort((a: any, b: any) => b.bandwidth - a.bandwidth)[0];

    return {
      id: audio.id,
      baseUrl: audio.baseUrl,
      backupUrl: audio.backupUrl || [],
      bandwidth: audio.bandwidth,
      mimeType: audio.mimeType,
      codecs: audio.codecs,
    };
  } catch (error) {
    console.error('获取音频流失败:', error);
    return null;
  }
}

// 仅通过BV号获取音频流地址（自动获取cid）
export async function getAudioStreamUrlByBvid(
  bvid: string
): Promise<AudioStreamInfo | null> {
  const videoInfo = await getVideoInfo(bvid);
  const cid = videoInfo?.cid ?? (await getCid(bvid));

  if (!cid) {
    console.error('无法获取cid，请检查BV号');
    return null;
  }

  return getAudioStreamUrl(bvid, cid);
}

/**
 * 直接下载音频流数据（declarativeNetRequest 自动注入 Referer 头）
 */
export async function downloadAudioStream(
  audioUrl: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(audioUrl, { method: 'GET' });

    if (!response.ok) {
      console.error('下载失败:', response.status);
      return null;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && onProgress) {
      const total = parseInt(contentLength, 10);
      const reader = response.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          onProgress(Math.round((received / total) * 100));
        }
        const result = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        return result.buffer;
      }
    }

    return response.arrayBuffer();
  } catch (error) {
    console.error('下载音频流失败:', error);
    return null;
  }
}

/**
 * 获取音频流直接播放 URL（用于 <audio> src）
 */
export async function getAudioStreamDirectUrl(
  bvid: string,
  cid: number
): Promise<string | null> {
  const streamInfo = await getAudioStreamUrl(bvid, cid);
  if (!streamInfo) return null;
  return streamInfo.baseUrl;
}

/**
 * 获取音频流 URL 并下载原始数据（用于截取）
 */
export async function fetchAudioForCutting(
  bvid: string,
  cid: number,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer | null> {
  const streamInfo = await getAudioStreamUrl(bvid, cid);
  if (!streamInfo) {
    console.error('无法获取音频流地址');
    return null;
  }
  return downloadAudioStream(streamInfo.baseUrl, onProgress);
}

/**
 * 延迟获取音频流播放 URL（azusa-player 模式）
 * 播放时才调用 API 获取 CDN 地址
 */
export async function fetchPlayUrl(bvid: string, cid: number): Promise<string | null> {
  if (!cid) {
    cid = (await getCid(bvid)) ?? 0;
  }
  if (!cid) return null;
  return getAudioStreamDirectUrl(bvid, cid);
}

// 格式化时间 (秒 -> mm:ss)
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 解析时间字符串 (mm:ss -> 秒)
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseInt(timeStr) || 0;
}
