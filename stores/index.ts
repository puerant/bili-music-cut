import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { albumDb, trackDb, type Album, type Track } from '@/lib/db';
import { getAudioStreamDirectUrl, getVideoInfo } from '@/lib/bilibili';
import { cutAudioFromStream, downloadAudio } from '@/lib/audio-cutter';

export const useMusicStore = defineStore('music', () => {
  // 状态
  const albums = ref<Album[]>([]);
  const tracks = ref<Track[]>([]);
  const currentTrack = ref<Track | null>(null);
  const currentAlbum = ref<Album | null>(null);
  const isLoading = ref(false);
  const audioUrl = ref<string | null>(null);
  const isStreamLoading = ref(false);

  // 计算属性
  const tracksWithoutAlbum = computed(() => {
    return tracks.value.filter((t) => !t.albumId);
  });

  // 获取所有专辑
  async function loadAlbums() {
    isLoading.value = true;
    try {
      albums.value = await albumDb.getAll();
    } finally {
      isLoading.value = false;
    }
  }

  // 获取所有音轨
  async function loadTracks() {
    isLoading.value = true;
    try {
      tracks.value = await trackDb.getAll();
    } finally {
      isLoading.value = false;
    }
  }

  // 创建专辑
  async function createAlbum(name: string, description?: string, cover?: string) {
    const album = await albumDb.create({ name, description, cover });
    albums.value.unshift(album);
    return album;
  }

  // 更新专辑
  async function updateAlbum(id: string, data: Partial<Omit<Album, 'id' | 'createdAt'>>) {
    await albumDb.update(id, data);
    const index = albums.value.findIndex((a) => a.id === id);
    if (index !== -1) {
      albums.value[index] = { ...albums.value[index], ...data, updatedAt: Date.now() };
    }
  }

  // 删除专辑
  async function deleteAlbum(id: string) {
    await albumDb.delete(id);
    albums.value = albums.value.filter((a) => a.id !== id);
    tracks.value = tracks.value.filter((t) => t.albumId !== id);
  }

  // 删除音轨
  async function deleteTrack(id: string) {
    await trackDb.delete(id);
    tracks.value = tracks.value.filter((t) => t.id !== id);
    if (currentTrack.value?.id === id) {
      currentTrack.value = null;
      audioUrl.value = null;
    }
  }

  // 更新音轨
  async function updateTrack(id: string, data: Partial<Omit<Track, 'id' | 'createdAt'>>) {
    await trackDb.update(id, data);
    const index = tracks.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      tracks.value[index] = { ...tracks.value[index], ...data };
    }
  }

  // 播放音轨 - 动态获取流URL
  async function playTrack(track: Track) {
    audioUrl.value = null;
    isStreamLoading.value = true;

    try {
      let cid = track.sourceCid;
      // 旧数据可能没有 cid，重新获取
      if (!cid) {
        const videoInfo = await getVideoInfo(track.sourceBvid);
        if (videoInfo) {
          cid = videoInfo.cid;
          await trackDb.update(track.id, { sourceCid: cid } as any);
          const idx = tracks.value.findIndex(t => t.id === track.id);
          if (idx !== -1) tracks.value[idx].sourceCid = cid;
        }
      }

      if (!cid) {
        console.error('无法获取cid');
        isStreamLoading.value = false;
        return;
      }

      const streamUrl = await getAudioStreamDirectUrl(track.sourceBvid, cid);
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

  // 获取专辑的音轨
  function getAlbumTracks(albumId: string): Track[] {
    return tracks.value.filter((t) => t.albumId === albumId);
  }

  // 下载音轨 - 动态获取 + 截取 + 编码为 MP3
  async function downloadTrack(track: Track): Promise<void> {
    let cid = track.sourceCid;
    if (!cid) {
      const videoInfo = await getVideoInfo(track.sourceBvid);
      cid = videoInfo?.cid ?? 0;
    }
    if (!cid) throw new Error('无法获取视频信息');

    const mp3Blob = await cutAudioFromStream(
      track.sourceBvid,
      cid,
      track.startTime,
      track.endTime
    );
    downloadAudio(mp3Blob, `${track.name}.mp3`);
  }

  // 初始化
  async function init() {
    await Promise.all([loadAlbums(), loadTracks()]);
  }

  return {
    albums,
    tracks,
    currentTrack,
    currentAlbum,
    isLoading,
    audioUrl,
    isStreamLoading,
    tracksWithoutAlbum,
    loadAlbums,
    loadTracks,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    deleteTrack,
    updateTrack,
    playTrack,
    stopTrack,
    getAlbumTracks,
    downloadTrack,
    init,
  };
});
