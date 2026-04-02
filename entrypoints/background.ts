// 消息类型定义
interface FetchStreamUrlMessage {
  type: 'FETCH_STREAM_URL';
  bvid: string;
  cid: number;
}

interface FetchVideoInfoMessage {
  type: 'FETCH_VIDEO_INFO';
  bvid: string;
}

type Message = FetchStreamUrlMessage | FetchVideoInfoMessage;

export default defineBackground(() => {
  console.log('[B站音乐截取] 后台服务已启动', { id: browser.runtime.id });

  // 点击插件图标直接打开 cutter 页面
  browser.action.onClicked.addListener(() => {
    const url = browser.runtime.getURL('/cutter.html');
    browser.tabs.create({ url });
  });

  browser.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      if (message.type === 'FETCH_STREAM_URL') {
        handleFetchStreamUrl(message.bvid, message.cid)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({ error: error.message });
          });
        return true;
      }

      if (message.type === 'FETCH_VIDEO_INFO') {
        handleFetchVideoInfo(message.bvid)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({ error: error.message });
          });
        return true;
      }
    }
  );
});

/**
 * 从后台上下文获取音频流URL（携带用户cookies）
 * cutter页面无法直接访问bilibili的cookies，需通过background中转
 */
async function handleFetchStreamUrl(
  bvid: string,
  cid: number
): Promise<{ url?: string; error?: string }> {
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
      return { error: json.message || '获取播放地址失败' };
    }

    const dash = json.data.dash;
    if (!dash?.audio?.length) {
      return { error: '没有找到音频流' };
    }

    const audio = dash.audio.sort((a: any, b: any) => b.bandwidth - a.bandwidth)[0];
    return { url: audio.baseUrl };
  } catch (error: any) {
    return { error: error.message || '获取流地址失败' };
  }
}

/**
 * 从后台获取视频信息（携带用户cookies）
 */
async function handleFetchVideoInfo(
  bvid: string
): Promise<{ data?: any; error?: string }> {
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
      return { error: json.message || '获取视频信息失败' };
    }

    return { data: json.data };
  } catch (error: any) {
    return { error: error.message || '获取视频信息失败' };
  }
}
