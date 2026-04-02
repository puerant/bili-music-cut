import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'B站音乐截取',
    description: '从B站视频截取音频片段，创建个人音乐收藏',
    version: '0.2.0',
    action: {},
    permissions: [
      'storage',
      'downloads',
      'activeTab',
      'scripting',
      'declarativeNetRequest',
    ],
    host_permissions: [
      '*://*.bilibili.com/*',
      '*://*.bilivideo.com/*',
      '*://*.bilivideo.cn/*',
      '*://*.hdslb.com/*',
    ],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'bilivideo_referer_rules',
          enabled: true,
          path: 'rules.json',
        },
      ],
    },
  },
});
