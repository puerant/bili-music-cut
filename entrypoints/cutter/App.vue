<script lang="ts" setup>
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui';
import CutterContent from './CutterContent.vue';
</script>

<template>
  <n-config-provider :theme="darkTheme">
    <n-message-provider>
      <CutterContent />
    </n-message-provider>
  </n-config-provider>
</template>
