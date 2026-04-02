import Dexie, { type EntityTable } from 'dexie';

// 专辑表
export interface Album {
  id: string;
  name: string;
  cover?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

// 音轨表
export interface Track {
  id: string;
  albumId?: string;
  name: string;
  sourceUrl: string;
  sourceBvid: string;
  sourceCid: number;
  sourceTitle: string;
  sourceCover?: string;
  cover?: string;
  duration: number;
  startTime: number;
  endTime: number;
  createdAt: number;
}

// 数据库定义
const db = new Dexie('BiliMusicCutDB') as Dexie & {
  albums: EntityTable<Album, 'id'>;
  tracks: EntityTable<Track, 'id'>;
};

db.version(1).stores({
  albums: 'id, name, createdAt, updatedAt',
  tracks: 'id, albumId, name, sourceBvid, createdAt',
  audioData: 'id',
});

db.version(2).stores({
  albums: 'id, name, createdAt, updatedAt',
  tracks: 'id, albumId, name, sourceBvid, createdAt',
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
    track: Omit<Track, 'id' | 'createdAt'>
  ): Promise<Track> {
    const id = generateId();
    const newTrack: Track = {
      ...track,
      id,
      createdAt: Date.now(),
    };

    await db.tracks.add(newTrack);
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

  async update(id: string, data: Partial<Omit<Track, 'id' | 'createdAt'>>): Promise<void> {
    await db.tracks.update(id, data);
  },

  async delete(id: string): Promise<void> {
    await db.tracks.delete(id);
  },
};

export { db };
