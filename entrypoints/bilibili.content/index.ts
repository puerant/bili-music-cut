import { createApp } from 'vue';
import CutPanel from './CutPanel.vue';
import { extractBvid, getVideoInfo } from '@/lib/bilibili';
import type { BilibiliVideoInfo } from '@/lib/bilibili';

export default defineContentScript({
  matches: ['*://www.bilibili.com/video/*'],
  runAt: 'document_idle',

  async main(ctx) {
    console.log('[B站音乐截取] 内容脚本已加载');

    // 等待视频播放器加载
    await waitForPlayer();

    // 创建UI容器
    const container = document.createElement('div');
    container.id = 'bili-music-cut-container';
    document.body.appendChild(container);

    // 创建Vue应用
    const app = createApp(CutPanel, {
      videoInfo: null as BilibiliVideoInfo | null,
    });

    // 监听URL变化 (B站是SPA)
    let currentUrl = location.href;
    const observer = new MutationObserver(async () => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        await updateVideoInfo(app);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 初始化视频信息
    await updateVideoInfo(app);

    // 挂载应用
    app.mount(container);

    console.log('[B站音乐截取] 面板已创建');
  },
});

async function waitForPlayer(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const player = document.querySelector('.bpx-player-container');
      if (player) {
        resolve();
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

async function updateVideoInfo(app: any): Promise<void> {
  const bvid = extractBvid(location.href);
  if (bvid) {
    const info = await getVideoInfo(bvid);
    if (info && app._instance) {
      app._instance.props.videoInfo = info;
    }
  }
}
