<script lang="ts" setup>
import { ref, computed, onMounted, h } from 'vue';
import {
  NButton,
  NEmpty,
  NSpin,
  NModal,
  NInput,
  NIcon,
  NInputGroup,
  NSlider,
  NProgress,
  NSelect,
  NDataTable,
  NDivider,
  NSpace,
  NTooltip,
  NPopconfirm,
  useMessage,
  type DataTableColumns,
} from 'naive-ui';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  SoundOutlined,
  SearchOutlined,
  DownloadOutlined,
  PlusOutlined,
  ScissorOutlined,
} from '@vicons/antd';
import { useMusicStore } from '@/stores/index';
import { formatTime, getVideoInfo } from '@/lib/bilibili';
import { cutAudioFromStream, downloadAudio } from '@/lib/audio-cutter';
import type { Playlist, Track } from '@/lib/storage';
import type { BilibiliVideoInfo } from '@/lib/bilibili';

const store = useMusicStore();
const message = useMessage();

// ========== 搜索相关 ==========
const bvidInput = ref('');
const searchLoading = ref(false);
const searchResult = ref<BilibiliVideoInfo | null>(null);
const searchError = ref('');
const rightBvidInput = ref('');

// ========== 截取时间 ==========
const downloadStartTime = ref(0);
const downloadEndTime = ref(30);
const downloadLoading = ref(false);
const downloadProgress = ref(0);
const downloadProgressMessage = ref('');

// ========== 保存时选择播放列表 ==========
const selectedPlaylistId = ref<string | null>(null);
const playlistOptions = computed(() => [
  { label: '新建歌单...', value: '__new__' },
  ...store.playlists.map((p) => ({
    label: `${p.title} (${p.tracks.length}首)`,
    value: p.id,
  })),
]);

// ========== 播放器 ==========
const isPlaying = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);
const currentTime = ref(0);
const audioDuration = ref(0);

// ========== 当前选中的歌单 ==========
const activePlaylistId = ref<string | null>(null);

// ========== 弹窗 ==========
const showCreatePlaylist = ref(false);
const showCutModal = ref(false);
const showEditPlaylist = ref(false);
const editingPlaylist = ref<Playlist | null>(null);
const newPlaylistName = ref('');
const editPlaylistName = ref('');

// ========== 当前歌单信息 ==========
const currentPlaylist = computed(() => {
  if (!activePlaylistId.value) return null;
  return store.playlists.find((p) => p.id === activePlaylistId.value) || null;
});

const playlistTracks = computed(() => {
  if (!activePlaylistId.value) return [];
  return store.getPlaylistTracks(activePlaylistId.value);
});

// 所有歌曲
interface FlatTrack extends Track {
  playlistId: string;
  playlistTitle: string;
}

const allTracksFlat = computed<FlatTrack[]>(() => {
  return store.playlists.flatMap((p) =>
    p.tracks.map((t) => ({ ...t, playlistId: p.id, playlistTitle: p.title }))
  );
});

const displayTracks = computed(() => {
  return currentPlaylist.value ? playlistTracks.value : allTracksFlat.value;
});

// ========== 歌曲列表 columns ==========
const songColumns = computed<DataTableColumns<FlatTrack>>(() => [
  {
    title: '#',
    key: 'index',
    width: 50,
    align: 'center',
    render(_, index) {
      const track = displayTracks.value[index];
      if (track && store.currentTrack?.id === track.id && isPlaying.value) {
        return h(NIcon, { size: 14, color: '#63e2b7' }, () => h(SoundOutlined));
      }
      return index + 1;
    },
  },
  {
    title: '歌曲名',
    key: 'name',
    ellipsis: { tooltip: true },
    render(row) {
      return h('span', { style: { fontWeight: 500 } }, row.name);
    },
  },
  {
    title: 'UP主',
    key: 'sourceTitle',
    width: 150,
    ellipsis: { tooltip: true },
    render(row) {
      return row.sourceTitle || '-';
    },
  },
  {
    title: '时长',
    key: 'duration',
    width: 80,
    align: 'center',
    render(row) {
      return formatTime(row.duration);
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    align: 'center',
    render(row) {
      const isCurrentPlaying = store.currentTrack?.id === row.id && isPlaying.value;
      return h(NSpace, { size: 2, justify: 'center' }, () => [
        h(NTooltip, {}, {
          trigger: () => h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              circle: true,
              type: isCurrentPlaying ? 'success' : 'default',
              onClick: (e: Event) => { e.stopPropagation(); handlePlayTrack(row); },
            },
            () => h(NIcon, { size: 16 }, () =>
              isCurrentPlaying ? h(PauseCircleOutlined) : h(PlayCircleOutlined)
            )
          ),
          default: () => isCurrentPlaying ? '暂停' : '播放',
        }),
        h(NTooltip, {}, {
          trigger: () => h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              circle: true,
              onClick: (e: Event) => { e.stopPropagation(); handleDownloadTrack(row); },
            },
            () => h(NIcon, { size: 16 }, () => h(DownloadOutlined))
          ),
          default: () => '下载',
        }),
        h(NPopconfirm, { onPositiveClick: () => handleDeleteTrack(row, row.playlistId) }, {
          trigger: () => h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              circle: true,
              type: 'error',
              onClick: (e: Event) => e.stopPropagation(),
            },
            () => h(NIcon, { size: 16 }, () => h(DeleteOutlined))
          ),
          default: () => `确定删除「${row.name}」？`,
        }),
      ]);
    },
  },
]);

onMounted(async () => {
  await store.init();
  if (store.playlists.length > 0) {
    selectedPlaylistId.value = store.playlists[0].id;
    activePlaylistId.value = store.playlists[0].id;
  }
});

// ========== 播放进度 ==========
function onTimeUpdate() {
  if (audioRef.value) {
    currentTime.value = audioRef.value.currentTime;
    if (store.currentTrack && audioRef.value.currentTime >= store.currentTrack.endTime) {
      audioRef.value.pause();
      isPlaying.value = false;
    }
  }
}

function onLoadedMetadata() {
  if (audioRef.value && store.currentTrack) {
    audioDuration.value = audioRef.value.duration;
    audioRef.value.currentTime = store.currentTrack.startTime;
  }
}

function onAudioEnded() {
  isPlaying.value = false;
  currentTime.value = 0;
}

// ========== BV搜索 ==========
async function doSearch(bvid: string) {
  if (!bvid.trim()) {
    message.warning('请输入BV号');
    return;
  }
  searchLoading.value = true;
  searchError.value = '';
  searchResult.value = null;
  try {
    const info = await getVideoInfo(bvid.trim());
    if (info) {
      searchResult.value = info;
      downloadStartTime.value = 0;
      downloadEndTime.value = Math.min(30, info.duration);
      showCutModal.value = true;
    } else {
      searchError.value = '未找到视频信息，请检查BV号';
    }
  } catch (err: any) {
    searchError.value = err.message || '搜索失败';
  } finally {
    searchLoading.value = false;
  }
}

function searchByBvid() {
  doSearch(bvidInput.value);
}

function searchFromRight() {
  if (rightBvidInput.value.trim()) {
    bvidInput.value = rightBvidInput.value;
    doSearch(rightBvidInput.value);
    rightBvidInput.value = '';
  }
}

// ========== 截取并保存 ==========
async function downloadAndSave() {
  if (!searchResult.value) return;
  const targetPlaylistId = selectedPlaylistId.value;
  if (!targetPlaylistId) {
    message.warning('请选择目标歌单');
    return;
  }

  let playlistId = targetPlaylistId;
  if (targetPlaylistId === '__new__') {
    if (!newPlaylistName.value.trim()) {
      message.warning('请输入新歌单名称');
      return;
    }
    const pl = await store.createPlaylist(newPlaylistName.value.trim(), searchResult.value.cover);
    playlistId = pl.id;
    newPlaylistName.value = '';
  }

  downloadLoading.value = true;
  downloadProgress.value = 0;
  downloadProgressMessage.value = '正在获取音频流...';

  try {
    const bvid = searchResult.value.bvid;
    const cid = searchResult.value.cid;
    downloadProgressMessage.value = '正在下载并截取音频...';

    const mp3Blob = await cutAudioFromStream(
      bvid, cid,
      downloadStartTime.value, downloadEndTime.value,
      (progress) => {
        downloadProgress.value = progress;
        if (progress < 40) downloadProgressMessage.value = '正在下载音频...';
        else if (progress < 60) downloadProgressMessage.value = '正在解码...';
        else downloadProgressMessage.value = '正在编码为MP3...';
      }
    );

    downloadProgressMessage.value = '正在保存...';
    downloadProgress.value = 95;

    const duration = downloadEndTime.value - downloadStartTime.value;
    const trackName = `${searchResult.value.title} (${formatTime(downloadStartTime.value)}-${formatTime(downloadEndTime.value)})`;

    await store.addTrack(playlistId, {
      name: trackName, bvid, cid,
      sourceTitle: searchResult.value.title,
      sourceCover: searchResult.value.cover,
      cover: searchResult.value.cover,
      duration,
      startTime: downloadStartTime.value,
      endTime: downloadEndTime.value,
    });

    message.success('截取成功，已添加到歌单');
    searchResult.value = null;
    bvidInput.value = '';
    showCutModal.value = false;
    activePlaylistId.value = playlistId;
    selectedPlaylistId.value = playlistId;
  } catch (err: any) {
    message.error(err.message || '保存失败');
  } finally {
    downloadLoading.value = false;
    downloadProgressMessage.value = '';
  }
}

// ========== 播放控制 ==========
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
  try {
    await store.downloadTrack(track);
    message.success('下载已开始');
  } catch (err: any) {
    message.error(err.message || '下载失败');
  }
}

function handleDeleteTrack(track: Track, playlistId: string) {
  store.deleteTrack(playlistId, track.id);
  if (store.currentTrack?.id === track.id) {
    isPlaying.value = false;
  }
  message.success('音轨已删除');
}

// ========== 歌单操作 ==========
function handleCreatePlaylist() {
  if (!newPlaylistName.value.trim()) {
    message.warning('请输入歌单名称');
    return;
  }
  store.createPlaylist(newPlaylistName.value.trim());
  newPlaylistName.value = '';
  showCreatePlaylist.value = false;
  message.success('歌单创建成功');
}

function handleEditPlaylist() {
  if (!editingPlaylist.value || !editPlaylistName.value.trim()) return;
  store.updatePlaylist(editingPlaylist.value.id, { title: editPlaylistName.value.trim() });
  showEditPlaylist.value = false;
  editingPlaylist.value = null;
  message.success('歌单已更新');
}

function handleDeletePlaylist(playlist: Playlist) {
  store.deletePlaylist(playlist.id);
  if (activePlaylistId.value === playlist.id) {
    activePlaylistId.value = store.playlists[0]?.id ?? null;
  }
  if (selectedPlaylistId.value === playlist.id) {
    selectedPlaylistId.value = store.playlists[0]?.id ?? null;
  }
  message.success('歌单已删除');
}

function selectPlaylist(playlist: Playlist) {
  activePlaylistId.value = playlist.id;
}
</script>

<template>
  <div class="app-layout">
    <!-- ===== 左侧：内容区域 ===== -->
    <div class="left-panel">
      <!-- 上方：搜索栏 -->
      <div class="search-bar">
        <n-input-group>
          <n-input
            v-model:value="bvidInput"
            placeholder="输入BV号搜索视频..."
            size="large"
            clearable
            @keydown.enter="searchByBvid"
          >
            <template #prefix>
              <n-icon><SearchOutlined /></n-icon>
            </template>
          </n-input>
          <n-button
            type="primary"
            size="large"
            :loading="searchLoading"
            :disabled="!bvidInput.trim()"
            @click="searchByBvid"
          >
            搜索
          </n-button>
        </n-input-group>
        <div v-if="searchError" style="margin-top: 8px; color: #e88080; font-size: 13px;">
          {{ searchError }}
        </div>
      </div>

      <!-- 下方：歌曲列表 -->
      <div class="song-list-area">
        <div class="song-list-header">
          <span class="song-list-title">
            {{ currentPlaylist ? currentPlaylist.title : '全部歌曲' }}
          </span>
          <span class="song-list-count">
            {{ displayTracks.length }} 首
          </span>
        </div>
        <n-data-table
          v-if="displayTracks.length > 0"
          :columns="songColumns"
          :data="displayTracks"
          :bordered="false"
          :single-line="false"
          size="small"
          :row-props="(row: any) => ({
            style: store.currentTrack?.id === row.id ? 'background: rgba(99,226,183,0.08); cursor: pointer;' : 'cursor: pointer;',
            onClick: () => handlePlayTrack(row),
          })"
          style="flex: 1"
        />
        <n-empty
          v-else
          description="暂无歌曲，搜索BV号添加音频"
          style="margin-top: 80px"
        />
      </div>
    </div>

    <!-- ===== 右侧：歌单 + 搜索 ===== -->
    <div class="right-panel">
      <div class="right-panel-header">
        <span style="font-weight: 600; font-size: 15px;">歌单列表</span>
        <n-button size="small" type="primary" quaternary @click="showCreatePlaylist = true">
          <template #icon><n-icon><PlusOutlined /></n-icon></template>
          新建
        </n-button>
      </div>

      <!-- 全部歌曲 -->
      <div
        class="playlist-item"
        :class="{ active: !activePlaylistId }"
        @click="activePlaylistId = null"
      >
        <div class="playlist-item-cover all-icon">
          <n-icon size="16" color="#fff"><SoundOutlined /></n-icon>
        </div>
        <div class="playlist-item-info">
          <div class="playlist-item-name">全部歌曲</div>
          <div class="playlist-item-meta">{{ allTracksFlat.length }} 首</div>
        </div>
      </div>

      <n-divider style="margin: 6px 12px;" />

      <!-- 歌单列表 -->
      <div class="playlist-scroll">
        <n-empty v-if="store.playlists.length === 0" description="暂无歌单" size="small" style="margin-top: 24px;" />
        <div
          v-for="playlist in store.playlists"
          :key="playlist.id"
          class="playlist-item"
          :class="{ active: activePlaylistId === playlist.id }"
          @click="selectPlaylist(playlist)"
        >
          <div class="playlist-item-cover">
            <img v-if="playlist.cover" :src="playlist.cover" alt="" />
            <div v-else class="playlist-item-placeholder">
              <n-icon size="14"><FolderOutlined /></n-icon>
            </div>
          </div>
          <div class="playlist-item-info">
            <div class="playlist-item-name">{{ playlist.title }}</div>
            <div class="playlist-item-meta">{{ playlist.tracks.length }} 首</div>
          </div>
          <div class="playlist-item-actions" @click.stop>
            <n-button quaternary circle size="tiny" @click="editingPlaylist = playlist; editPlaylistName = playlist.title; showEditPlaylist = true">
              <template #icon><n-icon size="12"><EditOutlined /></n-icon></template>
            </n-button>
            <n-popconfirm @positive-click="handleDeletePlaylist(playlist)">
              <template #trigger>
                <n-button quaternary circle size="tiny" type="error">
                  <template #icon><n-icon size="12"><DeleteOutlined /></n-icon></template>
                </n-button>
              </template>
              确定删除歌单「{{ playlist.title }}」？
            </n-popconfirm>
          </div>
        </div>
      </div>

      <!-- 右侧底部：BV搜索添加 -->
      <div class="right-panel-search">
        <n-input
          v-model:value="rightBvidInput"
          placeholder="输入BV号搜索..."
          size="small"
          @keydown.enter="searchFromRight"
        >
          <template #prefix>
            <n-icon size="14"><SearchOutlined /></n-icon>
          </template>
        </n-input>
        <n-button size="small" type="primary" block :loading="searchLoading" :disabled="!rightBvidInput.trim()" @click="searchFromRight">
          搜索并截取
        </n-button>
      </div>
    </div>

    <!-- ===== 底部播放器 ===== -->
    <div class="player-bar">
      <audio
        ref="audioRef"
        :src="store.audioUrl || undefined"
        @ended="onAudioEnded"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        autoplay
      />

      <!-- 左：歌曲信息 -->
      <div class="player-song-info">
        <div class="player-cover">
          <img v-if="store.currentTrack?.cover || store.currentTrack?.sourceCover" :src="store.currentTrack?.cover || store.currentTrack?.sourceCover" alt="" />
          <div v-else class="player-cover-placeholder">
            <n-icon size="16"><SoundOutlined /></n-icon>
          </div>
        </div>
        <div v-if="store.currentTrack" class="player-text">
          <div class="player-track-name">{{ store.currentTrack.name }}</div>
          <div class="player-track-source">{{ store.currentTrack.sourceTitle }}</div>
        </div>
        <n-spin v-else-if="store.isStreamLoading" size="small" />
      </div>

      <!-- 中：播放控制 + 进度条 -->
      <div class="player-controls">
        <div class="control-buttons">
          <n-button quaternary circle :disabled="!store.currentTrack" @click="togglePlay">
            <template #icon>
              <n-icon size="24">
                <PauseCircleOutlined v-if="isPlaying" />
                <PlayCircleOutlined v-else />
              </n-icon>
            </template>
          </n-button>
        </div>
        <div class="progress-row">
          <span class="time-label">{{ formatTime(Math.floor(currentTime)) }}</span>
          <n-slider
            :value="currentTime"
            :max="audioDuration || 100"
            :step="0.1"
            :format-tooltip="(v: number) => formatTime(Math.floor(v))"
            @update:value="seekTo"
            style="flex: 1"
          />
          <span class="time-label">{{ formatTime(Math.floor(audioDuration)) }}</span>
        </div>
      </div>

      <!-- 右：下载按钮 -->
      <div class="player-actions">
        <n-button
          v-if="store.currentTrack"
          quaternary circle
          @click="handleDownloadTrack(store.currentTrack)"
        >
          <template #icon><n-icon size="18"><DownloadOutlined /></n-icon></template>
        </n-button>
      </div>
    </div>

    <!-- ===== 弹窗：截取音频 ===== -->
    <n-modal v-model:show="showCutModal" preset="card" title="截取音频" style="max-width: 520px;" :mask-closable="false">
      <template v-if="searchResult">
        <div class="cut-modal-header">
          <img :src="searchResult.cover" alt="" class="cut-modal-cover" />
          <div class="cut-modal-meta">
            <div style="font-weight: 600; font-size: 15px;">{{ searchResult.title }}</div>
            <div style="color: #999; font-size: 13px; margin-top: 4px;">
              UP主: {{ searchResult.owner.name }}
            </div>
            <div style="color: #63e2b7; font-size: 13px;">
              总时长: {{ formatTime(searchResult.duration) }}
            </div>
          </div>
        </div>

        <n-divider style="margin: 12px 0;" />

        <div style="margin-bottom: 16px;">
          <div style="font-size: 13px; margin-bottom: 8px; color: #ccc;">起始时间: {{ formatTime(downloadStartTime) }}</div>
          <n-slider
            v-model:value="downloadStartTime"
            :min="0"
            :max="searchResult.duration"
            :step="1"
            :format-tooltip="(v: number) => formatTime(v)"
          />
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-size: 13px; margin-bottom: 8px; color: #ccc;">结束时间: {{ formatTime(downloadEndTime) }}</div>
          <n-slider
            v-model:value="downloadEndTime"
            :min="0"
            :max="searchResult.duration"
            :step="1"
            :format-tooltip="(v: number) => formatTime(v)"
          />
        </div>

        <div style="text-align: center; font-size: 13px; color: #999; margin-bottom: 16px;">
          截取: <span style="color: #63e2b7;">{{ formatTime(downloadStartTime) }}</span>
          →
          <span style="color: #63e2b7;">{{ formatTime(downloadEndTime) }}</span>
          （共 <span style="color: #63e2b7;">{{ formatTime(Math.max(0, downloadEndTime - downloadStartTime)) }}</span>）
        </div>

        <n-select
          v-model:value="selectedPlaylistId"
          :options="playlistOptions"
          placeholder="选择目标歌单"
          size="medium"
          style="margin-bottom: 8px;"
        />
        <n-input
          v-if="selectedPlaylistId === '__new__'"
          v-model:value="newPlaylistName"
          placeholder="新歌单名称"
          size="medium"
          style="margin-bottom: 12px;"
        />

        <div v-if="downloadLoading" style="margin-bottom: 12px;">
          <n-progress type="line" :percentage="downloadProgress" status="info" />
          <div style="font-size: 12px; color: #999; margin-top: 4px; text-align: center;">{{ downloadProgressMessage }}</div>
        </div>

        <n-button
          type="primary"
          block
          size="large"
          :loading="downloadLoading"
          :disabled="downloadEndTime <= downloadStartTime || !selectedPlaylistId"
          @click="downloadAndSave"
        >
          <template #icon><n-icon><ScissorOutlined /></n-icon></template>
          截取并保存
        </n-button>
      </template>
    </n-modal>

    <!-- ===== 弹窗：新建歌单 ===== -->
    <n-modal v-model:show="showCreatePlaylist" preset="dialog" title="创建歌单" positive-text="创建" negative-text="取消" @positive-click="handleCreatePlaylist">
      <n-input v-model:value="newPlaylistName" placeholder="歌单名称" />
    </n-modal>

    <!-- ===== 弹窗：编辑歌单 ===== -->
    <n-modal v-model:show="showEditPlaylist" preset="dialog" title="编辑歌单" positive-text="保存" negative-text="取消" @positive-click="handleEditPlaylist">
      <n-input v-model:value="editPlaylistName" placeholder="歌单名称" />
    </n-modal>
  </div>
</template>

<style scoped>
/* ========== Layout ========== */
.app-layout {
  display: grid;
  height: 100vh;
  grid-template-columns: 1fr 280px;
  grid-template-rows: 1fr 72px;
  grid-template-areas:
    "left right"
    "player player";
  background: #101014;
  color: #e0e0e6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

/* ========== Left Panel ========== */
.left-panel {
  grid-area: left;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #2c2c34;
}

.search-bar {
  padding: 16px 20px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid #1e1e24;
}

.song-list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.song-list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 20px 8px;
  flex-shrink: 0;
}

.song-list-title {
  font-size: 16px;
  font-weight: 600;
}

.song-list-count {
  font-size: 12px;
  color: #888;
}

/* ========== Right Panel ========== */
.right-panel {
  grid-area: right;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #141418;
}

.right-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
  flex-shrink: 0;
}

.playlist-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.playlist-scroll::-webkit-scrollbar {
  width: 4px;
}

.playlist-scroll::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.playlist-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.playlist-item.active {
  background: rgba(99, 226, 183, 0.08);
}

.playlist-item-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.playlist-item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-item-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #63e2b7, #6a9eff);
  color: #fff;
  border-radius: 6px;
}

.all-icon {
  background: linear-gradient(135deg, #63e2b7, #6a9eff);
  display: flex;
  align-items: center;
  justify-content: center;
}

.playlist-item-info {
  flex: 1;
  min-width: 0;
}

.playlist-item-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-item-meta {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.playlist-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.playlist-item:hover .playlist-item-actions {
  opacity: 1;
}

/* 右侧底部搜索区 */
.right-panel-search {
  padding: 12px;
  border-top: 1px solid #1e1e24;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* ========== Player Bar ========== */
.player-bar {
  grid-area: player;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  background: #18181c;
  border-top: 1px solid #2c2c34;
}

.player-song-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
}

.player-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
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
  background: linear-gradient(135deg, #63e2b7, #6a9eff);
  color: #fff;
}

.player-text {
  min-width: 0;
}

.player-track-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.player-track-source {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.player-controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 500px;
}

.time-label {
  font-size: 11px;
  color: #666;
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.player-actions {
  min-width: 40px;
  display: flex;
  justify-content: flex-end;
}

/* ========== Cut Modal ========== */
.cut-modal-header {
  display: flex;
  gap: 16px;
}

.cut-modal-cover {
  width: 120px;
  height: 75px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}

.cut-modal-meta {
  flex: 1;
  min-width: 0;
}

.cut-modal-meta div {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
