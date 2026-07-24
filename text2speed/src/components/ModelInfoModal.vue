<script setup>
import { onMounted, reactive, ref } from 'vue'
import { listVoices, fetchModelSpecs } from '../lib/data-source.js'

const props = defineProps({
  lang: { type: String, required: true },
  selected: { type: String, default: '' },
})
const emit = defineEmits(['close', 'choose'])

const voices = ref([])
const specs = reactive({}) // name -> { sampleRate, speakers, sizeBytes }
const loading = ref(true)

onMounted(async () => {
  voices.value = await listVoices(props.lang)
  loading.value = false
  // Nạp thông số từng model song song, hiện dần
  voices.value.forEach(async (v) => {
    specs[v.name] = await fetchModelSpecs(props.lang, v.name)
  })
})

const QUALITY_LABEL = {
  x_low: { text: 'Rất thấp', class: 'text-gray-500 dark:text-gray-400' },
  low: { text: 'Thấp', class: 'text-amber-600 dark:text-amber-400' },
  medium: { text: 'Trung bình', class: 'text-blue-600 dark:text-blue-400' },
  high: { text: 'Cao', class: 'text-green-600 dark:text-green-400' },
}

const formatMB = (bytes) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '—')
const formatRate = (hz) => (hz ? `${(hz / 1000).toFixed(hz % 1000 ? 1 : 0)} kHz` : '—')

function choose(name) {
  emit('choose', name)
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700"
    >
      <div class="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">So sánh các model</h2>
          <p class="text-sm text-muted-foreground mt-0.5">Bấm một dòng để chọn model đó.</p>
        </div>
        <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none" @click="emit('close')">
          ✕
        </button>
      </div>

      <div class="overflow-y-auto thin-scroll p-5 space-y-4">
        <p v-if="loading" class="text-sm text-muted-foreground">Đang tải danh sách…</p>
        <p v-else-if="!voices.length" class="text-sm text-muted-foreground">Ngôn ngữ này chưa có model nào.</p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th class="py-2 pr-3 text-left font-medium">Model</th>
                <th class="py-2 px-2 text-left font-medium">Chất lượng</th>
                <th class="py-2 px-2 text-left font-medium whitespace-nowrap">Tần số</th>
                <th class="py-2 px-2 text-left font-medium">Giọng</th>
                <th class="py-2 pl-2 text-left font-medium whitespace-nowrap">Dung lượng</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="v in voices"
                :key="v.name"
                class="border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                :class="v.name === selected ? 'bg-blue-50/70 dark:bg-blue-900/20' : ''"
                @click="choose(v.name)"
              >
                <td class="py-2.5 pr-3 align-top">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-medium text-gray-800 dark:text-gray-200">{{ v.name }}</span>
                    <span
                      v-if="v.recommended"
                      class="px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                    >
                      NÊN DÙNG
                    </span>
                  </div>
                  <p v-if="v.note" class="text-xs text-muted-foreground mt-0.5">{{ v.note }}</p>
                </td>
                <td class="py-2.5 px-2 align-top whitespace-nowrap">
                  <span v-if="v.quality" :class="QUALITY_LABEL[v.quality]?.class">
                    {{ QUALITY_LABEL[v.quality]?.text || v.quality }}
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="py-2.5 px-2 align-top whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {{ formatRate(specs[v.name]?.sampleRate) }}
                </td>
                <td class="py-2.5 px-2 align-top whitespace-nowrap text-gray-600 dark:text-gray-300">
                  <span v-if="specs[v.name]?.speakers > 1" class="text-purple-600 dark:text-purple-400">
                    {{ specs[v.name].speakers }} giọng
                  </span>
                  <span v-else>1</span>
                </td>
                <td class="py-2.5 pl-2 align-top whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {{ formatMB(specs[v.name]?.sizeBytes) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Hướng dẫn chọn -->
        <div class="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p class="font-medium text-gray-800 dark:text-gray-200">Nên chọn model nào?</p>
          <ul class="space-y-1.5 list-disc pl-4">
            <li><strong>Chất lượng</strong> cao hơn (Cao → Rất thấp) nghe tự nhiên hơn, nhưng file nặng và tải lâu hơn.</li>
            <li><strong>Tần số</strong> 22 kHz trong trẻo hơn 16 kHz, rõ nhất khi nghe bằng tai nghe.</li>
            <li><strong>Nhiều giọng</strong>: model đa người nói — dùng ô “Giọng” để đổi hẳn người đọc.</li>
            <li>Model chỉ tải <strong>một lần</strong> rồi lưu trong trình duyệt, lần sau chuyển đổi là tức thì.</li>
            <li>Chưa biết chọn gì thì lấy giọng gắn nhãn <span class="text-green-600 dark:text-green-400 font-medium">NÊN DÙNG</span>.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
