<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MAX_LAYERS, PRESET_COLORS } from '../core/constants'
import type { QuantizeMode } from '../core/colorQuantize'
import type { ImageImportResult } from '../core/imageImport'
import { useEditorStore } from '../editor/useEditorStore'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useEditorStore()

const file = ref<File | null>(null)
const objectUrl = ref('')
const mode = ref<QuantizeMode>('preset')
const maxColors = ref(8)
const importing = ref(false)
const error = ref('')
const inputKey = ref(0)

const layerCount = computed(() => store.activeFrame?.layers.length ?? 0)
const layerFull = computed(() => layerCount.value >= MAX_LAYERS)
const canvasSize = computed(() => store.canvasSize)

const errorText: Record<string, string> = {
  'no-project': '没有可用的项目',
  'layer-limit': `图层已达上限（${MAX_LAYERS} 层），请先删除或合并图层`,
  'invalid-image': '无法识别该文件，请选择有效的图片（PNG / JPG / WebP / GIF 等）',
  'import-failed': '图片处理失败，请换一张图片重试',
}

function reset() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
  file.value = null
  mode.value = 'preset'
  maxColors.value = 8
  importing.value = false
  error.value = ''
}

watch(
  () => props.open,
  (open) => {
    reset()
    if (open) inputKey.value += 1
  },
)

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const selected = target.files?.[0]
  error.value = ''
  if (!selected) return
  if (!selected.type.startsWith('image/')) {
    file.value = null
    error.value = errorText['invalid-image']!
    return
  }
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  file.value = selected
  objectUrl.value = URL.createObjectURL(selected)
}

async function confirm() {
  if (!file.value || importing.value || layerFull.value) return
  importing.value = true
  error.value = ''
  const result: ImageImportResult = await store.importImage(file.value, {
    mode: mode.value,
    presetPalette: PRESET_COLORS,
    maxColors: Math.max(2, Math.min(24, maxColors.value)),
  })
  importing.value = false
  if (result.ok) {
    emit('close')
  } else {
    error.value = errorText[result.reason ?? 'import-failed']!
  }
}

function close() {
  if (importing.value) return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-label="导入图片">
        <header class="modal-header">
          <h3>导入图片为新图层</h3>
          <button type="button" class="icon" :disabled="importing" @click="close">✕</button>
        </header>

        <p class="hint">
          图片将拉伸填满 {{ canvasSize }}×{{ canvasSize }} 画布（不保持原比例），量化后写入当前帧的新图层，不影响其他图层与帧。
        </p>

        <p v-if="layerFull" class="error">
          图层已达上限（{{ MAX_LAYERS }} 层），无法继续导入。
        </p>

        <div class="field">
          <label class="field-label">选择图片</label>
          <input
            :key="inputKey"
            type="file"
            accept="image/*"
            :disabled="importing || layerFull"
            @change="onFileChange"
          />
        </div>

        <div v-if="objectUrl" class="preview-block">
          <img :src="objectUrl" alt="导入图片预览" class="preview-img" />
          <span class="hint">拉伸后铺满画布</span>
        </div>

        <fieldset class="field" :disabled="!file || importing">
          <legend class="field-label">颜色归并</legend>
          <label class="radio">
            <input v-model="mode" type="radio" value="preset" />
            预设调色板（{{ PRESET_COLORS.length }} 色就近映射）
          </label>
          <label class="radio">
            <input v-model="mode" type="radio" value="auto" />
            自动提取主色
          </label>
          <div v-if="mode === 'auto'" class="max-colors">
            主色数量
            <input v-model.number="maxColors" type="number" min="2" max="24" step="1" />
            <span class="hint">（2–24，超出数量的像素就近映射）</span>
          </div>
        </fieldset>

        <p v-if="error" class="error">{{ error }}</p>

        <footer class="modal-actions">
          <button type="button" class="action" :disabled="importing" @click="close">取消</button>
          <button
            type="button"
            class="action primary"
            :disabled="!file || importing || layerFull"
            @click="confirm"
          >
            {{ importing ? '导入中…' : '导入到新图层' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  width: min(440px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.field {
  border: none;
  padding: 0;
  margin: 0.75rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-size: 0.8rem;
  color: var(--muted);
  padding: 0;
}

.field input[type='file'] {
  font-size: 0.8rem;
  color: var(--muted);
}

.radio {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  padding: 0.2rem 0;
}

.max-colors {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  margin-top: 0.35rem;
  flex-wrap: wrap;
}

.max-colors input {
  width: 4rem;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 0.3rem;
}

.preview-block {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.preview-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  image-rendering: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: repeating-conic-gradient(#2a2d35 0% 25%, #24272e 0% 50%) 0 0 / 12px 12px;
}

.error {
  margin: 0.75rem 0 0;
  color: var(--danger);
  font-size: 0.8rem;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.modal-actions .action {
  margin-top: 0;
}

fieldset:disabled {
  opacity: 0.5;
}
</style>
