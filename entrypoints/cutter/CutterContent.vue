<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, h, inject, type Ref } from 'vue';
import {
  NButton,
  NEmpty,
  NSpin,
  NModal,
  NInput,
  NIcon,
  NInputGroup,
  NSlider,
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
  BulbOutlined,
} from '@vicons/antd';
import { useMusicStore } from '@/stores/index';
import { formatTime, getVideoInfo, fetchPlayUrl } from '@/lib/bilibili';
import type { Playlist, Track } from '@/lib/storage';
import type { BilibiliVideoInfo } from '@/lib/bilibili';

const store = useMusicStore();
const message = useMessage();
const toggleTheme = inject<() => void>('toggleTheme')!;
const isDark = inject<Ref<boolean>>('isDark')!;

// ========== 搜索相关 ==========
const searchLoading = ref(false);
const searchResult = ref<BilibiliVideoInfo | null>(null);
const searchError = ref('');
const rightBvidInput = ref('');
const songFilter = ref('');

// ========== 截取时间 ==========
const downloadStartTime = ref(0);
const downloadEndTime = ref(30);

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

// ========== 预听 ==========
const previewAudio = ref<HTMLAudioElement | null>(null);
const previewLoading = ref(false);
const previewPlaying = ref(false);
const editingPlaylist = ref<Playlist | null>(null);
const newPlaylistName = ref('');
const editPlaylistName = ref('');

// ========== 编辑音轨 ==========
const showEditTrackModal = ref(false);
const editingTrack = ref<FlatTrack | null>(null);
const editTrackName = ref('');
const editTrackStartTime = ref(0);
const editTrackEndTime = ref(30);

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
  const source = currentPlaylist.value ? playlistTracks.value : allTracksFlat.value;
  const keyword = songFilter.value.trim().toLowerCase();
  if (!keyword) return source;
  return source.filter(
    (t) =>
      t.name.toLowerCase().includes(keyword) ||
      t.sourceTitle?.toLowerCase().includes(keyword)
  );
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
    key: 'ownerName',
    width: 150,
    ellipsis: { tooltip: true },
    render(row) {
      return row.ownerName || '-';
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
    width: 160,
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
        h(NTooltip, {}, {
          trigger: () => h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              circle: true,
              onClick: (e: Event) => { e.stopPropagation(); openEditTrack(row); },
            },
            () => h(NIcon, { size: 16 }, () => h(EditOutlined))
          ),
          default: () => '编辑',
        }),
        h(NPopconfirm, { onPositiveClick: () => handleDeleteTrack(row, row.playlistId ?? activePlaylistId.value!) }, {
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
// 显示的时长是截取片段的时长
const segmentDuration = computed(() => {
  if (!store.currentTrack) return 0;
  return store.currentTrack.endTime - store.currentTrack.startTime;
});

// 当前播放位置相对于 segment 起始点的偏移
const segmentProgress = computed(() => {
  if (!store.currentTrack) return currentTime.value;
  return Math.max(0, currentTime.value - store.currentTrack.startTime);
});

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

// ========== 预听截取片段 ==========
function stopPreview() {
  if (previewAudio.value) {
    previewAudio.value.pause();
    previewAudio.value.src = '';
    previewAudio.value = null;
  }
  previewPlaying.value = false;
  previewLoading.value = false;
}

async function previewSegment() {
  if (previewPlaying.value || previewLoading.value) {
    stopPreview();
    return;
  }
  if (!searchResult.value) return;
  if (downloadEndTime.value <= downloadStartTime.value) {
    message.warning('结束时间需大于起始时间');
    return;
  }

  previewLoading.value = true;
  try {
    const bvid = searchResult.value.bvid;
    let cid = searchResult.value.cid;
    if (!cid) {
      const info = await getVideoInfo(bvid);
      if (info) cid = info.cid;
    }
    if (!cid) {
      message.error('无法获取视频信息');
      return;
    }

    const streamUrl = await fetchPlayUrl(bvid, cid);
    if (!streamUrl) {
      message.error('无法获取音频流');
      return;
    }

    const audio = new Audio(streamUrl);
    const startTime = downloadStartTime.value;
    const endTime = downloadEndTime.value;

    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = startTime;
      audio.play();
      previewPlaying.value = true;
      previewLoading.value = false;
    });

    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        previewPlaying.value = false;
      }
    });

    audio.addEventListener('ended', () => {
      previewPlaying.value = false;
    });

    audio.addEventListener('error', () => {
      message.error('音频加载失败');
      stopPreview();
    });

    previewAudio.value = audio;
  } catch (err: any) {
    message.error(err.message || '预听失败');
    previewLoading.value = false;
  }
}

// 弹窗关闭时自动停止预听
watch(showCutModal, (val) => {
  if (!val) stopPreview();
});

onBeforeUnmount(() => {
  stopPreview();
});

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

function searchFromRight() {
  if (rightBvidInput.value.trim()) {
    doSearch(rightBvidInput.value);
    rightBvidInput.value = '';
  }
}

// ========== 添加到歌单（仅保存元数据，不截取文件） ==========
async function addTrackToPlaylist() {
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

  try {
    const bvid = searchResult.value.bvid;
    const cid = searchResult.value.cid;
    const duration = downloadEndTime.value - downloadStartTime.value;
    const trackName = `${searchResult.value.title} (${formatTime(downloadStartTime.value)}-${formatTime(downloadEndTime.value)})`;

    await store.addTrack(playlistId, {
      name: trackName, bvid, cid,
      sourceTitle: searchResult.value.title,
      sourceCover: searchResult.value.cover,
      cover: searchResult.value.cover,
      ownerName: searchResult.value.owner.name,
      duration,
      startTime: downloadStartTime.value,
      endTime: downloadEndTime.value,
    });

    message.success('已添加到歌单');
    searchResult.value = null;
    rightBvidInput.value = '';
    showCutModal.value = false;
    activePlaylistId.value = playlistId;
    selectedPlaylistId.value = playlistId;
  } catch (err: any) {
    message.error(err.message || '添加失败');
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

// ========== 编辑音轨 ==========
function openEditTrack(track: FlatTrack) {
  editingTrack.value = track;
  editTrackName.value = track.name;
  editTrackStartTime.value = track.startTime;
  editTrackEndTime.value = track.endTime;
  showEditTrackModal.value = true;
}

function handleSaveEditTrack() {
  if (!editingTrack.value) return;
  if (!editTrackName.value.trim()) {
    message.warning('请输入歌曲名');
    return;
  }
  if (editTrackEndTime.value <= editTrackStartTime.value) {
    message.warning('结束时间需大于起始时间');
    return;
  }
  const playlistId = editingTrack.value.playlistId ?? activePlaylistId.value!;
  store.updateTrack(playlistId, editingTrack.value.id, {
    name: editTrackName.value.trim(),
    startTime: editTrackStartTime.value,
    endTime: editTrackEndTime.value,
    duration: editTrackEndTime.value - editTrackStartTime.value,
  });
  showEditTrackModal.value = false;
  message.success('已保存修改');
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
  <div class="app-layout" :class="{ 'is-light': !isDark }">
    <!-- ===== 左侧：歌单内容区域 (70%) ===== -->
    <div class="left-panel">
      <div class="content-area">
        <!-- 表头上方：歌单名称(左) + 搜索栏(右) -->
        <div class="content-header">
          <div class="content-title-group">
            <span class="content-title">
              {{ currentPlaylist ? currentPlaylist.title : '全部歌曲' }}
            </span>
            <span class="content-count">{{ displayTracks.length }} 首</span>
          </div>
          <div class="content-search">
            <n-input
              v-model:value="songFilter"
              placeholder="搜索歌曲..."
              size="small"
              clearable
              style="width: 200px;"
            >
              <template #prefix>
                <n-icon size="14"><SearchOutlined /></n-icon>
              </template>
            </n-input>
          </div>
        </div>

        <!-- 歌曲表格 -->
        <div class="table-area">
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
            :description="songFilter ? '没有匹配的歌曲' : '暂无歌曲，从右侧搜索BV号添加'"
            style="margin-top: 80px"
          />
        </div>
      </div>
    </div>

    <!-- ===== 右侧：歌单列表区域 (30%) ===== -->
    <div class="right-panel">
      <!-- 搜索框 (最上方) -->
      <div class="right-search">
        <n-input-group>
          <n-input
            v-model:value="rightBvidInput"
            placeholder="输入BV号..."
            size="small"
            @keydown.enter="searchFromRight"
          >
            <template #prefix>
              <n-icon size="14"><SearchOutlined /></n-icon>
            </template>
          </n-input>
          <n-button size="small" type="primary" :loading="searchLoading" :disabled="!rightBvidInput.trim()" @click="searchFromRight">
            搜索
          </n-button>
        </n-input-group>
        <div v-if="searchError" class="search-error">{{ searchError }}</div>
      </div>

      <!-- 设置栏 -->
      <div class="right-toolbar">
        <n-button size="small" quaternary @click="showCreatePlaylist = true">
          <template #icon><n-icon><PlusOutlined /></n-icon></template>
          新建歌单
        </n-button>
        <n-button size="small" quaternary @click="toggleTheme">
          <template #icon><n-icon><BulbOutlined /></n-icon></template>
          {{ isDark ? '亮色' : '暗色' }}
        </n-button>
      </div>

      <n-divider style="margin: 0 12px 4px;" />

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

      <!-- 歌单列表 -->
      <div class="playlist-scroll">
        <n-empty v-if="store.playlists.length === 0" description="暂无歌单" size="small" style="margin-top: 20px;" />
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
          <span class="time-label">{{ formatTime(Math.floor(segmentProgress)) }}</span>
          <n-slider
            :value="segmentProgress"
            :max="segmentDuration || 100"
            :step="0.1"
            :format-tooltip="(v: number) => formatTime(Math.floor(v))"
            @update:value="(v: number) => seekTo((store.currentTrack?.startTime ?? 0) + v)"
            style="flex: 1"
          />
          <span class="time-label">{{ formatTime(Math.floor(segmentDuration)) }}</span>
        </div>
      </div>

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

        <div style="text-align: center; margin-bottom: 16px;">
          <n-button
            size="small"
            :type="previewPlaying ? 'warning' : 'default'"
            :loading="previewLoading"
            @click="previewSegment"
          >
            <template #icon>
              <n-icon size="16">
                <PauseCircleOutlined v-if="previewPlaying" />
                <PlayCircleOutlined v-else />
              </n-icon>
            </template>
            {{ previewPlaying ? '停止预听' : '预听片段' }}
          </n-button>
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

        <n-button
          type="primary"
          block
          size="large"
          :disabled="downloadEndTime <= downloadStartTime || !selectedPlaylistId"
          @click="addTrackToPlaylist"
        >
          添加到歌单
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

    <!-- ===== 弹窗：编辑音轨 ===== -->
    <n-modal v-model:show="showEditTrackModal" preset="card" title="编辑音轨" style="max-width: 440px;" :mask-closable="false">
      <template v-if="editingTrack">
        <div style="margin-bottom: 12px;">
          <div style="font-size: 13px; margin-bottom: 6px; color: var(--text-secondary);">歌曲名</div>
          <n-input v-model:value="editTrackName" placeholder="歌曲名称" />
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 13px; margin-bottom: 6px; color: var(--text-secondary);">
            起始时间: {{ formatTime(editTrackStartTime) }}
          </div>
          <n-slider
            v-model:value="editTrackStartTime"
            :min="0"
            :max="editTrackEndTime - 1"
            :step="1"
            :format-tooltip="(v: number) => formatTime(v)"
          />
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 13px; margin-bottom: 6px; color: var(--text-secondary);">
            结束时间: {{ formatTime(editTrackEndTime) }}
          </div>
          <n-slider
            v-model:value="editTrackEndTime"
            :min="editTrackStartTime + 1"
            :max="editTrackStartTime + 600"
            :step="1"
            :format-tooltip="(v: number) => formatTime(v)"
          />
        </div>
        <div style="text-align: center; font-size: 13px; color: #999; margin-bottom: 12px;">
          截取: <span style="color: #63e2b7;">{{ formatTime(editTrackStartTime) }}</span>
          →
          <span style="color: #63e2b7;">{{ formatTime(editTrackEndTime) }}</span>
          （共 <span style="color: #63e2b7;">{{ formatTime(Math.max(0, editTrackEndTime - editTrackStartTime)) }}</span>）
        </div>
        <n-button type="primary" block size="large" @click="handleSaveEditTrack">
          保存修改
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
/* ========== Layout ========== */
.app-layout {
  --bg-base: #101014;
  --bg-content: #18181e;
  --bg-sidebar: #141418;
  --bg-player: #18181c;
  --border: #2a2a32;
  --border-player: #2c2c34;
  --text-primary: #e0e0e6;
  --text-secondary: #888;
  --text-muted: #666;
  --scrollbar-thumb: #333;
  --hover-bg: rgba(255, 255, 255, 0.04);
  --active-bg: rgba(99, 226, 183, 0.08);
}

.app-layout.is-light {
  --bg-base: #f0f0f5;
  --bg-content: #ffffff;
  --bg-sidebar: #eaeaf0;
  --bg-player: #f5f5fa;
  --border: #e0e0e6;
  --border-player: #d8d8de;
  --text-primary: #1a1a2e;
  --text-secondary: #666;
  --text-muted: #999;
  --scrollbar-thumb: #c0c0c6;
  --hover-bg: rgba(0, 0, 0, 0.04);
  --active-bg: rgba(99, 226, 183, 0.12);
}

.app-layout {
  display: grid;
  height: 100vh;
  grid-template-columns: 7fr 3fr;
  grid-template-rows: 1fr 72px;
  grid-template-areas:
    "left right"
    "player player";
  gap: 0;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

/* ========== Left Panel (70%) ========== */
.left-panel {
  grid-area: left;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 20px;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-content);
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px 20px;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.content-title-group {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.content-title {
  font-size: 18px;
  font-weight: 700;
}

.content-count {
  font-size: 12px;
  color: var(--text-muted);
}

.content-search {
  flex-shrink: 0;
}

.table-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ========== Right Panel (30%) ========== */
.right-panel {
  grid-area: right;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-sidebar);
  padding: 16px 14px;
}

/* 搜索框 */
.right-search {
  flex-shrink: 0;
  margin-bottom: 10px;
}

.search-error {
  margin-top: 6px;
  color: #e88080;
  font-size: 12px;
}

/* 设置栏 */
.right-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 4px;
}

/* 歌单列表 */
.playlist-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
}

.playlist-scroll::-webkit-scrollbar {
  width: 4px;
}

.playlist-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
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
  background: var(--hover-bg);
}

.playlist-item.active {
  background: var(--active-bg);
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
  color: var(--text-muted);
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

/* ========== Player Bar ========== */
.player-bar {
  grid-area: player;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  background: var(--bg-player);
  border-top: 1px solid var(--border-player);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
