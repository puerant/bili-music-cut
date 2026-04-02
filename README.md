# B站音乐截取 / Bili Music Cut

一个基于浏览器扩展的B站视频音频截取工具，可以从B站视频中截取音频片段并管理为个人歌单。

## 项目简介

- 本质上是一个B站第三方**音频截取与播放工具**，以 Chrome 浏览器扩展形式展现
- 目的是想让视频**轻量化**为音频片段，方便收藏、截取、分类和下载
- 支持通过 BV 号搜索视频，自由选择截取时间段
- 截取前可**预听**片段效果，确认无误后再添加到歌单
- 支持歌单管理（创建、编辑、删除）、音轨编辑
- 支持歌单数据的**导入/导出**，方便在不同设备间同步
- 支持亮色/暗色主题切换

## 功能特性

| 功能 | 描述 |
|------|------|
| BV号搜索 | 输入BV号获取视频信息，选择时间段截取 |
| 音频预听 | 截取前可预听选定片段 |
| 歌单管理 | 创建、编辑、删除歌单 |
| 音轨编辑 | 修改歌曲名称、截取时间范围 |
| 音频播放 | 在线播放截取片段，支持进度控制 |
| 音频下载 | 将截取片段导出为 webm 文件 |
| 导入/导出 | 歌单数据导出为 JSON，支持跨设备同步 |
| 主题切换 | 亮色/暗色双主题 |

## 安装

### 离线安装

1. 下载最新的 build 文件（或自行构建）
2. 解压文件夹
3. 打开 Chrome，进入 `chrome://extensions/`
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 打包 zip
pnpm zip

# 类型检查
pnpm compile
```

## 项目技术栈

- Chrome Extension (Manifest V3) + WXT
- Vue 3 + TypeScript
- Naive UI 组件库
- Pinia 状态管理
- HTML5 Audio API
- Bilibili CDN 音频流
- declarativeNetRequest 注入 Referer 头

## 项目结构

```
bili-music-cut/
├── entrypoints/
│   ├── background.ts          # 扩展后台脚本
│   └── cutter/
│       ├── App.vue            # 主应用入口
│       └── CutterContent.vue  # 主界面组件
├── lib/
│   ├── bilibili.ts            # B站API与音频流处理
│   └── storage.ts             # 数据持久化（localStorage）
├── stores/
│   └── index.ts               # Pinia 状态管理
├── public/
│   ├── icon/                  # 扩展图标
│   └── rules.json             # declarativeNetRequest 规则
└── wxt.config.ts              # WXT 扩展配置
```

## 致谢

- [azusa-player](https://github.com/kenmingwang/azusa-player) - 参考了其交互形式与部分设计思路

## 免责声明

本项目仅用于技术学习与交流，数据来源于B站公开接口。请尊重版权，支持正版。
