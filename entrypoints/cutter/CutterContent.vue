<script lang="ts" setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import {
  NTabs,
  NTabPane,
  NButton,
  NEmpty,
  NSpin,
  NModal,
  NInput,
  NIcon,
  NInputGroup,
  NSlider,
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
  SearchOutlined,
  DownloadOutlined,
} from '@vicons/antd';
import { useMusicStore } from '@/stores/index';
import { formatTime, getVideoInfo } from '@/lib/bilibili';
import { downloadAudio } from '@/lib/audio-cutter';
import { trackDb, albumDb } from '@/lib/db';
import type { Album, Track } from '@/lib/db';
import type { BilibiliVideoInfo } from '@/lib/bilibili';

const store = useMusicStore();
const message = useMessage();

// 布局状态
const activeSidebarTab = ref('search');

// 搜索相关
const bvidInput = ref('');
const searchLoading = ref(false);
const searchResult = ref<BilibiliVideoInfo | null>(null);
const searchError = ref('');

// 截取时间
const downloadStartTime = ref(0);
const downloadEndTime = ref(30);
const downloadLoading = ref(false);

// 服务器状态
const serverStatus = ref<'checking' | 'online' | 'offline'>('checking');

// 播放器
const isPlaying = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);
const currentTime = ref(0);
const audioDuration = ref(0);

// 专辑/编辑
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

// 当前显示内容（主区域）
const mainView = ref<'cover' | 'search-detail' | 'album-detail'>('cover');
const selectedAlbumId = ref<string | null>(null);

const albumTracks = computed(() => {
  if (!selectedAlbumId.value) return [];
  return store.tracks.filter(t => t.albumId === selectedAlbumId.value);
});

const selectedAlbum = computed(() => {
  if (!selectedAlbumId.value) return null;
  return store.albums.find(a => a.id === selectedAlbumId.value) || null;
});

const hasTracks = computed(() => store.tracks.length > 0);
const hasAlbums = computed(() => store.albums.length > 0);

onMounted(async () => {
  await store.init();
  checkServer();
});

// 播放进度
function onTimeUpdate() {
  if (audioRef.value) {
    currentTime.value = audioRef.value.currentTime;
  }
}

function onLoadedMetadata() {
  if (audioRef.value) {
    audioDuration.value = audioRef.value.duration;
  }
}

function onAudioEnded() {
  isPlaying.value = false;
  currentTime.value = 0;
}

// 服务器检查
async function checkServer() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'CHECK_SERVER' });
    serverStatus.value = response?.ok ? 'online' : 'offline';
  } catch {
    serverStatus.value = 'offline';
  }
}

// BV搜索
async function searchByBvid() {
  const bvid = bvidInput.value.trim();
  if (!bvid) {
    message.warning('请输入BV号');
    return;
  }

  searchLoading.value = true;
  searchError.value = '';
  searchResult.value = null;

  try {
    const info = await getVideoInfo(bvid);
    if (info) {
      searchResult.value = info;
      downloadStartTime.value = 0;
      downloadEndTime.value = Math.min(30, info.duration);
      mainView.value = 'search-detail';
    } else {
      searchError.value = '未找到视频信息，请检查BV号';
    }
  } catch (err: any) {
    searchError.value = err.message || '搜索失败';
  } finally {
    searchLoading.value = false;
  }
}

// 下载并截取
async function downloadAndSave() {
  if (!searchResult.value) return;

  if (serverStatus.value !== 'online') {
    message.error('本地服务未启动，请先运行: cd server && node index.js');
    return;
  }

  downloadLoading.value = true;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'SERVER_DOWNLOAD_AND_CUT',
      bvid: searchResult.value.bvid,
      startTime: downloadStartTime.value,
      endTime: downloadEndTime.value,
    });

    if (response.error) {
      message.error(`下载失败: ${response.error}`);
      return;
    }

    const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
    const duration = downloadEndTime.value - downloadStartTime.value;
    const trackName = `${searchResult.value.title} (${formatTime(downloadStartTime.value)}-${formatTime(downloadEndTime.value)})`;

    await trackDb.create(
      {
        name: trackName,
        sourceUrl: `https://www.bilibili.com/video/${searchResult.value.bvid}`,
        sourceBvid: searchResult.value.bvid,
        sourceTitle: searchResult.value.title,
        sourceCover: searchResult.value.cover,
        cover: searchResult.value.cover,
        duration,
        startTime: downloadStartTime.value,
        endTime: downloadEndTime.value,
      },
      audioBlob
    );

    await store.loadTracks();
    message.success('音轨保存成功');
    searchResult.value = null;
    bvidInput.value = '';
    mainView.value = 'cover';
    activeSidebarTab.value = 'tracks';
  } catch (err: any) {
    message.error(err.message || '保存失败');
  } finally {
    downloadLoading.value = false;
  }
}

// 播放控制
async function handlePlayTrack(track: Track) {
  if (store.currentTrack?.id === track.id && isPlaying.value) {
    audioRef.value?.pause();
    isPlaying.value = false;
  } else {
    await store.playTrack(track);
    isPlaying.value = true;
  }
}

function togglePlay() {
  if (!audioRef.value) return;
  if (isPlaying.value) {
    audioRef.value.pause();
  } else {
    audioRef.value.play();
  }
  isPlaying.value = !isPlaying.value;
}

function seekTo(time: number) {
  if (audioRef.value) {
    audioRef.value.currentTime = time;
    currentTime.value = time;
  }
}

async function handleDownloadTrack(track: Track) {
  const audioBlob = await store.getTrackAudio(track.id);
  if (audioBlob) {
    downloadAudio(audioBlob, `${track.name}.mp3`);
    message.success('下载已开始');
  }
}

// 音轨/专辑编辑
function openEditTrack(track: Track) {
  editingTrack.value = track;
  editTrackName.value = track.name;
  showEditTrack.value = true;
}

function handleEditTrack() {
  if (!editingTrack.value || !editTrackName.value.trim()) return;
  store.updateTrack(editingTrack.value.id, { name: editTrackName.value.trim() });
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
  if (!editingAlbum.value || !editAlbumName.value.trim()) return;
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
    if (selectedAlbumId.value === album.id) {
      mainView.value = 'cover';
      selectedAlbumId.value = null;
    }
    message.success('专辑已删除');
  }
}

function openAlbumDetail(album: Album) {
  selectedAlbumId.value = album.id;
  mainView.value = 'album-detail';
}
</script>

<template>
  <div class="cutter-layout">
    <!-- 主内容区 -->
    <main class="cutter-main">
      <!-- 默认封面页 -->
      <div v-if="mainView === 'cover'" class="cover-view">
        <div class="cover-hero">
          <div class="cover-icon">
            <n-icon size="64" color="#00a1d6"><SoundOutlined /></n-icon>
          </div>
          <h1 class="cover-title">B站音乐截取</h1>
          <p class="cover-desc">输入BV号搜索视频，截取你喜欢的音乐片段</p>
          <div v-if="serverStatus === 'offline'" class="server-notice">
            本地服务未启动，请运行: <code>cd server && node index.js</code>
          </div>
          <div v-else-if="serverStatus === 'online'" class="server-notice online">
            本地服务已连接
          </div>
        </div>

        <!-- 最近音轨 -->
        <div v-if="hasTracks" class="recent-tracks">
          <h3>最近添加</h3>
          <div class="recent-grid">
            <div
              v-for="track in store.tracks.slice(0, 6)"
              :key="track.id"
              class="recent-card"
              @click="handlePlayTrack(track)"
            >
              <div class="recent-card-cover">
                <img v-if="track.cover || track.sourceCover" :src="track.cover || track.sourceCover" alt="" />
                <div v-else class="recent-card-placeholder">
                  <n-icon size="24"><SoundOutlined /></n-icon>
                </div>
                <div class="recent-card-play">
                  <n-icon size="28" color="#fff">
                    <PlayCircleOutlined v-if="store.currentTrack?.id !== track.id || !isPlaying" />
                    <PauseCircleOutlined v-else />
                  </n-icon>
                </div>
              </div>
              <div class="recent-card-name">{{ track.name }}</div>
              <div class="recent-card-meta">{{ formatTime(track.duration) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索结果详情 -->
      <div v-if="mainView === 'search-detail' && searchResult" class="detail-view">
        <button class="back-btn" @click="mainView = 'cover'; searchResult = null">
          ← 返回
        </button>
        <div class="detail-header">
          <img :src="searchResult.cover" alt="" class="detail-cover" />
          <div class="detail-meta">
            <h2>{{ searchResult.title }}</h2>
            <p class="detail-uploader">{{ searchResult.owner.name }}</p>
            <p class="detail-duration">总时长: {{ formatTime(searchResult.duration) }}</p>
          </div>
        </div>

        <!-- 时间截取 -->
        <div class="cut-controls">
          <h3>截取时间段</h3>
          <div class="time-slider">
            <span>{{ formatTime(downloadStartTime) }}</span>
            <n-slider
              v-model:value="downloadStartTime"
              :min="0"
              :max="searchResult.duration"
              :step="1"
              :format-tooltip="(v: number) => formatTime(v)"
              style="flex: 1"
            />
          </div>
          <div class="time-slider">
            <span>{{ formatTime(downloadEndTime) }}</span>
            <n-slider
              v-model:value="downloadEndTime"
              :min="0"
              :max="searchResult.duration"
              :step="1"
              :format-tooltip="(v: number) => formatTime(v)"
              style="flex: 1"
            />
          </div>
          <div class="cut-summary">
            截取: <strong>{{ formatTime(downloadStartTime) }}</strong> → <strong>{{ formatTime(downloadEndTime) }}</strong>
            (共 <strong>{{ formatTime(Math.max(0, downloadEndTime - downloadStartTime)) }}</strong>)
          </div>
          <n-button
            type="primary"
            size="large"
            block
            :loading="downloadLoading"
            :disabled="downloadEndTime <= downloadStartTime || serverStatus !== 'online'"
            @click="downloadAndSave"
          >
            <template #icon><n-icon><DownloadOutlined /></n-icon></template>
            下载并截取
          </n-button>
        </div>
      </div>

      <!-- 专辑详情 -->
      <div v-if="mainView === 'album-detail' && selectedAlbum" class="detail-view">
        <button class="back-btn" @click="mainView = 'cover'; selectedAlbumId = null">
          ← 返回
        </button>
        <div class="detail-header">
          <div class="detail-cover album-detail-cover">
            <n-icon size="40" color="#fff"><FolderOutlined /></n-icon>
          </div>
          <div class="detail-meta">
            <h2>{{ selectedAlbum.name }}</h2>
            <p class="detail-duration">{{ albumTracks.length }} 首音轨</p>
            <p v-if="selectedAlbum.description" class="detail-uploader">{{ selectedAlbum.description }}</p>
          </div>
        </div>

        <div class="album-track-list">
          <div
            v-for="(track, idx) in albumTracks"
            :key="track.id"
            class="track-row"
            :class="{ active: store.currentTrack?.id === track.id }"
            @click="handlePlayTrack(track)"
          >
            <span class="track-idx">{{ idx + 1 }}</span>
            <div class="track-row-info">
              <div class="track-row-name">{{ track.name }}</div>
              <div class="track-row-meta">{{ formatTime(track.duration) }} · {{ track.sourceTitle }}</div>
            </div>
            <div class="track-row-actions" @click.stop>
              <n-button quaternary circle size="tiny" @click="handleDownloadTrack(track)">
                <template #icon><n-icon><DownloadOutlined /></n-icon></template>
              </n-button>
              <n-button quaternary circle size="tiny" @click="handleDeleteTrack(track)">
                <template #icon><n-icon><DeleteOutlined /></n-icon></template>
              </n-button>
            </div>
          </div>
          <n-empty v-if="albumTracks.length === 0" description="专辑内暂无音轨" style="margin-top: 40px" />
        </div>
      </div>
    </main>

    <!-- 右侧栏 -->
    <aside class="cutter-sidebar">
      <n-tabs v-model:value="activeSidebarTab" type="line" size="small" justify-content="space-around">
        <!-- 搜索 -->
        <n-tab-pane name="search" tab="搜索">
          <div class="sidebar-section">
            <n-input-group>
              <n-input
                v-model:value="bvidInput"
                placeholder="输入BV号"
                size="medium"
                :disabled="serverStatus === 'offline'"
                @keydown.enter="searchByBvid"
              >
                <template #prefix>
                  <n-icon><SearchOutlined /></n-icon>
                </template>
              </n-input>
              <n-button
                type="primary"
                :loading="searchLoading"
                :disabled="!bvidInput.trim()"
                @click="searchByBvid"
              >
                搜索
              </n-button>
            </n-input-group>
            <div v-if="searchError" class="search-error">{{ searchError }}</div>
          </div>
        </n-tab-pane>

        <!-- 音轨 -->
        <n-tab-pane name="tracks" tab="音轨">
          <div class="sidebar-list">
            <n-empty v-if="!hasTracks" description="暂无音轨" size="small" />
            <div
              v-for="track in store.tracks"
              :key="track.id"
              class="sidebar-item"
              :class="{ active: store.currentTrack?.id === track.id }"
              @click="handlePlayTrack(track)"
            >
              <div class="sidebar-item-cover">
                <img v-if="track.cover || track.sourceCover" :src="track.cover || track.sourceCover" alt="" />
                <div v-else class="sidebar-item-placeholder">
                  <n-icon size="16"><SoundOutlined /></n-icon>
                </div>
              </div>
              <div class="sidebar-item-info">
                <div class="sidebar-item-name">{{ track.name }}</div>
                <div class="sidebar-item-meta">{{ formatTime(track.duration) }}</div>
              </div>
              <div class="sidebar-item-actions" @click.stop>
                <n-button quaternary circle size="tiny" @click="handleDownloadTrack(track)">
                  <template #icon><n-icon size="14"><DownloadOutlined /></n-icon></template>
                </n-button>
                <n-button quaternary circle size="tiny" @click="openEditTrack(track)">
                  <template #icon><n-icon size="14"><EditOutlined /></n-icon></template>
                </n-button>
                <n-button quaternary circle size="tiny" @click="handleDeleteTrack(track)">
                  <template #icon><n-icon size="14"><DeleteOutlined /></n-icon></template>
                </n-button>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <!-- 专辑 -->
        <n-tab-pane name="albums" tab="专辑">
          <div class="sidebar-list">
            <div class="sidebar-section-header">
              <span>我的专辑</span>
              <n-button size="tiny" @click="showCreateAlbum = true">
                <template #icon><n-icon><FolderAddOutlined /></n-icon></template>
                新建
              </n-button>
            </div>
            <n-empty v-if="!hasAlbums" description="暂无专辑" size="small" />
            <div
              v-for="album in store.albums"
              :key="album.id"
              class="sidebar-item"
              @click="openAlbumDetail(album)"
            >
              <div class="sidebar-item-cover album-cover-small">
                <img v-if="album.cover" :src="album.cover" alt="" />
                <div v-else class="sidebar-item-placeholder album-placeholder-small">
                  <n-icon size="16"><FolderOutlined /></n-icon>
                </div>
              </div>
              <div class="sidebar-item-info">
                <div class="sidebar-item-name">{{ album.name }}</div>
                <div class="sidebar-item-meta">{{ store.getAlbumTracks(album.id).length }} 首</div>
              </div>
              <div class="sidebar-item-actions" @click.stop>
                <n-button quaternary circle size="tiny" @click="editingAlbum = album; editAlbumName = album.name; editAlbumDesc = album.description || ''; showEditAlbum = true">
                  <template #icon><n-icon size="14"><EditOutlined /></n-icon></template>
                </n-button>
                <n-button quaternary circle size="tiny" @click="handleDeleteAlbum(album)">
                  <template #icon><n-icon size="14"><DeleteOutlined /></n-icon></template>
                </n-button>
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </aside>

    <!-- 底部播放器 -->
    <footer class="cutter-player" v-if="store.audioUrl">
      <audio
        ref="audioRef"
        :src="store.audioUrl"
        @ended="onAudioEnded"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        autoplay
      />
      <div class="player-left">
        <div class="player-cover">
          <img v-if="store.currentTrack?.cover || store.currentTrack?.sourceCover" :src="store.currentTrack?.cover || store.currentTrack?.sourceCover" alt="" />
          <div v-else class="player-cover-placeholder">
            <n-icon size="18"><SoundOutlined /></n-icon>
          </div>
        </div>
        <div class="player-info">
          <div class="player-name">{{ store.currentTrack?.name }}</div>
          <div class="player-source">{{ store.currentTrack?.sourceTitle }}</div>
        </div>
      </div>
      <div class="player-center">
        <div class="player-controls">
          <n-button quaternary circle size="large" @click="togglePlay">
            <template #icon>
              <n-icon size="28">
                <PauseCircleOutlined v-if="isPlaying" />
                <PlayCircleOutlined v-else />
              </n-icon>
            </template>
          </n-button>
        </div>
        <div class="player-progress">
          <span class="progress-time">{{ formatTime(Math.floor(currentTime)) }}</span>
          <n-slider
            :value="currentTime"
            :max="audioDuration || 100"
            :step="0.1"
            :format-tooltip="(v: number) => formatTime(Math.floor(v))"
            @update:value="seekTo"
            style="flex: 1"
          />
          <span class="progress-time">{{ formatTime(Math.floor(audioDuration)) }}</span>
        </div>
      </div>
      <div class="player-right">
        <n-button quaternary circle size="small" @click="store.currentTrack && handleDownloadTrack(store.currentTrack)">
          <template #icon><n-icon><DownloadOutlined /></n-icon></template>
        </n-button>
      </div>
    </footer>

    <!-- 弹窗 -->
    <n-modal v-model:show="showCreateAlbum" preset="dialog" title="创建专辑" positive-text="创建" negative-text="取消" @positive-click="handleCreateAlbum">
      <n-input v-model:value="newAlbumName" placeholder="专辑名称" style="margin-bottom: 12px" />
      <n-input v-model:value="newAlbumDesc" placeholder="专辑描述（可选）" type="textarea" :rows="3" />
    </n-modal>

    <n-modal v-model:show="showEditTrack" preset="dialog" title="编辑音轨" positive-text="保存" negative-text="取消" @positive-click="handleEditTrack">
      <n-input v-model:value="editTrackName" placeholder="音轨名称" />
    </n-modal>

    <n-modal v-model:show="showEditAlbum" preset="dialog" title="编辑专辑" positive-text="保存" negative-text="取消" @positive-click="handleEditAlbum">
      <n-input v-model:value="editAlbumName" placeholder="专辑名称" style="margin-bottom: 12px" />
      <n-input v-model:value="editAlbumDesc" placeholder="专辑描述（可选）" type="textarea" :rows="3" />
    </n-modal>
  </div>
</template>

<style scoped>
.cutter-layout {
  display: grid;
  height: 100vh;
  grid-template-columns: 1fr 380px;
  grid-template-rows: 1fr 72px;
  grid-template-areas:
    "main sidebar"
    "player player";
  background: #f8f9fa;
}

/* 主内容区 */
.cutter-main {
  grid-area: main;
  overflow-y: auto;
  padding: 32px 40px;
}

/* 封面页 */
.cover-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 60px;
}

.cover-hero {
  text-align: center;
  margin-bottom: 48px;
}

.cover-icon {
  width: 120px;
  height: 120px;
  border-radius: 28px;
  background: linear-gradient(135deg, #00a1d6 0%, #00b5e2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}

.cover-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.cover-desc {
  font-size: 15px;
  color: #888;
  margin: 0;
}

.server-notice {
  margin-top: 16px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  background: #fff2f2;
  color: #ff4d4f;
}

.server-notice.online {
  background: #f0fff4;
  color: #52c41a;
}

.server-notice code {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.recent-tracks {
  width: 100%;
  max-width: 700px;
}

.recent-tracks h3 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.recent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.recent-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.recent-card:hover {
  transform: translateY(-2px);
}

.recent-card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 10px;
  overflow: hidden;
  background: #e8e8e8;
}

.recent-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.recent-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #00a1d6, #00b5e2);
  color: #fff;
}

.recent-card-play {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.recent-card:hover .recent-card-play {
  opacity: 1;
}

.recent-card-name {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-card-meta {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

/* 详情页 */
.detail-view {
  max-width: 680px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: #00a1d6;
  cursor: pointer;
  padding: 4px 0;
  margin-bottom: 20px;
  font-family: inherit;
}

.back-btn:hover {
  color: #00b5e2;
}

.detail-header {
  display: flex;
  gap: 24px;
  margin-bottom: 32px;
}

.detail-cover {
  width: 200px;
  height: 125px;
  object-fit: cover;
  border-radius: 12px;
  flex-shrink: 0;
}

.album-detail-cover {
  width: 140px;
  height: 140px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff6699, #ff99aa);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-meta h2 {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px;
  line-height: 1.4;
}

.detail-uploader {
  font-size: 14px;
  color: #888;
  margin: 4px 0;
}

.detail-duration {
  font-size: 14px;
  color: #00a1d6;
  margin: 4px 0;
}

.cut-controls {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.cut-controls h3 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0 0 20px;
}

.time-slider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.time-slider > span {
  font-size: 13px;
  color: #666;
  min-width: 48px;
  text-align: center;
}

.cut-summary {
  text-align: center;
  padding: 12px 0 20px;
  font-size: 14px;
  color: #666;
}

.cut-summary strong {
  color: #00a1d6;
}

/* 专辑音轨列表 */
.album-track-list {
  margin-top: 16px;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.track-row:hover {
  background: rgba(0, 161, 214, 0.06);
}

.track-row.active {
  background: rgba(0, 161, 214, 0.1);
}

.track-idx {
  width: 24px;
  text-align: right;
  font-size: 14px;
  color: #bbb;
  flex-shrink: 0;
}

.track-row-info {
  flex: 1;
  min-width: 0;
}

.track-row-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-row-meta {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.track-row-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.track-row:hover .track-row-actions {
  opacity: 1;
}

/* 右侧栏 */
.cutter-sidebar {
  grid-area: sidebar;
  background: #fff;
  border-left: 1px solid #eee;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cutter-sidebar :deep(.n-tabs) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.cutter-sidebar :deep(.n-tabs .n-tabs-pane-wrapper) {
  flex: 1;
  overflow-y: auto;
}

.sidebar-section {
  padding: 16px;
}

.search-error {
  padding: 8px 12px;
  margin-top: 12px;
  background: #fff2f2;
  border-radius: 6px;
  color: #ff4d4f;
  font-size: 12px;
}

.sidebar-list {
  padding: 8px 12px;
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #666;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.sidebar-item:hover {
  background: #f5f5f5;
}

.sidebar-item.active {
  background: rgba(0, 161, 214, 0.08);
}

.sidebar-item-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sidebar-item-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #00a1d6, #00b5e2);
  color: #fff;
}

.album-placeholder-small {
  background: linear-gradient(135deg, #ff6699, #ff99aa);
}

.album-cover-small {
  border-radius: 8px;
}

.sidebar-item-info {
  flex: 1;
  min-width: 0;
}

.sidebar-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-item-meta {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.sidebar-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.sidebar-item:hover .sidebar-item-actions {
  opacity: 1;
}

/* 底部播放器 */
.cutter-player {
  grid-area: player;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  background: #fff;
  border-top: 1px solid #eee;
}

.player-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 220px;
}

.player-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.player-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #00a1d6, #00b5e2);
  color: #fff;
}

.player-info {
  min-width: 0;
}

.player-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.player-source {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.player-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.player-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 500px;
}

.progress-time {
  font-size: 11px;
  color: #999;
  min-width: 36px;
  text-align: center;
}

.player-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 40px;
  justify-content: flex-end;
}

/* 响应式 */
@media (max-width: 900px) {
  .cutter-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr 72px;
    grid-template-areas:
      "sidebar"
      "main"
      "player";
  }

  .cutter-sidebar {
    border-left: none;
    border-bottom: 1px solid #eee;
    max-height: 200px;
  }

  .cutter-main {
    padding: 20px;
  }

  .recent-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .detail-header {
    flex-direction: column;
  }

  .detail-cover {
    width: 100%;
    height: auto;
    aspect-ratio: 16/10;
  }
}
</style>
