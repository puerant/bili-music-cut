import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'B站音乐截取',
    description: '从B站视频截取音频片段，创建个人音乐收藏',
    version: '0.1.0',
    permissions: [
      'storage',
      'downloads',
      'activeTab',
      'scripting',
    ],
    host_permissions: [
      '*://*.bilibili.com/*',
      '*://*.bilivideo.com/*',
      '*://*.hdslb.com/*',
      'http://localhost:9721/*',
    ],
  },
});
