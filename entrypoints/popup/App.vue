<script lang="ts" setup>
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import PopupLauncher from './PopupLauncher.vue';
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <PopupLauncher />
    </n-message-provider>
  </n-config-provider>
</template>
