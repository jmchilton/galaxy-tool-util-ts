<template>
  <!-- Tree's built-in :loading prop handles the spinner; no extra v-if needed. -->
  <Tree :value="treeNodes" :loading="loading" selectionMode="single" @node-select="onNodeSelect" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import Tree from "primevue/tree";
import type { TreeNode } from "primevue/treenode";
import type { components } from "@galaxy-tool-util/gxwf-client";

type ContentsModel = components["schemas"]["ContentsModel-Output"];

const props = defineProps<{
  root: ContentsModel | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [path: string];
}>();

function contentsToNode(item: ContentsModel): TreeNode {
  const isDir = item.type === "directory";
  const children =
    isDir && Array.isArray(item.content)
      ? (item.content as ContentsModel[]).map(contentsToNode)
      : undefined;
  return {
    key: item.path,
    label: item.name,
    data: item,
    icon: isDir ? "pi pi-folder" : "pi pi-file",
    children,
    leaf: !isDir,
  };
}

function onNodeSelect(node: TreeNode) {
  // Only emit for files, not directories.
  if (node.leaf && typeof node.key === "string") {
    emit("select", node.key);
  }
}

const treeNodes = computed<TreeNode[]>(() => {
  if (!props.root) return [];
  if (Array.isArray(props.root.content)) {
    return (props.root.content as ContentsModel[]).map(contentsToNode);
  }
  return [contentsToNode(props.root)];
});
</script>
