import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { albumDb, trackDb, type Album, type Track } from '@/lib/db';

export const useMusicStore = defineStore('music', () => {
  // 状态
  const albums = ref<Album[]>([]);
  const tracks = ref<Track[]>([]);
  const currentTrack = ref<Track | null>(null);
  const currentAlbum = ref<Album | null>(null);
  const isLoading = ref(false);
  const audioUrl = ref<string | null>(null);

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

  // 播放音轨
  async function playTrack(track: Track) {
    // 释放之前的URL
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
    }

    const url = await trackDb.getAudioUrl(track.id);
    if (url) {
      currentTrack.value = track;
      audioUrl.value = url;
    }
  }

  // 停止播放
  function stopTrack() {
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
      audioUrl.value = null;
    }
    currentTrack.value = null;
  }

  // 获取专辑的音轨
  function getAlbumTracks(albumId: string): Track[] {
    return tracks.value.filter((t) => t.albumId === albumId);
  }

  // 获取音轨音频数据
  async function getTrackAudio(id: string): Promise<Blob | undefined> {
    return trackDb.getAudioData(id);
  }

  // 初始化
  async function init() {
    await Promise.all([loadAlbums(), loadTracks()]);
  }

  return {
    // 状态
    albums,
    tracks,
    currentTrack,
    currentAlbum,
    isLoading,
    audioUrl,
    // 计算属性
    tracksWithoutAlbum,
    // 方法
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
    getTrackAudio,
    init,
  };
});
