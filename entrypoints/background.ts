// 消息类型定义
interface DownloadMessage {
  type: 'DOWNLOAD_AUDIO';
  url: string;
}

interface DownloadResponse {
  error?: string;
  data?: ArrayBuffer;
}

export default defineBackground(() => {
  console.log('[B站音乐截取] 后台服务已启动', { id: browser.runtime.id });

  // 监听来自content script的消息
  browser.runtime.onMessage.addListener(
    (message: DownloadMessage, sender, sendResponse) => {
      if (message.type === 'DOWNLOAD_AUDIO') {
        handleDownloadAudio(message.url)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({ error: error.message });
          });
        return true; // 保持消息通道开启以进行异步响应
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
