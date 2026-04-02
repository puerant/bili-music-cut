<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import type { BilibiliVideoInfo } from '@/lib/bilibili';
import { formatTime } from '@/lib/bilibili';
import { cutAudioFromStream } from '@/lib/audio-cutter';
import { trackDb, albumDb } from '@/lib/db';

// Props
const props = defineProps<{
  videoInfo: BilibiliVideoInfo | null;
}>();

// 状态
const isPanelOpen = ref(false);
const isLoading = ref(false);
const loadingProgress = ref(0);
const loadingMessage = ref('');
const startTime = ref(0);
const endTime = ref(0);
const trackName = ref('');
const selectedAlbumId = ref<string>('');
const albums = ref<Array<{ id: string; name: string }>>([]);
const saveSuccess = ref(false);
const errorMessage = ref('');

// 计算属性
const videoPlayer = computed(() => {
  return document.querySelector('video') as HTMLVideoElement | null;
});

const videoDuration = computed(() => {
  return props.videoInfo?.duration || videoPlayer.value?.duration || 0;
});

const selectedDuration = computed(() => {
  return Math.max(0, endTime.value - startTime.value);
});

// 格式化显示时间
const formattedStartTime = computed(() => formatTime(startTime.value));
const formattedEndTime = computed(() => formatTime(endTime.value));
const formattedDuration = computed(() => formatTime(selectedDuration.value));

// 方法
function togglePanel() {
  isPanelOpen.value = !isPanelOpen.value;
  if (isPanelOpen.value) {
    loadAlbums();
    if (endTime.value === 0 && videoDuration.value > 0) {
      endTime.value = Math.min(60, videoDuration.value);
    }
  }
}

async function loadAlbums() {
  const allAlbums = await albumDb.getAll();
  albums.value = allAlbums.map(a => ({ id: a.id, name: a.name }));
}

function setStartTime() {
  if (videoPlayer.value) {
    startTime.value = Math.floor(videoPlayer.value.currentTime);
    if (startTime.value >= endTime.value) {
      endTime.value = Math.min(startTime.value + 30, videoDuration.value);
    }
  }
}

function setEndTime() {
  if (videoPlayer.value) {
    endTime.value = Math.floor(videoPlayer.value.currentTime);
    if (endTime.value <= startTime.value) {
      startTime.value = Math.max(0, endTime.value - 30);
    }
  }
}

function previewSelection() {
  if (videoPlayer.value) {
    videoPlayer.value.currentTime = startTime.value;
    videoPlayer.value.play();
  }
}

async function saveTrack() {
  if (!props.videoInfo) {
    errorMessage.value = '未获取到视频信息';
    return;
  }

  if (!trackName.value.trim()) {
    errorMessage.value = '请输入音轨名称';
    return;
  }

  if (selectedDuration.value <= 0) {
    errorMessage.value = '请选择有效的时间范围';
    return;
  }

  isLoading.value = true;
  loadingMessage.value = '正在获取音频流...';
  loadingProgress.value = 5;
  errorMessage.value = '';

  try {
    loadingMessage.value = '正在下载并截取音频...';
    loadingProgress.value = 10;

    const mp3Blob = await cutAudioFromStream(
      props.videoInfo.bvid,
      props.videoInfo.cid,
      startTime.value,
      endTime.value,
      (progress) => {
        loadingProgress.value = 10 + Math.round(progress * 0.8);
        if (progress < 40) {
          loadingMessage.value = '正在下载音频...';
        } else if (progress < 60) {
          loadingMessage.value = '正在解码...';
        } else {
          loadingMessage.value = '正在编码为MP3...';
        }
      }
    );

    loadingProgress.value = 95;
    loadingMessage.value = '正在保存...';

    // 保存元数据（不存储音频 blob）
    await trackDb.create({
      name: trackName.value.trim(),
      albumId: selectedAlbumId.value || undefined,
      sourceUrl: location.href,
      sourceBvid: props.videoInfo.bvid,
      sourceCid: props.videoInfo.cid,
      sourceTitle: props.videoInfo.title,
      sourceCover: props.videoInfo.cover,
      cover: props.videoInfo.cover,
      duration: selectedDuration.value,
      startTime: startTime.value,
      endTime: endTime.value,
    });

    loadingProgress.value = 100;
    saveSuccess.value = true;
    trackName.value = '';

    setTimeout(() => {
      saveSuccess.value = false;
    }, 2000);

  } catch (error: any) {
    console.error('保存失败:', error);
    errorMessage.value = error.message || '保存失败';
  } finally {
    isLoading.value = false;
    loadingMessage.value = '';
  }
}
</script>

<template>
  <!-- 触发按钮 -->
  <div class="bmc-trigger" @click="togglePanel" :class="{ active: isPanelOpen }">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
    <span>截取音乐</span>
  </div>

  <!-- 面板 -->
  <div v-if="isPanelOpen" class="bmc-panel">
    <div class="bmc-header">
      <h3>截取音乐片段</h3>
      <button class="bmc-close" @click="isPanelOpen = false">&times;</button>
    </div>

    <div class="bmc-content">
      <!-- 视频信息 -->
      <div v-if="videoInfo" class="bmc-video-info">
        <img :src="videoInfo.cover" alt="封面" class="bmc-cover" />
        <div class="bmc-video-meta">
          <div class="bmc-title">{{ videoInfo.title }}</div>
          <div class="bmc-uploader">{{ videoInfo.owner.name }}</div>
        </div>
      </div>

      <!-- 时间选择 -->
      <div class="bmc-time-section">
        <label>时间范围</label>
        <div class="bmc-time-controls">
          <div class="bmc-time-input">
            <span>开始:</span>
            <input type="text" :value="formattedStartTime" readonly />
            <button @click="setStartTime" title="设置为当前播放时间">设置</button>
          </div>
          <div class="bmc-time-input">
            <span>结束:</span>
            <input type="text" :value="formattedEndTime" readonly />
            <button @click="setEndTime" title="设置为当前播放时间">设置</button>
          </div>
        </div>
        <div class="bmc-duration">
          截取时长: <strong>{{ formattedDuration }}</strong>
        </div>
        <button class="bmc-preview" @click="previewSelection">预览选区</button>
      </div>

      <!-- 音轨信息 -->
      <div class="bmc-track-section">
        <label>音轨信息</label>
        <input
          v-model="trackName"
          type="text"
          placeholder="输入音轨名称"
          class="bmc-input"
        />
        <select v-model="selectedAlbumId" class="bmc-select">
          <option value="">不添加到专辑</option>
          <option v-for="album in albums" :key="album.id" :value="album.id">
            {{ album.name }}
          </option>
        </select>
      </div>

      <!-- 错误消息 -->
      <div v-if="errorMessage" class="bmc-error">
        {{ errorMessage }}
      </div>

      <!-- 成功消息 -->
      <div v-if="saveSuccess" class="bmc-success">
        保存成功!
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="bmc-loading">
        <div class="bmc-progress-bar">
          <div class="bmc-progress" :style="{ width: loadingProgress + '%' }"></div>
        </div>
        <span>{{ loadingMessage }} ({{ Math.round(loadingProgress) }}%)</span>
      </div>

      <!-- 保存按钮 -->
      <button
        class="bmc-save"
        @click="saveTrack"
        :disabled="isLoading || !trackName.trim()"
      >
        保存音轨
      </button>
    </div>
  </div>
</template>

<style scoped>
.bmc-trigger {
  position: fixed;
  right: 20px;
  bottom: 80px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #00a1d6 0%, #00b5e2 100%);
  color: white;
  border-radius: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 161, 214, 0.4);
  transition: all 0.3s ease;
  font-size: 14px;
  font-weight: 500;
}

.bmc-trigger:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 161, 214, 0.5);
}

.bmc-trigger.active {
  background: linear-gradient(135deg, #ff6699 0%, #ff99aa 100%);
  box-shadow: 0 4px 12px rgba(255, 102, 153, 0.4);
}

.bmc-panel {
  position: fixed;
  right: 20px;
  bottom: 140px;
  z-index: 10000;
  width: 320px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bmc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #00a1d6 0%, #00b5e2 100%);
  color: white;
}

.bmc-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.bmc-close {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.8;
}

.bmc-close:hover {
  opacity: 1;
}

.bmc-content {
  padding: 16px;
}

.bmc-video-info {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.bmc-cover {
  width: 80px;
  height: 50px;
  object-fit: cover;
  border-radius: 6px;
}

.bmc-video-meta {
  flex: 1;
  min-width: 0;
}

.bmc-title {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bmc-uploader {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.bmc-time-section,
.bmc-track-section {
  margin-bottom: 16px;
}

.bmc-time-section label,
.bmc-track-section label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 8px;
}

.bmc-time-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bmc-time-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bmc-time-input span {
  font-size: 12px;
  color: #666;
  width: 36px;
}

.bmc-time-input input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}

.bmc-time-input button {
  padding: 6px 10px;
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.bmc-time-input button:hover {
  background: #e8e8e8;
}

.bmc-duration {
  text-align: center;
  font-size: 12px;
  color: #666;
  margin-top: 8px;
}

.bmc-duration strong {
  color: #00a1d6;
}

.bmc-preview {
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.bmc-preview:hover {
  background: #e8e8e8;
}

.bmc-input,
.bmc-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.bmc-input:focus,
.bmc-select:focus {
  outline: none;
  border-color: #00a1d6;
}

.bmc-error {
  padding: 10px;
  background: #fff2f2;
  border: 1px solid #ffccc7;
  border-radius: 6px;
  color: #ff4d4f;
  font-size: 12px;
  margin-bottom: 12px;
}

.bmc-success {
  padding: 10px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  color: #52c41a;
  font-size: 12px;
  text-align: center;
  margin-bottom: 12px;
}

.bmc-loading {
  margin-bottom: 12px;
}

.bmc-progress-bar {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.bmc-progress {
  height: 100%;
  background: linear-gradient(90deg, #00a1d6, #00b5e2);
  transition: width 0.3s ease;
}

.bmc-loading span {
  font-size: 12px;
  color: #666;
}

.bmc-save {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #00a1d6 0%, #00b5e2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.bmc-save:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 161, 214, 0.4);
}

.bmc-save:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
