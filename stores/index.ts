import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  getPlaylists as loadPlaylistsFromStorage,
  createPlaylist as createPlaylistInStorage,
  savePlaylist,
  deletePlaylist as deletePlaylistFromStorage,
  addTrackToPlaylist as addTrackToStorage,
  removeTrackFromPlaylist as removeTrackFromStorage,
  updateTrackInPlaylist as updateTrackInStorage,
  generateId,
  type Playlist,
  type Track,
} from '@/lib/storage';
import { fetchPlayUrl, getVideoInfo } from '@/lib/bilibili';
import { cutAudioFromStream, downloadAudio } from '@/lib/audio-cutter';

export const useMusicStore = defineStore('music', () => {
  // 状态
  const playlists = ref<Playlist[]>([]);
  const currentTrack = ref<Track | null>(null);
  const currentPlaylist = ref<Playlist | null>(null);
  const isLoading = ref(false);
  const audioUrl = ref<string | null>(null);
  const isStreamLoading = ref(false);

  // 计算属性：所有 tracks 扁平化
  const allTracks = computed(() => {
    return playlists.value.flatMap((p) =>
      p.tracks.map((t) => ({ ...t, playlistId: p.id, playlistTitle: p.title }))
    );
  });

  const hasPlaylists = computed(() => playlists.value.length > 0);

  // 加载所有 playlists
  async function loadPlaylists() {
    isLoading.value = true;
    try {
      playlists.value = await loadPlaylistsFromStorage();
    } finally {
      isLoading.value = false;
    }
  }

  // 创建播放列表
  async function createPlaylist(title: string, cover?: string) {
    const playlist = await createPlaylistInStorage(title, cover);
    playlists.value.unshift(playlist);
    return playlist;
  }

  // 更新播放列表信息
  async function updatePlaylist(
    id: string,
    data: Partial<Pick<Playlist, 'title' | 'cover'>>
  ) {
    const playlist = playlists.value.find((p) => p.id === id);
    if (!playlist) return;
    Object.assign(playlist, data, { updatedAt: Date.now() });
    await savePlaylist(playlist);
  }

  // 删除播放列表
  async function deletePlaylist(id: string) {
    await deletePlaylistFromStorage(id);
    playlists.value = playlists.value.filter((p) => p.id !== id);
  }

  // 添加音轨到播放列表
  async function addTrack(playlistId: string, track: Omit<Track, 'id' | 'createdAt'>) {
    const newTrack: Track = {
      ...track,
      id: generateId(),
      createdAt: Date.now(),
    };
    await addTrackToStorage(playlistId, newTrack);
    // 同步本地状态
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      playlist.tracks.push(newTrack);
      playlist.updatedAt = Date.now();
    }
    return newTrack;
  }

  // 删除音轨
  async function deleteTrack(playlistId: string, trackId: string) {
    await removeTrackFromStorage(playlistId, trackId);
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      playlist.tracks = playlist.tracks.filter((t) => t.id !== trackId);
      playlist.updatedAt = Date.now();
    }
    if (currentTrack.value?.id === trackId) {
      currentTrack.value = null;
      audioUrl.value = null;
    }
  }

  // 更新音轨
  async function updateTrack(
    playlistId: string,
    trackId: string,
    data: Partial<Omit<Track, 'id' | 'createdAt'>>
  ) {
    await updateTrackInStorage(playlistId, trackId, data);
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      const track = playlist.tracks.find((t) => t.id === trackId);
      if (track) Object.assign(track, data);
      playlist.updatedAt = Date.now();
    }
  }

  // 播放音轨 — 延迟获取 CDN URL
  async function playTrack(track: Track) {
    audioUrl.value = null;
    isStreamLoading.value = true;

    try {
      let cid = track.cid;
      // 旧数据可能没有 cid，重新获取
      if (!cid) {
        const videoInfo = await getVideoInfo(track.bvid);
        if (videoInfo) cid = videoInfo.cid;
      }

      if (!cid) {
        console.error('无法获取cid');
        isStreamLoading.value = false;
        return;
      }

      const streamUrl = await fetchPlayUrl(track.bvid, cid);
      if (streamUrl) {
        currentTrack.value = track;
        audioUrl.value = streamUrl;
      }
    } catch (error) {
      console.error('播放失败:', error);
    } finally {
      isStreamLoading.value = false;
    }
  }

  // 停止播放
  function stopTrack() {
    audioUrl.value = null;
    currentTrack.value = null;
  }

  // 下载音轨 — 重新下载+截取+编码为 MP3
  async function downloadTrack(track: Track): Promise<void> {
    let cid = track.cid;
    if (!cid) {
      const videoInfo = await getVideoInfo(track.bvid);
      cid = videoInfo?.cid ?? 0;
    }
    if (!cid) throw new Error('无法获取视频信息');

    const mp3Blob = await cutAudioFromStream(
      track.bvid,
      cid,
      track.startTime,
      track.endTime
    );
    downloadAudio(mp3Blob, `${track.name}.mp3`);
  }

  // 获取播放列表的音轨
  function getPlaylistTracks(playlistId: string): Track[] {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    return playlist?.tracks ?? [];
  }

  // 初始化
  async function init() {
    await loadPlaylists();
  }

  return {
    playlists,
    currentTrack,
    currentPlaylist,
    isLoading,
    audioUrl,
    isStreamLoading,
    allTracks,
    hasPlaylists,
    loadPlaylists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrack,
    deleteTrack,
    updateTrack,
    playTrack,
    stopTrack,
    downloadTrack,
    getPlaylistTracks,
    init,
  };
});
