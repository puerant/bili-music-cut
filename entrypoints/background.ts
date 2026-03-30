import { checkServerHealth, downloadAndCut, DEFAULT_SERVER_URL } from '@/lib/server-client';

// 消息类型定义
interface DownloadMessage {
  type: 'DOWNLOAD_AUDIO';
  url: string;
}

interface CheckServerMessage {
  type: 'CHECK_SERVER';
  url?: string;
}

interface ServerCutMessage {
  type: 'SERVER_DOWNLOAD_AND_CUT';
  bvid: string;
  startTime: number;
  endTime: number;
  serverUrl?: string;
}

type Message = DownloadMessage | CheckServerMessage | ServerCutMessage;

interface DownloadResponse {
  error?: string;
  data?: ArrayBuffer;
  ok?: boolean;
}

export default defineBackground(() => {
  console.log('[B站音乐截取] 后台服务已启动', { id: browser.runtime.id });

  browser.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      if (message.type === 'DOWNLOAD_AUDIO') {
        handleDownloadAudio(message.url)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({ error: error.message });
          });
        return true;
      }

      if (message.type === 'CHECK_SERVER') {
        checkServerHealth(message.url || DEFAULT_SERVER_URL)
          .then(result => sendResponse({ ok: result.ok, data: result.data }))
          .catch(() => sendResponse({ ok: false }));
        return true;
      }

      if (message.type === 'SERVER_DOWNLOAD_AND_CUT') {
        downloadAndCut(
          { bvid: message.bvid, startTime: message.startTime, endTime: message.endTime },
          message.serverUrl || DEFAULT_SERVER_URL
        )
          .then(data => sendResponse({ data }))
          .catch(err => sendResponse({ error: err.message }));
        return true;
      }
    }
  );
});

// 处理音频下载 (绑过CORS限制)
async function handleDownloadAudio(url: string): Promise<DownloadResponse> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Referer: 'https://www.bilibili.com',
        Origin: 'https://www.bilibili.com',
      },
    });

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return { data: arrayBuffer };
  } catch (error: any) {
    console.error('[B站音乐截取] 下载失败:', error);
    return { error: error.message || '下载失败' };
  }
}
