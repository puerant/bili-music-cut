<script lang="ts" setup>
import { ref, provide } from 'vue';
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui';
import CutterContent from './CutterContent.vue';

const isDark = ref(true);

function toggleTheme() {
  isDark.value = !isDark.value;
}

provide('toggleTheme', toggleTheme);
provide('isDark', isDark);
</script>

<template>
  <n-config-provider :theme="isDark ? darkTheme : undefined">
    <n-message-provider>
      <CutterContent />
    </n-message-provider>
  </n-config-provider>
</template>
