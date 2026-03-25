<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import {
  NTabs,
  NTabPane,
  NButton,
  NEmpty,
  NSpin,
  NModal,
  NInput,
  NIcon,
  useMessage,
} from 'naive-ui';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOutlined,
  SoundOutlined,
} from '@vicons/antd';
import { useMusicStore } from '@/stores/index';
import { formatTime } from '@/lib/bilibili';
import { downloadAudio } from '@/lib/audio-cutter';
import type { Album, Track } from '@/lib/db';

const store = useMusicStore();
const message = useMessage();

// 状态
const activeTab = ref('tracks');
const showCreateAlbum = ref(false);
const showEditTrack = ref(false);
const showEditAlbum = ref(false);
const editingTrack = ref<Track | null>(null);
const editingAlbum = ref<Album | null>(null);
const newAlbumName = ref('');
const newAlbumDesc = ref('');
const editTrackName = ref('');
const editAlbumName = ref('');
const editAlbumDesc = ref('');
const isPlaying = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);

// 计算属性
const hasTracks = computed(() => store.tracks.length > 0);
const hasAlbums = computed(() => store.albums.length > 0);

// 生命周期
onMounted(async () => {
  await store.init();
});

// 方法
function handleCreateAlbum() {
  if (!newAlbumName.value.trim()) {
    message.warning('请输入专辑名称');
    return;
  }
  store.createAlbum(newAlbumName.value.trim(), newAlbumDesc.value.trim());
  newAlbumName.value = '';
  newAlbumDesc.value = '';
  showCreateAlbum.value = false;
  message.success('专辑创建成功');
}

function handleEditAlbum() {
  if (!editingAlbum.value || !editAlbumName.value.trim()) {
    return;
  }
  store.updateAlbum(editingAlbum.value.id, {
    name: editAlbumName.value.trim(),
    description: editAlbumDesc.value.trim(),
  });
  showEditAlbum.value = false;
  editingAlbum.value = null;
  message.success('专辑已更新');
}

function handleDeleteAlbum(album: Album) {
  if (confirm(`确定删除专辑「${album.name}」吗？专辑内的音轨也会被删除。`)) {
    store.deleteAlbum(album.id);
    message.success('专辑已删除');
  }
}

function openEditTrack(track: Track) {
  editingTrack.value = track;
  editTrackName.value = track.name;
  showEditTrack.value = true;
}

function handleEditTrack() {
  if (!editingTrack.value || !editTrackName.value.trim()) {
    return;
  }
  store.updateTrack(editingTrack.value.id, {
    name: editTrackName.value.trim(),
  });
  showEditTrack.value = false;
  editingTrack.value = null;
  message.success('音轨已更新');
}

function handleDeleteTrack(track: Track) {
  if (confirm(`确定删除音轨「${track.name}」吗？`)) {
    store.deleteTrack(track.id);
    message.success('音轨已删除');
  }
}

async function handlePlayTrack(track: Track) {
  if (store.currentTrack?.id === track.id && isPlaying.value) {
    // 暂停
    audioRef.value?.pause();
    isPlaying.value = false;
  } else {
    // 播放
    await store.playTrack(track);
    isPlaying.value = true;
  }
}

async function handleDownloadTrack(track: Track) {
  const audioBlob = await store.getTrackAudio(track.id);
  if (audioBlob) {
    downloadAudio(audioBlob, `${track.name}.mp3`);
    message.success('下载已开始');
  }
}

function onAudioEnded() {
  isPlaying.value = false;
}
</script>

<template>
  <div class="popup-container">
    <!-- 头部 -->
    <header class="popup-header">
      <div class="header-logo">
        <SoundOutlined style="font-size: 20px; color: #00a1d6;" />
        <span>B站音乐截取</span>
      </div>
      <n-button
        v-if="activeTab === 'albums'"
        type="primary"
        size="small"
        @click="showCreateAlbum = true"
      >
        <template #icon>
          <FolderAddOutlined />
        </template>
        新建专辑
      </n-button>
    </header>

    <!-- 主内容 -->
    <main class="popup-main">
      <n-spin :show="store.isLoading">
        <n-tabs v-model:value="activeTab" type="line" justify-content="space-around">
          <!-- 音轨列表 -->
          <n-tab-pane name="tracks" tab="我的音轨">
            <div class="track-list">
              <n-empty v-if="!hasTracks" description="还没有音轨，去B站截取吧！">
                <template #extra>
                  <n-button
                    size="small"
                    tag="a"
                    href="https://www.bilibili.com"
                    target="_blank"
                  >
                    打开B站
                  </n-button>
                </template>
              </n-empty>
              <div
                v-for="track in store.tracks"
                :key="track.id"
                class="track-item"
                :class="{ active: store.currentTrack?.id === track.id }"
              >
                <div class="track-cover" @click="handlePlayTrack(track)">
                  <img v-if="track.cover || track.sourceCover" :src="track.cover || track.sourceCover" alt="" />
                  <div v-else class="track-cover-placeholder">
                    <SoundOutlined />
                  </div>
                  <div class="track-play-overlay">
                    <n-icon size="32">
                      <PauseCircleOutlined v-if="store.currentTrack?.id === track.id && isPlaying" />
                      <PlayCircleOutlined v-else />
                    </n-icon>
                  </div>
                </div>
                <div class="track-info">
                  <div class="track-name">{{ track.name }}</div>
                  <div class="track-meta">
                    <span>{{ formatTime(track.duration) }}</span>
                    <span v-if="track.albumId" class="track-album-badge">
                      {{ store.albums.find(a => a.id === track.albumId)?.name }}
                    </span>
                  </div>
                  <div class="track-source">
                    来源: {{ track.sourceTitle }}
                  </div>
                </div>
                <div class="track-actions">
                  <n-button quaternary circle size="small" @click="openEditTrack(track)">
                    <template #icon>
                      <EditOutlined />
                    </template>
                  </n-button>
                  <n-button quaternary circle size="small" @click="handleDeleteTrack(track)">
                    <template #icon>
                      <DeleteOutlined />
                    </template>
                  </n-button>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <!-- 专辑列表 -->
          <n-tab-pane name="albums" tab="我的专辑">
            <div class="album-list">
              <n-empty v-if="!hasAlbums" description="还没有专辑，创建一个吧！" />
              <div
                v-for="album in store.albums"
                :key="album.id"
                class="album-item"
              >
                <div class="album-cover">
                  <img v-if="album.cover" :src="album.cover" alt="" />
                  <div v-else class="album-cover-placeholder">
                    <FolderOutlined />
                  </div>
                </div>
                <div class="album-info">
                  <div class="album-name">{{ album.name }}</div>
                  <div class="album-meta">
                    {{ store.getAlbumTracks(album.id).length }} 首音轨
                  </div>
                  <div v-if="album.description" class="album-desc">
                    {{ album.description }}
                  </div>
                </div>
                <div class="album-actions">
                  <n-button quaternary circle size="small" @click="editingAlbum = album; editAlbumName = album.name; editAlbumDesc = album.description || ''; showEditAlbum = true">
                    <template #icon>
                      <EditOutlined />
                    </template>
                  </n-button>
                  <n-button quaternary circle size="small" @click="handleDeleteAlbum(album)">
                    <template #icon>
                      <DeleteOutlined />
                    </template>
                  </n-button>
                </div>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </n-spin>
    </main>

    <!-- 底部播放器 -->
    <footer v-if="store.audioUrl" class="popup-player">
      <audio
        ref="audioRef"
        :src="store.audioUrl"
        @ended="onAudioEnded"
        autoplay
      />
      <div class="player-info">
        <span class="player-track-name">{{ store.currentTrack?.name }}</span>
        <n-button
          quaternary
          circle
          size="small"
          @click="isPlaying ? audioRef?.pause() : audioRef?.play(); isPlaying = !isPlaying"
        >
          <template #icon>
            <n-icon>
              <PauseCircleOutlined v-if="isPlaying" />
              <PlayCircleOutlined v-else />
            </n-icon>
          </template>
        </n-button>
      </div>
    </footer>

    <!-- 创建专辑弹窗 -->
    <n-modal
      v-model:show="showCreateAlbum"
      preset="dialog"
      title="创建专辑"
      positive-text="创建"
      negative-text="取消"
      @positive-click="handleCreateAlbum"
    >
      <n-input
        v-model:value="newAlbumName"
        placeholder="专辑名称"
        style="margin-bottom: 12px;"
      />
      <n-input
        v-model:value="newAlbumDesc"
        placeholder="专辑描述（可选）"
        type="textarea"
        :rows="3"
      />
    </n-modal>

    <!-- 编辑音轨弹窗 -->
    <n-modal
      v-model:show="showEditTrack"
      preset="dialog"
      title="编辑音轨"
      positive-text="保存"
      negative-text="取消"
      @positive-click="handleEditTrack"
    >
      <n-input v-model:value="editTrackName" placeholder="音轨名称" />
    </n-modal>

    <!-- 编辑专辑弹窗 -->
    <n-modal
      v-model:show="showEditAlbum"
      preset="dialog"
      title="编辑专辑"
      positive-text="保存"
      negative-text="取消"
      @positive-click="handleEditAlbum"
    >
      <n-input
        v-model:value="editAlbumName"
        placeholder="专辑名称"
        style="margin-bottom: 12px;"
      />
      <n-input
        v-model:value="editAlbumDesc"
        placeholder="专辑描述（可选）"
        type="textarea"
        :rows="3"
      />
    </n-modal>
  </div>
</template>

<style scoped>
.popup-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.popup-main {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px;
}

/* 音轨列表 */
.track-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  transition: all 0.2s;
}

.track-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.track-item.active {
  border: 1px solid #00a1d6;
}

.track-cover {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
}

.track-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.track-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #00a1d6, #00b5e2);
  color: #fff;
  font-size: 20px;
}

.track-play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}

.track-cover:hover .track-play-overlay {
  opacity: 1;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.track-album-badge {
  padding: 1px 6px;
  background: #e6f7ff;
  color: #00a1d6;
  border-radius: 4px;
}

.track-source {
  font-size: 11px;
  color: #bbb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.track-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.track-item:hover .track-actions {
  opacity: 1;
}

/* 专辑列表 */
.album-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
}

.album-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  transition: all 0.2s;
}

.album-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.album-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ff6699, #ff99aa);
  color: #fff;
  font-size: 24px;
}

.album-info {
  flex: 1;
  min-width: 0;
}

.album-name {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.album-meta {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.album-desc {
  font-size: 12px;
  color: #bbb;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.album-item:hover .album-actions {
  opacity: 1;
}

/* 底部播放器 */
.popup-player {
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #eee;
}

.player-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-track-name {
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}
</style>
