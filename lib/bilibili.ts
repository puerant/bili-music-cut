// B站视频信息接口
export interface BilibiliVideoInfo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  duration: number; // 秒
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

// 获取音频流地址
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

    // 选择最高质量的音频
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

// 下载音频流 (需要通过background代理请求以绑过CORS)
export async function downloadAudioStream(
  audioUrl: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer | null> {
  try {
    // 发送消息给background脚本进行下载
    const response = await browser.runtime.sendMessage({
      type: 'DOWNLOAD_AUDIO',
      url: audioUrl,
    });

    if (response.error) {
      console.error('下载失败:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('下载音频流失败:', error);
    return null;
  }
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
