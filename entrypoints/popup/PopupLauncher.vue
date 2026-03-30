<script lang="ts" setup>
import { NButton, NIcon, NResult } from 'naive-ui';
import { SoundOutlined } from '@vicons/antd';

function openCutterPage() {
  const url = browser.runtime.getURL('/cutter.html');
  browser.tabs.create({ url });
}
</script>

<template>
  <div class="launcher">
    <div class="launcher-content">
      <div class="launcher-icon">
        <n-icon size="40" color="#00a1d6"><SoundOutlined /></n-icon>
      </div>
      <h2 class="launcher-title">B站音乐截取</h2>
      <p class="launcher-desc">从B站视频截取你喜欢的音乐片段</p>
      <n-button type="primary" size="large" block @click="openCutterPage">
        打开主页面
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.launcher {
  width: 320px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
}

.launcher-content {
  text-align: center;
  padding: 24px;
}

.launcher-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, #00a1d6, #00b5e2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.launcher-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 6px;
}

.launcher-desc {
  font-size: 13px;
  color: #888;
  margin: 0 0 20px;
}
</style>
