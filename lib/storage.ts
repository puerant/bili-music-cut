// ==================== 数据模型 ====================

export interface Track {
  id: string;
  name: string;
  bvid: string;
  cid: number;
  startTime: number;
  endTime: number;
  duration: number;
  sourceTitle: string;
  upName?: string;
  sourceCover?: string;
  cover?: string;
  createdAt: number;
}

export interface Playlist {
  id: string;
  title: string;
  cover?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export interface LastPlayed {
  trackId: string;
  playlistId: string;
  position: number;
}

// ==================== localStorage 封装 ====================

const STORAGE_KEY_PLAYLISTS = 'bili-music-cut:playlists';
const STORAGE_KEY_LAST_PLAYED = 'bili-music-cut:lastPlayed';

// ==================== 工具函数 ====================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ==================== Playlist CRUD ====================

export async function getPlaylists(): Promise<Playlist[]> {
  const raw = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
  return raw ? JSON.parse(raw) : [];
}

export async function getPlaylist(id: string): Promise<Playlist | undefined> {
  const playlists = await getPlaylists();
  return playlists.find((p) => p.id === id);
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const playlists = await getPlaylists();
  const idx = playlists.findIndex((p) => p.id === playlist.id);
  if (idx !== -1) {
    playlists[idx] = { ...playlist, updatedAt: Date.now() };
  } else {
    playlists.unshift(playlist);
  }
  localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
}

export async function createPlaylist(title: string, cover?: string): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: generateId(),
    title,
    cover,
    tracks: [],
    createdAt: now,
    updatedAt: now,
  };
  await savePlaylist(playlist);
  return playlist;
}

export async function deletePlaylist(id: string): Promise<void> {
  const playlists = await getPlaylists();
  localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists.filter((p) => p.id !== id)));
}

export async function addTrackToPlaylist(playlistId: string, track: Track): Promise<void> {
  const playlists = await getPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) throw new Error('播放列表不存在');
  playlist.tracks.push(track);
  playlist.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const playlists = await getPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  playlist.tracks = playlist.tracks.filter((t) => t.id !== trackId);
  playlist.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
}

export async function updateTrackInPlaylist(
  playlistId: string,
  trackId: string,
  data: Partial<Omit<Track, 'id' | 'createdAt'>>
): Promise<void> {
  const playlists = await getPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  const track = playlist.tracks.find((t) => t.id === trackId);
  if (!track) return;
  Object.assign(track, data);
  playlist.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
}

// ==================== LastPlayed ====================

export async function getLastPlayed(): Promise<LastPlayed | null> {
  const raw = localStorage.getItem(STORAGE_KEY_LAST_PLAYED);
  return raw ? JSON.parse(raw) : null;
}

export async function saveLastPlayed(data: LastPlayed): Promise<void> {
  localStorage.setItem(STORAGE_KEY_LAST_PLAYED, JSON.stringify(data));
}

export async function clearLastPlayed(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY_LAST_PLAYED);
}
