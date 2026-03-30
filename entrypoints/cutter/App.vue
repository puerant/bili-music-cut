<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  NTabs,
  NTabPane,
  NButton,
  NEmpty,
  NSpin,
  NModal,
  NInput,
  NIcon,
  NInputGroup,
  NSlider,
  useMessage,
} from 'naive-ui';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOutlined,
  SoundOutlined,
  SearchOutlined,
  DownloadOutlined,
} from '@vicons/antd';
import { useMusicStore } from '@/stores/index';
import { formatTime, getVideoInfo } from '@/lib/bilibili';
import { downloadAudio } from '@/lib/audio-cutter';
import { trackDb } from '@/lib/db';
import type { Album, Track } from '@/lib/db';
import type { BilibiliVideoInfo } from '@/lib/bilibili';
import CutterContent from './CutterContent.vue';
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <CutterContent />
    </n-message-provider>
  </n-config-provider>
</template>
