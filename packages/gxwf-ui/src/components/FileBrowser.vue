<template>
  <!-- Tree's built-in :loading prop handles the spinner; no extra v-if needed. -->
  <Tree
    :value="treeNodes"
    :loading="loading"
    selectionMode="single"
    @node-select="onNodeSelect"
    @node-expand="onNodeExpand"
  />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import Tree from "primevue/tree";
import type { TreeNode } from "primevue/treenode";
import type { components } from "@galaxy-tool-util/gxwf-client";
import { useContents } from "../composables/useContents";

type ContentsModel = components["schemas"]["ContentsModel-Output"];

const props = defineProps<{
  root: ContentsModel | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [path: string];
}>();

const { fetchPath } = useContents();

// Build a tree node. Directories whose children haven't been fetched yet
// (content === null) get `leaf: false` with no children — PrimeVue shows an
// expand toggle and fires `@node-expand` when the user clicks it.
function contentsToNode(item: ContentsModel): TreeNode {
  const isDir = item.type === "directory";
  const hasChildren = isDir && Array.isArray(item.content);
  return {
    key: item.path,
    label: item.name,
    data: item,
    icon: isDir ? "pi pi-folder" : "pi pi-file",
    children: hasChildren ? (item.content as ContentsModel[]).map(contentsToNode) : undefined,
    leaf: !isDir,
  };
}

const treeNodes = ref<TreeNode[]>([]);

watch(
  () => props.root,
  (root) => {
    if (!root) {
      treeNodes.value = [];
    } else if (Array.isArray(root.content)) {
      treeNodes.value = (root.content as ContentsModel[]).map(contentsToNode);
    } else {
      treeNodes.value = [contentsToNode(root)];
    }
  },
  { immediate: true },
);

function onNodeSelect(node: TreeNode) {
  // Only emit for files, not directories.
  if (node.leaf && typeof node.key === "string") {
    emit("select", node.key);
  }
}

async function onNodeExpand(node: TreeNode) {
  if (node.leaf) return;
  if (node.children && node.children.length > 0) return;
  if (typeof node.key !== "string") return;
  node.loading = true;
  try {
    const fetched = await fetchPath(node.key);
    if (fetched && Array.isArray(fetched.content)) {
      node.children = (fetched.content as ContentsModel[]).map(contentsToNode);
      node.data = fetched;
    }
  } finally {
    node.loading = false;
  }
}
</script>
