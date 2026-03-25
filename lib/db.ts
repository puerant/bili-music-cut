import Dexie, { type EntityTable } from 'dexie';

// 专辑表
export interface Album {
  id: string;
  name: string;
  cover?: string; // Base64 或 Blob URL
  description?: string;
  createdAt: number;
  updatedAt: number;
}

// 音轨表
export interface Track {
  id: string;
  albumId?: string; // 所属专辑ID
  name: string;
  sourceUrl: string; // 原视频链接
  sourceBvid: string; // 原视频BV号
  sourceTitle: string; // 原视频标题
  sourceCover?: string; // 原视频封面
  cover?: string; // 自定义封面
  audioData?: Blob; // 音频数据 (存储在单独表)
  duration: number; // 时长(秒)
  startTime: number; // 截取开始时间(秒)
  endTime: number; // 截取结束时间(秒)
  createdAt: number;
}

// 音频数据表 (分离存储大文件)
export interface AudioData {
  id: string; // 与Track.id相同
  data: Blob;
}

// 数据库定义
const db = new Dexie('BiliMusicCutDB') as Dexie & {
  albums: EntityTable<Album, 'id'>;
  tracks: EntityTable<Track, 'id'>;
  audioData: EntityTable<AudioData, 'id'>;
};

db.version(1).stores({
  albums: 'id, name, createdAt, updatedAt',
  tracks: 'id, albumId, name, sourceBvid, createdAt',
  audioData: 'id',
});

// 生成唯一ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// 专辑操作
export const albumDb = {
  async create(album: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
    const now = Date.now();
    const newAlbum: Album = {
      ...album,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.albums.add(newAlbum);
    return newAlbum;
  },

  async getAll(): Promise<Album[]> {
    return db.albums.orderBy('updatedAt').reverse().toArray();
  },

  async getById(id: string): Promise<Album | undefined> {
    return db.albums.get(id);
  },

  async update(id: string, data: Partial<Omit<Album, 'id' | 'createdAt'>>): Promise<void> {
    await db.albums.update(id, { ...data, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    // 删除专辑下所有音轨
    const tracks = await db.tracks.where('albumId').equals(id).toArray();
    for (const track of tracks) {
      await trackDb.delete(track.id);
    }
    await db.albums.delete(id);
  },
};

// 音轨操作
export const trackDb = {
  async create(
    track: Omit<Track, 'id' | 'createdAt'>,
    audioBlob: Blob
  ): Promise<Track> {
    const id = generateId();
    const newTrack: Track = {
      ...track,
      id,
      createdAt: Date.now(),
    };

    await db.tracks.add(newTrack);
    await db.audioData.add({ id, data: audioBlob });

    return newTrack;
  },

  async getAll(): Promise<Track[]> {
    return db.tracks.orderBy('createdAt').reverse().toArray();
  },

  async getByAlbumId(albumId: string): Promise<Track[]> {
    return db.tracks.where('albumId').equals(albumId).toArray();
  },

  async getById(id: string): Promise<Track | undefined> {
    return db.tracks.get(id);
  },

  async getAudioData(id: string): Promise<Blob | undefined> {
    const audio = await db.audioData.get(id);
    return audio?.data;
  },

  async update(id: string, data: Partial<Omit<Track, 'id' | 'createdAt'>>): Promise<void> {
    await db.tracks.update(id, data);
  },

  async delete(id: string): Promise<void> {
    await db.tracks.delete(id);
    await db.audioData.delete(id);
  },

  async getAudioUrl(id: string): Promise<string | null> {
    const audio = await db.audioData.get(id);
    if (audio) {
      return URL.createObjectURL(audio.data);
    }
    return null;
  },

  async revokeAudioUrl(url: string): Promise<void> {
    URL.revokeObjectURL(url);
  },
};

export { db };
