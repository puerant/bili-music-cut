import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const PORT = process.env.PORT || 9721;
const VERSION = '1.0.0';

/**
 * 执行命令并等待完成
 */
function execAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, {
      maxBuffer: 100 * 1024 * 1024,
      ...options,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * 检查依赖是否已安装
 */
async function checkDependency(name) {
  try {
    // ffmpeg/ffprobe 使用 -version，其他工具使用 --version
    const versionFlag = name.startsWith('ff') ? '-version' : '--version';
    await execAsync(name, [versionFlag]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 查找临时目录中的音频文件（yt-dlp 下载后可能带有各种扩展名）
 */
async function findAudioFile(tempDir) {
  const files = await readdir(tempDir);
  // 优先匹配常见音频格式
  const audioExts = ['.m4a', '.opus', '.webm', '.mp3', '.wav', '.ogg', '.flac', '.aac'];
  for (const ext of audioExts) {
    const match = files.find(f => extname(f).toLowerCase() === ext);
    if (match) return join(tempDir, match);
  }
  // 没有匹配则返回第一个非隐藏文件
  const first = files.find(f => !f.startsWith('.'));
  return first ? join(tempDir, first) : null;
}

/**
 * HTTP 服务器
 */
const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/health
  if (req.method === 'GET' && req.url === '/api/health') {
    const ytOk = await checkDependency('yt-dlp');
    const ffOk = await checkDependency('ffmpeg');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      version: VERSION,
      dependencies: { 'yt-dlp': ytOk, ffmpeg: ffOk },
    }));
    return;
  }

  // POST /api/download-and-cut
  if (req.method === 'POST' && req.url === '/api/download-and-cut') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let params;
    try {
      params = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('无效的 JSON 请求');
      return;
    }

    const { bvid, startTime, endTime } = params;
    if (!bvid || startTime == null || endTime == null) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('缺少必要参数: bvid, startTime, endTime');
      return;
    }

    console.log(`[请求] 下载 ${bvid}，截取 ${startTime}s - ${endTime}s`);

    let tempDir;
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'bili-cut-'));

      // Step 1: 用 yt-dlp 下载最佳音质
      console.log(`[下载] yt-dlp 开始下载 ${bvid}...`);
      await execAsync('yt-dlp', [
        '--no-check-certificates',
        '-x',
        '--audio-format', 'best',
        '--audio-quality', '0',
        '-o', join(tempDir, 'audio.%(ext)s'),
        `https://www.bilibili.com/video/${bvid}`,
      ]);
      console.log(`[下载] yt-dlp 下载完成`);

      // 查找下载的音频文件
      const audioFile = await findAudioFile(tempDir);
      if (!audioFile) {
        throw new Error('下载完成但未找到音频文件');
      }
      console.log(`[处理] 找到音频文件: ${audioFile}`);

      // Step 2: 用 ffmpeg 截取并编码为 MP3，流式输出到 response
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });

      await new Promise((resolve, reject) => {
        const ffmpeg = execFile('ffmpeg', [
          '-i', audioFile,
          '-ss', String(startTime),
          '-to', String(endTime),
          '-vn',
          '-acodec', 'libmp3lame',
          '-ab', '192k',
          '-f', 'mp3',
          'pipe:1',
        ], { maxBuffer: 100 * 1024 * 1024 });

        ffmpeg.stdout.pipe(res);

        // 消费 stderr 防止阻塞
        let stderrData = '';
        ffmpeg.stderr.on('data', (d) => { stderrData += d; });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log(`[完成] ${bvid} 截取成功`);
            resolve();
          } else {
            console.error(`[错误] ffmpeg 退出码 ${code}: ${stderrData.slice(-200)}`);
            reject(new Error(`ffmpeg 退出码 ${code}`));
          }
        });

        ffmpeg.on('error', reject);
      });

    } catch (err) {
      console.error(`[错误] ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(err.message);
    } finally {
      // 清理临时文件
      if (tempDir) {
        try { await rm(tempDir, { recursive: true, force: true }); } catch {}
      }
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[B站音乐截取] 本地服务已启动 http://localhost:${PORT}`);
  console.log(`[B站音乐截取] API 端点:`);
  console.log(`  GET  /api/health          - 健康检查`);
  console.log(`  POST /api/download-and-cut - 下载并截取音频`);
  // 启动时检查依赖
  checkDependency('yt-dlp').then(ok => {
    if (!ok) console.warn(`[警告] yt-dlp 未安装或不在 PATH 中，请先安装: https://github.com/yt-dlp/yt-dlp`);
  });
  checkDependency('ffmpeg').then(ok => {
    if (!ok) console.warn(`[警告] ffmpeg 未安装或不在 PATH 中，请先安装: https://ffmpeg.org/download.html`);
  });
});
