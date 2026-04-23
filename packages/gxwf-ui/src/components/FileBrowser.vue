<template>
  <div class="file-browser">
    <Tree
      :value="treeNodes"
      :loading="loading"
      :filter="true"
      filterMode="lenient"
      filterPlaceholder="Filter files…"
      selectionMode="single"
      :expandedKeys="props.expandedKeys"
      class="file-browser-tree"
      @node-select="onNodeSelect"
      @node-expand="onNodeExpand"
      @update:expandedKeys="(keys: Record<string, boolean>) => emit('update:expandedKeys', keys)"
    >
      <template #empty>
        <p v-if="loading" class="browser-empty">Loading…</p>
        <p v-else-if="treeNodes.length === 0" class="browser-empty">
          <i class="pi pi-folder-open" /> No files in this workspace.
        </p>
        <p v-else class="browser-empty">No files match the filter.</p>
      </template>
    </Tree>
  </div>
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
  expandedKeys?: Record<string, boolean>;
}>();

const emit = defineEmits<{
  select: [path: string];
  "update:expandedKeys": [keys: Record<string, boolean>];
}>();

const { fetchPath } = useContents();

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

<style scoped>
.file-browser {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.file-browser-tree {
  flex: 1;
  min-height: 0;
}

.browser-empty {
  margin: var(--gx-sp-3) 0;
  padding: 0 var(--gx-sp-2);
  color: var(--p-text-color-secondary, #6c757d);
  font-size: var(--gx-fs-sm);
  font-style: italic;
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
}
</style>
