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

export const useMusicStore = defineStore('music', () => {
  const playlists = ref<Playlist[]>([]);
  const currentTrack = ref<Track | null>(null);
  const currentPlaylist = ref<Playlist | null>(null);
  const isLoading = ref(false);
  const audioUrl = ref<string | null>(null);
  const isStreamLoading = ref(false);

  const allTracks = computed(() => {
    return playlists.value.flatMap((p) =>
      p.tracks.map((t) => ({ ...t, playlistId: p.id, playlistTitle: p.title }))
    );
  });

  const hasPlaylists = computed(() => playlists.value.length > 0);

  async function loadPlaylists() {
    isLoading.value = true;
    try {
      playlists.value = await loadPlaylistsFromStorage();
    } finally {
      isLoading.value = false;
    }
  }

  async function createPlaylist(title: string, cover?: string) {
    const playlist = await createPlaylistInStorage(title, cover);
    playlists.value.unshift(playlist);
    return playlist;
  }

  async function updatePlaylist(
    id: string,
    data: Partial<Pick<Playlist, 'title' | 'cover'>>
  ) {
    const playlist = playlists.value.find((p) => p.id === id);
    if (!playlist) return;
    Object.assign(playlist, data, { updatedAt: Date.now() });
    await savePlaylist(playlist);
  }

  async function deletePlaylist(id: string) {
    await deletePlaylistFromStorage(id);
    playlists.value = playlists.value.filter((p) => p.id !== id);
  }

  async function addTrack(playlistId: string, track: Omit<Track, 'id' | 'createdAt'>) {
    const newTrack: Track = {
      ...track,
      id: generateId(),
      createdAt: Date.now(),
    };
    await addTrackToStorage(playlistId, newTrack);
    const playlist = playlists.value.find((p) => p.id === playlistId);
    if (playlist) {
      playlist.tracks.push(newTrack);
      playlist.updatedAt = Date.now();
    }
    return newTrack;
  }

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

  function stopTrack() {
    audioUrl.value = null;
    currentTrack.value = null;
  }

  // 下载音轨 — 获取音频流，截取时间段，通过 MediaRecorder 录制为 webm
  async function downloadTrack(track: Track): Promise<void> {
    let cid = track.cid;
    if (!cid) {
      const videoInfo = await getVideoInfo(track.bvid);
      cid = videoInfo?.cid ?? 0;
    }
    if (!cid) throw new Error('无法获取视频信息');

    const streamUrl = await fetchPlayUrl(track.bvid, cid);
    if (!streamUrl) throw new Error('无法获取音频流');

    // 使用 AudioContext + OfflineAudioChain 进行截取
    const response = await fetch(streamUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(track.startTime * sampleRate);
    const endSample = Math.floor(track.endTime * sampleRate);
    const length = Math.max(0, endSample - startSample);

    if (length <= 0) throw new Error('截取时间范围无效');

    const newBuffer = audioContext.createBuffer(numChannels, length, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      const source = audioBuffer.getChannelData(ch);
      const dest = newBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        dest[i] = source[startSample + i];
      }
    }

    // 使用 MediaStreamDestination + MediaRecorder 导出
    const dest = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    source.buffer = newBuffer;
    source.connect(dest);
    source.start();

    const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
    const chunks: Blob[] = [];

    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.name}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      };
      recorder.onerror = (e) => reject(e);
      recorder.start();
      source.onended = () => {
        recorder.stop();
      };
    });
  }

  function getPlaylistTracks(playlistId: string): Track[] {
    const playlist = playlists.value.find((p) => p.id === playlistId);
    return playlist?.tracks ?? [];
  }

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
